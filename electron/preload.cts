import { contextBridge, ipcRenderer } from 'electron';
const invoke = (channel: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args);

const IPC = {
  projectsListRecent: 'workshop:projects:list-recent',
  projectsCurrent: 'workshop:projects:current',
  projectsOpen: 'workshop:projects:open',
  projectsCreate: 'workshop:projects:create',
  projectsPickDirectory: 'workshop:projects:pick-directory',
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

contextBridge.exposeInMainWorld('workshop', {
  projects: {
    listRecent: () => invoke(IPC.projectsListRecent),
    current: () => invoke(IPC.projectsCurrent),
    open: (path: string) => invoke(IPC.projectsOpen, path),
    create: (input: { parentDir: string; name: string }) => invoke(IPC.projectsCreate, input),
    pickDirectory: (kind: 'open' | 'parent') => invoke(IPC.projectsPickDirectory, kind),
    openInVSCode: () => invoke(IPC.projectsOpenInVSCode),
  },
  rules: {
    open: () => invoke(IPC.rulesOpen),
    close: () => invoke(IPC.rulesClose),
    notifyChanged: (value: unknown) => invoke(IPC.rulesChanged, value),
    onChanged: (callback: (value: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown) => callback(value);
      ipcRenderer.on(IPC.rulesChanged, listener);
      return () => ipcRenderer.removeListener(IPC.rulesChanged, listener);
    },
  },
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
    stats: () => invoke(IPC.stats),
  },
  graph: {
    getLayout: () => invoke(IPC.graphGetLayout),
    saveLayout: (positions: unknown) => invoke(IPC.graphSaveLayout, positions),
  },
  preferences: {
    get: (key: 'generator' | 'libraryFilters') => invoke(IPC.preferencesGet, key),
    set: (key: 'generator' | 'libraryFilters', value: unknown) => invoke(IPC.preferencesSet, key, value),
  },
  clipboard: {
    writeText: (text: string) => invoke(IPC.clipboardWrite, text),
  },
});
