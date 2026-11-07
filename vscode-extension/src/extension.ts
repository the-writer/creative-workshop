import * as vscode from 'vscode';
import { OpenSheetTarget, SheetsTreeProvider } from './explorer';
import { hasSheetsFile, SheetHighlighter } from './sheets';
import { WritingStats } from './stats';

const WORKSHOP_PROTOCOL = 'workshop://project/open';

const openWorkshop = async (): Promise<void> => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showErrorMessage('Creation Workshop: 请先打开Creation Workshop项目文件夹。');
    return;
  }
  const link = vscode.Uri.parse(`${WORKSHOP_PROTOCOL}?name=${encodeURIComponent(folder.name)}`);
  const opened = await vscode.env.openExternal(link);
  if (!opened) {
    void vscode.window.showErrorMessage('Creation Workshop: 无法打开Creation Workshop，请确认已安装并注册 workshop:// 协议。');
  }
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
      active ? 'Creation Workshop: 设定集已重新加载。' : 'Creation Workshop: 未找到 .workshop/sheets.ini，插件未启用。'
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
          void vscode.window.showInformationMessage('Creation Workshop: 计时与速率已重置。');
        }
      },
      {
        label: '$(gear) 打开设置',
        description: '在 VS Code 设置界面修改 Creation Workshop 配置',
        action: () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:border-writer.creation-workshop')
      }
    ];

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Creation Workshop',
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
