import * as vscode from 'vscode';
import { isSupportedDocument } from './stats';

export interface SheetEntry {
  key: string;
  values: string[];
  section: string;
  line: number;
}

interface CompiledEntry extends SheetEntry {
  regex: RegExp;
  decoration: vscode.TextEditorDecorationType;
  hover: vscode.MarkdownString;
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseSheetsIni(content: string): SheetEntry[] {
  const byKey = new Map<string, SheetEntry>();
  let section = '';
  let lineIndex = -1;

  for (const rawLine of content.split(/\r?\n/)) {
    lineIndex += 1;
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) {
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim();
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = stripQuotes(line.slice(separator + 1).trim());
    if (!key || !value) {
      continue;
    }

    const existing = byKey.get(key);
    if (existing) {
      if (!existing.values.includes(value)) {
        existing.values.push(value);
      }
    } else {
      byKey.set(key, { key, values: [value], section, line: lineIndex });
    }
  }

  return [...byKey.values()];
}

const HIDDEN_FIELDS = new Set(['ID', '创建时间', '人物名', '更新时间']);

function cleanValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('`') && trimmed.endsWith('`')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseSheetsMarkdown(content: string): Map<string, string> {
  const details = new Map<string, string>();
  let key = '';
  let lines: string[] = [];

  const flush = (): void => {
    if (key && lines.length > 0) {
      details.set(key, lines.join('\n'));
    }
    key = '';
    lines = [];
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      flush();
      key = line.slice(3).trim();
      continue;
    }
    if (!key || !line.startsWith('- ')) {
      continue;
    }

    const separator = line.indexOf(':', 2);
    if (separator === -1) {
      continue;
    }

    const field = line.slice(2, separator).trim();
    const value = cleanValue(line.slice(separator + 1));
    if (!field || !value || HIDDEN_FIELDS.has(field)) {
      continue;
    }

    lines.push(`${field}：${value}`);
  }

  flush();
  return details;
}

export function parseSheetsMarkdownHeadings(content: string): Map<string, number> {
  const headings = new Map<string, number>();
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith('## ')) {
      continue;
    }
    const key = line.slice(3).trim();
    if (key && !headings.has(key)) {
      headings.set(key, index);
    }
  }
  return headings;
}

export async function findSheetsUri(): Promise<vscode.Uri | undefined> {
  const configured = vscode.workspace.getConfiguration('typeStats').get<string>('sheetsPath', '').trim();
  const folders = vscode.workspace.workspaceFolders ?? [];
  const root = folders[0]?.uri;

  if (configured) {
    if (/^[a-zA-Z]+:\/\//.test(configured)) {
      return vscode.Uri.parse(configured);
    }
    if (configured.startsWith('/')) {
      return vscode.Uri.file(configured);
    }
    if (root) {
      return vscode.Uri.joinPath(root, configured);
    }
  }

  for (const folder of folders) {
    const candidate = vscode.Uri.joinPath(folder.uri, '.workshop', 'sheets.ini');
    try {
      await vscode.workspace.fs.stat(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function hasSheetsFile(): Promise<boolean> {
  const uri = await findSheetsUri();
  if (!uri) {
    return false;
  }
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class SheetHighlighter implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private compiled: CompiledEntry[] = [];
  private details = new Map<string, string>();
  private enabled = true;
  private reloadGeneration = 0;
  private watcher: vscode.FileSystemWatcher | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.applyToVisibleEditors()),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length > 0) {
          this.scheduleApply();
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('typeStats')) {
          void this.reload();
        }
      })
    );
  }

  async initialize(): Promise<void> {
    this.enabled = true;
    await this.reload();
    this.ensureWatcher();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      void this.reload();
      this.ensureWatcher();
    } else {
      this.reloadGeneration += 1;
      this.disposeDecorations();
      this.watcher?.dispose();
      this.watcher = undefined;
    }
  }

  async reload(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const generation = ++this.reloadGeneration;
    this.disposeDecorations();

    const uri = await this.resolveSheetsUri();
    if (generation !== this.reloadGeneration) {
      return;
    }
    if (!uri) {
      this.details = new Map();
      this.applyToVisibleEditors();
      return;
    }

    let content: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      content = new TextDecoder('utf-8').decode(bytes);
    } catch {
      this.details = new Map();
      this.applyToVisibleEditors();
      return;
    }

    if (generation !== this.reloadGeneration) {
      return;
    }

    const detailsUri = vscode.Uri.joinPath(uri, '..', 'sheets.md');
    try {
      const bytes = await vscode.workspace.fs.readFile(detailsUri);
      this.details = parseSheetsMarkdown(new TextDecoder('utf-8').decode(bytes));
    } catch {
      this.details = new Map();
    }

    if (generation !== this.reloadGeneration) {
      return;
    }

    const entries = parseSheetsIni(content)
      .filter((entry) => entry.key.length > 0)
      .sort((a, b) => b.key.length - a.key.length);

    this.compiled = entries.map((entry) => ({
      ...entry,
      regex: new RegExp(escapeRegExp(entry.key), 'giu'),
      decoration: vscode.window.createTextEditorDecorationType(this.decorationOptions()),
      hover: this.hoverMessage(entry)
    }));

    this.applyToVisibleEditors();
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.watcher?.dispose();
    this.watcher = undefined;
    this.disposeDecorations();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  private hoverMessage(entry: SheetEntry): vscode.MarkdownString {
    const hover = new vscode.MarkdownString();
    if (entry.section) {
      hover.appendMarkdown(`**${entry.section}**  \n`);
    }
    const detail = this.details.get(entry.key);
    if (detail) {
      hover.appendMarkdown(`${detail.split('\n').join('  \n')}`);
    } else {
      hover.appendMarkdown(`详情：${entry.values.map((value) => `\`${value}\``).join('、')}`);
    }
    hover.isTrusted = false;
    return hover;
  }

  private decorationOptions(): vscode.DecorationRenderOptions {
    return {
      fontWeight: 'bold',
      backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      borderRadius: '3px',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
      before: { contentText: '\u200b', margin: '0 3px' },
      after: { contentText: '\u200b', margin: '0 3px' }
    };
  }

  private async resolveSheetsUri(): Promise<vscode.Uri | undefined> {
    return findSheetsUri();
  }

  private ensureWatcher(): void {
    if (this.watcher || !this.enabled) {
      return;
    }
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.workshop/sheets.{ini,md}');
    this.watcher.onDidChange(() => void this.reload());
    this.watcher.onDidCreate(() => void this.reload());
    this.watcher.onDidDelete(() => void this.reload());
  }

  private scheduleApply(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.applyToVisibleEditors();
    }, 150);
  }

  private applyToVisibleEditors(): void {
    if (!this.enabled) {
      return;
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (!isSupportedDocument(editor.document)) {
        this.clearEditor(editor);
        continue;
      }

      const text = editor.document.getText();
      for (const entry of this.compiled) {
        entry.regex.lastIndex = 0;
        const ranges: vscode.DecorationOptions[] = [];
        let match: RegExpExecArray | null;
        while ((match = entry.regex.exec(text)) !== null) {
          const start = editor.document.positionAt(match.index);
          const end = editor.document.positionAt(match.index + match[0].length);
          ranges.push({ range: new vscode.Range(start, end), hoverMessage: entry.hover });
          if (match[0].length === 0) {
            entry.regex.lastIndex += 1;
          }
        }
        editor.setDecorations(entry.decoration, ranges);
      }
    }
  }

  private clearEditor(editor: vscode.TextEditor): void {
    for (const entry of this.compiled) {
      editor.setDecorations(entry.decoration, []);
    }
  }

  private disposeDecorations(): void {
    for (const entry of this.compiled) {
      entry.decoration.dispose();
    }
    this.compiled = [];
  }
}
