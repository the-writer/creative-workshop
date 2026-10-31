import { app, BrowserWindow, clipboard, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { ProjectManager } from '../services/project-manager.cjs';
import {
  WorkshopStorage,
  type CandidateFilters,
  type CandidateInput,
  type GraphPoint,
  type RelationInput,
  type SheetInput,
} from '../services/workshop-storage.cjs';

export const IPC = {
  projectsListRecent: 'workshop:projects:list-recent',
  projectsCurrent: 'workshop:projects:current',
  projectsOpen: 'workshop:projects:open',
  projectsCreate: 'workshop:projects:create',
  projectsPickDirectory: 'workshop:projects:pick-directory',
  projectsRemoveRecent: 'workshop:projects:remove-recent',
  projectsOverview: 'workshop:project:overview',
  projectsOpenInVSCode: 'workshop:projects:open-vscode',
  rulesOpen: 'workshop:rules:open',
  rulesClose: 'workshop:rules:close',
  rulesChanged: 'workshop:rules:changed',
  candidateList: 'workshop:candidates:list',
  candidateGet: 'workshop:candidates:get',
  candidateCreate: 'workshop:candidates:create',
  candidateUpdate: 'workshop:candidates:update',
  candidateReferences: 'workshop:candidates:references',
  candidateDelete: 'workshop:candidates:delete',
  sheetList: 'workshop:sheets:list',
  sheetSave: 'workshop:sheets:save',
  sheetDelete: 'workshop:sheets:delete',
  relationList: 'workshop:relations:list',
  relationAdd: 'workshop:relations:add',
  relationRemove: 'workshop:relations:remove',
  stats: 'workshop:data:stats',
  graphGetLayout: 'workshop:graph:get-layout',
  graphSaveLayout: 'workshop:graph:save-layout',
  preferencesGet: 'workshop:preferences:get',
  preferencesSet: 'workshop:preferences:set',
  clipboardWrite: 'workshop:clipboard:write',
} as const;

const ALLOWED_PREFERENCES = new Set(['generator', 'libraryFilters']);

export interface RulesWindowBridge {
  openRulesWindow: () => void;
  closeRulesWindow: () => void;
  notifyRulesChanged: (value: unknown) => void;
}

function trustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (url.startsWith('file://') || url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) return;
  throw new Error('不受信任的调用来源');
}

function registerHandler(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    trustedSender(event);
    return handler(event, ...args);
  });
}

async function pickDirectory(
  event: IpcMainInvokeEvent,
  kind: 'open' | 'parent',
): Promise<{ ok: boolean; canceled?: boolean; path?: string; message?: string }> {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options =
    kind === 'parent'
      ? {
          title: '选择项目存放位置',
          buttonLabel: '选择',
          defaultPath: app.getPath('documents'),
          properties: ['openDirectory', 'createDirectory'] as const,
        }
      : {
          title: '选择或新建创作工坊项目文件夹',
          buttonLabel: '打开项目',
          defaultPath: app.getPath('documents'),
          properties: ['openDirectory', 'createDirectory'] as const,
        };
  const baseOptions = {
    title: options.title,
    buttonLabel: options.buttonLabel,
    defaultPath: options.defaultPath,
    properties: [...options.properties],
  };
  const result = owner ? await dialog.showOpenDialog(owner, baseOptions) : await dialog.showOpenDialog(baseOptions);
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  return { ok: true, path: result.filePaths[0] };
}

export function registerWorkshopIpc(storage: WorkshopStorage, projects: ProjectManager, rulesBridge?: RulesWindowBridge): void {
  /* ---------------- 项目管理 ---------------- */
  registerHandler(IPC.projectsListRecent, () => projects.listRecent());
  registerHandler(IPC.projectsCurrent, () => projects.current);
  registerHandler(IPC.projectsOpen, (_event, path: string) => projects.open(path));
  registerHandler(IPC.projectsCreate, (_event, input: { parentDir: string; name: string }) => projects.create(input));
  registerHandler(IPC.projectsPickDirectory, (event, kind: 'open' | 'parent') => pickDirectory(event, kind === 'parent' ? 'parent' : 'open'));
  registerHandler(IPC.projectsRemoveRecent, (_event, path: string) => projects.removeRecent(path));
  registerHandler(IPC.projectsOverview, () => storage.projectOverview());
  registerHandler(IPC.projectsOpenInVSCode, () => projects.openInVSCode());
  registerHandler(IPC.rulesOpen, () => rulesBridge?.openRulesWindow());
  registerHandler(IPC.rulesClose, () => rulesBridge?.closeRulesWindow());
  registerHandler(IPC.rulesChanged, (_event, value: unknown) => {
    rulesBridge?.notifyRulesChanged(value);
    return true;
  });

  /* ---------------- 业务数据（均写入当前项目 .workshop） ---------------- */
  registerHandler(IPC.candidateList, (_event, filters: CandidateFilters) => storage.candidatesList(filters));
  registerHandler(IPC.candidateGet, (_event, id: string) => storage.candidateGet(id));
  registerHandler(IPC.candidateCreate, (_event, input: CandidateInput) => storage.candidateCreate(input));
  registerHandler(IPC.candidateUpdate, (_event, id: string, patch: { favorite?: boolean; note?: string }) => storage.candidateUpdate(id, patch));
  registerHandler(IPC.candidateReferences, (_event, id: string) => storage.candidateReferences(id));
  registerHandler(IPC.candidateDelete, (_event, id: string, force: boolean) => storage.candidateDelete(id, Boolean(force)));
  registerHandler(IPC.sheetList, () => storage.sheetsList());
  registerHandler(IPC.sheetSave, (_event, input: SheetInput) => storage.sheetSave(input));
  registerHandler(IPC.sheetDelete, (_event, id: string) => storage.sheetDelete(id));
  registerHandler(IPC.relationList, () => storage.relationsList());
  registerHandler(IPC.relationAdd, (_event, input: RelationInput) => storage.relationAdd(input));
  registerHandler(IPC.relationRemove, (_event, id: string) => storage.relationRemove(id));
  registerHandler(IPC.stats, () => storage.stats());
  registerHandler(IPC.graphGetLayout, () => storage.graphLayoutGet());
  registerHandler(IPC.graphSaveLayout, (_event, positions: Record<string, GraphPoint>) => storage.graphLayoutSave(positions));
  registerHandler(IPC.preferencesGet, (_event, key: string) => {
    if (!ALLOWED_PREFERENCES.has(key)) throw new Error('非法偏好项');
    return storage.preferencesGet(key);
  });
  registerHandler(IPC.preferencesSet, (_event, key: string, value: unknown) => {
    if (!ALLOWED_PREFERENCES.has(key)) throw new Error('非法偏好项');
    return storage.preferencesSet(key, value);
  });
  registerHandler(IPC.clipboardWrite, (_event, text: string) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });
}
