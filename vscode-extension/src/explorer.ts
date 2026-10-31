import * as vscode from 'vscode';
import { findSheetsUri, parseSheetsIni, parseSheetsMarkdownHeadings, SheetEntry } from './sheets';

export interface OpenSheetTarget {
  uri: vscode.Uri;
  line: number;
  key: string;
}

interface GroupNode {
  kind: 'group';
  label: string;
  entries: SheetEntry[];
}

interface EntryNode {
  kind: 'entry';
  key: string;
  section: string;
  values: string[];
  target: OpenSheetTarget;
}

interface EmptyNode {
  kind: 'empty';
  label: string;
}

type TreeNode = GroupNode | EntryNode | EmptyNode;

const UNGROUPED_LABEL = '未分组';

export class SheetsTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  private readonly disposables: vscode.Disposable[] = [this.emitter];
  private enabled = false;
  private generation = 0;
  private entries: SheetEntry[] = [];
  private headings = new Map<string, number>();
  private iniUri: vscode.Uri | undefined;
  private mdUri: vscode.Uri | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (this.enabled && event.affectsConfiguration('typeStats.sheetsPath')) {
          void this.reload();
        }
      })
    );
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled === this.enabled) {
      return;
    }
    this.enabled = enabled;
    if (enabled) {
      this.ensureWatcher();
      await this.reload();
    } else {
      this.generation += 1;
      this.entries = [];
      this.headings = new Map();
      this.watcher?.dispose();
      this.watcher = undefined;
      this.emitter.fire();
    }
  }

  dispose(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'typeStatsGroup';
      return item;
    }

    if (node.kind === 'empty') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }

    const item = new vscode.TreeItem(node.key, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('bookmark');
    item.contextValue = 'typeStatsEntry';
    item.tooltip = new vscode.MarkdownString(`**${node.section || UNGROUPED_LABEL}**  \n${node.values.join('、')}`);
    item.command = {
      command: 'typeStats.openSheetEntry',
      title: '打开设定',
      arguments: [node.target]
    };
    return item;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      if (this.entries.length === 0) {
        return [{ kind: 'empty', label: this.enabled ? '未找到设定集条目' : '未找到 .workshop/sheets.ini' }];
      }

      const groups: GroupNode[] = [];
      const byLabel = new Map<string, GroupNode>();
      for (const entry of this.entries) {
        const label = entry.section || UNGROUPED_LABEL;
        let group = byLabel.get(label);
        if (!group) {
          group = { kind: 'group', label, entries: [] };
          byLabel.set(label, group);
          groups.push(group);
        }
        group.entries.push(entry);
      }
      return groups;
    }

    if (element.kind !== 'group' || !this.iniUri) {
      return [];
    }

    const iniUri = this.iniUri;
    const mdUri = this.mdUri;
    return element.entries.map((entry): EntryNode => {
      const mdLine = this.headings.get(entry.key);
      const uri = mdLine !== undefined && mdUri ? mdUri : iniUri;
      return {
        kind: 'entry',
        key: entry.key,
        section: entry.section,
        values: entry.values,
        target: { uri, line: mdLine !== undefined ? mdLine : entry.line, key: entry.key }
      };
    });
  }

  private async reload(): Promise<void> {
    const generation = ++this.generation;
    const uri = await findSheetsUri();
    let nextEntries: SheetEntry[] = [];
    let nextHeadings = new Map<string, number>();
    let nextIniUri: vscode.Uri | undefined;
    let nextMdUri: vscode.Uri | undefined;

    if (uri) {
      nextIniUri = uri;
      nextMdUri = vscode.Uri.joinPath(uri, '..', 'sheets.md');
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        nextEntries = parseSheetsIni(new TextDecoder('utf-8').decode(bytes)).filter((entry) => entry.key.length > 0);
      } catch {
        nextEntries = [];
      }
      if (generation !== this.generation) {
        return;
      }
      try {
        const bytes = await vscode.workspace.fs.readFile(nextMdUri);
        nextHeadings = parseSheetsMarkdownHeadings(new TextDecoder('utf-8').decode(bytes));
      } catch {
        nextHeadings = new Map();
      }
    }

    if (generation !== this.generation) {
      return;
    }

    this.entries = nextEntries;
    this.headings = nextHeadings;
    this.iniUri = nextIniUri;
    this.mdUri = nextMdUri;
    this.emitter.fire();
  }

  private ensureWatcher(): void {
    if (this.watcher) {
      return;
    }
    this.watcher = vscode.workspace.createFileSystemWatcher('**/sheets.{ini,md}');
    const onEvent = (): void => void this.reload();
    this.watcher.onDidChange(onEvent);
    this.watcher.onDidCreate(onEvent);
    this.watcher.onDidDelete(onEvent);
  }
}
