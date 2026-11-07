import * as vscode from 'vscode';

const EFFECTIVE_RE = /[^\s\u0000-\u001f\u007f-\u009f]/gu;
const CHINESE_RE = /[\u4e00-\u9fff]/gu;
const ENGLISH_RE = /[A-Za-z]/g;

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md']);

export interface DocumentCounts {
  total: number;
  chinese: number;
  english: number;
}

export function countEffective(text: string): number {
  const matches = text.match(EFFECTIVE_RE);
  return matches ? matches.length : 0;
}

export function countDocument(text: string): DocumentCounts {
  return {
    total: countEffective(text),
    chinese: (text.match(CHINESE_RE) ?? []).length,
    english: (text.match(ENGLISH_RE) ?? []).length
  };
}

export function isSupportedDocument(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
    return false;
  }
  const path = document.uri.path.toLowerCase();
  if (path.split('/').includes('.workshop')) {
    return false;
  }
  const dot = path.lastIndexOf('.');
  if (dot === -1) {
    return false;
  }
  return SUPPORTED_EXTENSIONS.has(path.slice(dot));
}

const pad2 = (value: number): string => value.toString().padStart(2, '0');

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(rest)}`;
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export class WritingStats implements vscode.Disposable {
  private readonly charsItem: vscode.StatusBarItem;
  private readonly timerItem: vscode.StatusBarItem;
  private readonly rateItem: vscode.StatusBarItem;

  private readonly lastText = new Map<string, string>();
  private readonly openedAt = new Map<string, number>();
  private readonly savedAt = new Map<string, number>();
  private readonly disposables: vscode.Disposable[] = [];

  private enabled = true;
  private globalTypedCount = 0;
  private accumulatedMs = 0;
  private runStartedAt: number | null = null;
  private tickTimer: NodeJS.Timeout | undefined;
  private idleTimer: NodeJS.Timeout | undefined;

  private activeKey: string | undefined;
  private activeCounts: DocumentCounts = { total: 0, chinese: 0, english: 0 };

  constructor() {
    this.charsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 103);
    this.charsItem.command = 'typeStats.showDetails';
    this.charsItem.name = 'Creation Workshop: 字符';

    this.timerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
    this.timerItem.command = 'typeStats.showMenu';
    this.timerItem.name = 'Creation Workshop: 计时';

    this.rateItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    this.rateItem.command = 'typeStats.showMenu';
    this.rateItem.name = 'Creation Workshop: 速率';

    this.disposables.push(
      this.charsItem,
      this.timerItem,
      this.rateItem,
      vscode.workspace.onDidChangeTextDocument((event) => this.onDidChangeTextDocument(event)),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.onDidChangeActiveTextEditor(editor)),
      vscode.workspace.onDidOpenTextDocument((document) => this.rememberDocument(document)),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (isSupportedDocument(document)) {
          this.savedAt.set(document.uri.toString(), Date.now());
          this.updateCharsTooltip();
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        const key = document.uri.toString();
        this.lastText.delete(key);
        this.openedAt.delete(key);
        this.savedAt.delete(key);
      })
    );

    if (vscode.window.activeTextEditor) {
      this.rememberDocument(vscode.window.activeTextEditor.document);
    }

    this.render();
    this.refreshActiveEditor();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.pause();
      this.charsItem.hide();
      this.timerItem.hide();
      this.rateItem.hide();
      return;
    }
    this.render();
    this.refreshActiveEditor();
  }

  reset(): void {
    this.pause();
    this.globalTypedCount = 0;
    this.accumulatedMs = 0;
    this.updateCharsTooltip();
    this.render();
  }

  async showDetails(): Promise<void> {
    if (!vscode.window.activeTextEditor) {
      void vscode.window.showInformationMessage('Creation Workshop: 当前没有打开的编辑器。');
      return;
    }

    const content = this.detailLines().join('\n');
    const copyLabel = '复制';
    const picked = await vscode.window.showInformationMessage(
      'Creation Workshop 详细统计',
      { modal: true, detail: content },
      copyLabel
    );
    if (picked === copyLabel) {
      await vscode.env.clipboard.writeText(content);
      void vscode.window.showInformationMessage('Creation Workshop: 详细统计已复制到剪贴板。');
    }
  }

  dispose(): void {
    this.pause();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  private rememberDocument(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    if (!this.openedAt.has(key)) {
      this.openedAt.set(key, Date.now());
    }
    this.lastText.set(key, document.getText());
  }

  private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
    if (!this.enabled || !isSupportedDocument(event.document)) {
      return;
    }
    if (event.contentChanges.length === 0) {
      return;
    }

    const key = event.document.uri.toString();
    const next = event.document.getText();
    const previous = this.lastText.get(key);

    this.lastText.set(key, next);

    if (previous !== undefined && previous !== next) {
      this.globalTypedCount += countEffective(next) - countEffective(previous);
      this.markActivity();
    }

    this.refreshActiveEditor();
  }

  private onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): void {
    if (editor) {
      const key = editor.document.uri.toString();
      if (!this.lastText.has(key)) {
        this.rememberDocument(editor.document);
      }
    }
    this.refreshActiveEditor();
  }

  private markActivity(): void {
    const now = Date.now();
    if (this.runStartedAt === null) {
      this.runStartedAt = now;
    }

    if (!this.tickTimer) {
      this.tickTimer = setInterval(() => this.render(), 1000);
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    const pauseAfter = vscode.workspace.getConfiguration('typeStats').get<number>('idlePauseSeconds', 5);
    const delayMs = Math.max(1, pauseAfter) * 1000;
    this.idleTimer = setTimeout(() => this.pause(), delayMs);

    this.updateCharsTooltip();
    this.render();
  }

  private pause(): void {
    if (this.runStartedAt !== null) {
      this.accumulatedMs += Date.now() - this.runStartedAt;
      this.runStartedAt = null;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    this.updateCharsTooltip();
    this.render();
  }

  private accumulatedSeconds(): number {
    const runningMs = this.runStartedAt === null ? 0 : Date.now() - this.runStartedAt;
    return Math.floor((this.accumulatedMs + runningMs) / 1000);
  }

  private ratePerHour(): number {
    const seconds = this.accumulatedSeconds();
    if (seconds <= 0) {
      return 0;
    }
    return Math.round(this.globalTypedCount / (seconds / 3600));
  }

  private refreshActiveEditor(): void {
    if (!this.enabled) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || !isSupportedDocument(editor.document)) {
      this.charsItem.hide();
      this.timerItem.show();
      this.rateItem.show();
      this.render();
      return;
    }

    const counts = countDocument(editor.document.getText());
    this.activeKey = editor.document.uri.toString();
    this.activeCounts = counts;
    this.charsItem.text = `$(symbol-numeric) 字符 ${counts.total}`;
    this.updateCharsTooltip();
    this.charsItem.show();
    this.timerItem.show();
    this.rateItem.show();
    this.render();
  }

  private detailLines(): string[] {
    const counts = this.activeCounts;
    const openedAt = this.activeKey ? this.openedAt.get(this.activeKey) : undefined;
    const savedAt = this.activeKey ? this.savedAt.get(this.activeKey) : undefined;
    return [
      `有效字符：${counts.total}`,
      `中文字数：${counts.chinese}`,
      `英文字数：${counts.english}`,
      '',
      `耗时：${formatDuration(this.accumulatedSeconds())}`,
      `速率：${this.ratePerHour()} 字/小时`,
      `净输入：${this.globalTypedCount} 字`,
      '',
      `打开时间：${openedAt ? formatClock(openedAt) : '—'}`,
      `上次保存：${savedAt ? formatClock(savedAt) : '—'}`
    ];
  }

  private updateCharsTooltip(): void {
    this.charsItem.tooltip = new vscode.MarkdownString(this.detailLines().join('  \n'));
  }

  private render(): void {
    if (!this.enabled) {
      return;
    }

    this.timerItem.text = `$(clock) ${formatDuration(this.accumulatedSeconds())}`;
    this.timerItem.tooltip = '累计码字时间（连续 5 秒无变动自动暂停）\n点击打开操作菜单';

    this.rateItem.text = `$(dashboard) ${this.ratePerHour()} 字/h`;
    this.rateItem.tooltip = '基于净输入与实际码字时间计算\n点击打开操作菜单';
  }
}
