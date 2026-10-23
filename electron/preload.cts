import { contextBridge, ipcRenderer } from 'electron';
const invoke = (channel: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args);

const IPC = {
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

contextBridge.exposeInMainWorld('workshop', {
  candidates: {
    list: (filters: unknown) => invoke(IPC.candidateList, filters),
    get: (id: string) => invoke(IPC.candidateGet, id),
    create: (input: unknown) => invoke(IPC.candidateCreate, input),
    update: (id: string, patch: unknown) => invoke(IPC.candidateUpdate, id, patch),
    references: (id: string) => invoke(IPC.candidateReferences, id),
    remove: (id: string, force: boolean) => invoke(IPC.candidateDelete, id, force),
  },
  sheets: {
    list: () => invoke(IPC.sheetList),
    save: (input: unknown) => invoke(IPC.sheetSave, input),
    remove: (id: string) => invoke(IPC.sheetDelete, id),
  },
  relations: {
    list: () => invoke(IPC.relationList),
    add: (input: unknown) => invoke(IPC.relationAdd, input),
    remove: (id: string) => invoke(IPC.relationRemove, id),
  },
  data: {
    all: () => invoke(IPC.allData),
    stats: () => invoke(IPC.stats),
  },
  preferences: {
    get: (key: 'generator' | 'libraryFilters') => invoke(IPC.preferencesGet, key),
    set: (key: 'generator' | 'libraryFilters', value: unknown) => invoke(IPC.preferencesSet, key, value),
  },
  files: {
    save: (input: { fileName: string; dataBase64: string }) => invoke(IPC.fileSave, input),
  },
  clipboard: {
    writeText: (text: string) => invoke(IPC.clipboardWrite, text),
  },
});
