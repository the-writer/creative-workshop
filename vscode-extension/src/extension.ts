import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { OpenSheetTarget, SheetsTreeProvider } from './explorer';
import { hasSheetsFile, SheetHighlighter } from './sheets';
import { WritingStats } from './stats';

const WORKSHOP_APP_PATH = '/Applications/创作工坊.app';

const openWorkshop = async (): Promise<void> => {
  try {
    await fs.access(WORKSHOP_APP_PATH);
  } catch {
    void vscode.window.showErrorMessage(`Type Stats: 未找到创作工坊应用（${WORKSHOP_APP_PATH}）。`);
    return;
  }
  execFile('open', [WORKSHOP_APP_PATH], (error) => {
    if (error) {
      void vscode.window.showErrorMessage(`Type Stats: 无法启动创作工坊（${error.message}）。`);
    }
  });
};

const openSheetEntry = async (target: OpenSheetTarget): Promise<void> => {
  const editor = await vscode.window.showTextDocument(target.uri, { preview: false });
  const line = Math.min(Math.max(0, Math.floor(target.line)), Math.max(0, editor.document.lineCount - 1));
  const range = new vscode.Range(line, 0, line, 0);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
};

export function activate(context: vscode.ExtensionContext): void {
  const stats = new WritingStats();
  const highlighter = new SheetHighlighter();
  const tree = new SheetsTreeProvider();

  let active: boolean | undefined;
  let syncToken = 0;

  const enabled = (): boolean => vscode.workspace.getConfiguration('typeStats').get<boolean>('enabled', true);

  const sync = async (): Promise<void> => {
    const token = ++syncToken;
    const shouldActivate = enabled() && (await hasSheetsFile());
    if (token !== syncToken || shouldActivate === active) {
      return;
    }

    active = shouldActivate;
    stats.setEnabled(shouldActivate);
    void vscode.commands.executeCommand('setContext', 'typeStats.active', shouldActivate);
    if (shouldActivate) {
      void highlighter.initialize();
      void tree.setEnabled(true);
    } else {
      highlighter.setEnabled(false);
      void tree.setEnabled(false);
    }
  };

  void sync();

  const sheetsWatcher = vscode.workspace.createFileSystemWatcher('**/sheets.ini');
  sheetsWatcher.onDidCreate(() => void sync());
  sheetsWatcher.onDidChange(() => void sync());
  sheetsWatcher.onDidDelete(() => void sync());

  interface MenuItem extends vscode.QuickPickItem {
    action: () => Promise<unknown> | unknown;
  }

  const refreshSheets = async (): Promise<void> => {
    await sync();
    if (active) {
      await highlighter.reload();
    }
    void vscode.window.showInformationMessage(
      active ? 'Type Stats: 设定集已重新加载。' : 'Type Stats: 未找到 .workshop/sheets.ini，插件未启用。'
    );
  };

  const showMenu = async (): Promise<void> => {
    const items: MenuItem[] = [
      { label: '$(rocket) 在工坊中打开', action: () => openWorkshop() },
      { label: '$(graph) 查看详细统计', action: () => stats.showDetails() },
      {
        label: '$(refresh) 重新加载设定集',
        action: refreshSheets
      },
      {
        label: '$(history) 重置计时与速率',
        action: () => {
          stats.reset();
          void vscode.window.showInformationMessage('Type Stats: 计时与速率已重置。');
        }
      },
      {
        label: '$(gear) 打开设置',
        description: '在 VS Code 设置界面修改 Type Stats 配置',
        action: () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:border-writer.type-stats')
      }
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Type Stats',
      placeHolder: '选择操作'
    });
    if (picked) {
      await picked.action();
    }
  };

  context.subscriptions.push(
    stats,
    highlighter,
    tree,
    sheetsWatcher,
    vscode.window.createTreeView('typeStats.sheetsExplorer', { treeDataProvider: tree, showCollapseAll: true }),
    vscode.commands.registerCommand('typeStats.showDetails', () => stats.showDetails()),
    vscode.commands.registerCommand('typeStats.showMenu', showMenu),
    vscode.commands.registerCommand('typeStats.openInWorkshop', () => openWorkshop()),
    vscode.commands.registerCommand('typeStats.openSheetEntry', (target: unknown) => {
      const parsed = target as OpenSheetTarget | undefined;
      if (!parsed?.uri || typeof parsed.line !== 'number') {
        return undefined;
      }
      return openSheetEntry(parsed);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('typeStats.enabled') || event.affectsConfiguration('typeStats.sheetsPath')) {
        void sync();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void sync())
  );
}

export function deactivate(): void {
  // Resources are disposed through context subscriptions.
}
