import { basename, extname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { app, BrowserWindow, clipboard, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { WorkshopStorage, type CandidateFilters, type CandidateInput, type RelationInput, type SheetInput } from '../services/workshop-storage.cjs';

export const IPC = {
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
  allData: 'workshop:data:all',
  stats: 'workshop:data:stats',
  preferencesGet: 'workshop:preferences:get',
  preferencesSet: 'workshop:preferences:set',
  fileSave: 'workshop:files:save',
  clipboardWrite: 'workshop:clipboard:write',
} as const;

const ALLOWED_SAVE_EXTENSIONS = new Set(['.json', '.txt', '.md', '.png']);
const ALLOWED_PREFERENCES = new Set(['generator', 'libraryFilters']);

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

async function saveExportFile(
  event: IpcMainInvokeEvent,
  input: { fileName: string; dataBase64: string },
): Promise<{
  success: boolean;
  canceled?: boolean;
  filePath?: string;
  message?: string;
}> {
  const safeName = basename(typeof input.fileName === 'string' ? input.fileName : '');
  const extension = extname(safeName).toLowerCase();
  if (!safeName || !ALLOWED_SAVE_EXTENSIONS.has(extension)) {
    return { success: false, message: '不支持的文件类型' };
  }
  const owner = BrowserWindow.fromWebContents(event.sender);
  const options = {
    defaultPath: join(app.getPath('downloads'), safeName),
    filters: [{ name: extension.slice(1).toUpperCase(), extensions: [extension.slice(1)] }],
  };
  const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  try {
    const data = Buffer.from(typeof input.dataBase64 === 'string' ? input.dataBase64 : '', 'base64');
    await writeFile(result.filePath, data);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : '保存失败' };
  }
}

export function registerWorkshopIpc(storage: WorkshopStorage): void {
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
  registerHandler(IPC.allData, () => storage.allData());
  registerHandler(IPC.stats, () => storage.stats());
  registerHandler(IPC.preferencesGet, (_event, key: string) => {
    if (!ALLOWED_PREFERENCES.has(key)) throw new Error('非法偏好项');
    return storage.preferencesGet(key);
  });
  registerHandler(IPC.preferencesSet, (_event, key: string, value: unknown) => {
    if (!ALLOWED_PREFERENCES.has(key)) throw new Error('非法偏好项');
    return storage.preferencesSet(key, value);
  });
  registerHandler(IPC.fileSave, (event, input: { fileName: string; dataBase64: string }) => saveExportFile(event, input));
  registerHandler(IPC.clipboardWrite, (_event, text: string) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });
}
