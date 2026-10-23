import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, Menu, session, type MenuItemConstructorOptions } from 'electron';
import { registerWorkshopIpc } from './ipc/workshop-ipc.cjs';
import { WorkshopStorage } from './services/workshop-storage.cjs';

interface CreationWorkshopConfig {
  window?: {
    width?: number;
    height?: number;
    titleBarStyle?: 'hiddenInset';
  };
  storage?: {
    fileName?: string;
  };
}

const APP_NAME = '创作工坊';
const packageJson = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as {
  creationWorkshop?: CreationWorkshopConfig;
};
const config = packageJson.creationWorkshop ?? {};
const windowWidth = config.window?.width ?? 640;
const windowHeight = config.window?.height ?? 480;
const titleBarStyle = config.window?.titleBarStyle ?? 'hiddenInset';
const storageFileName = config.storage?.fileName ?? 'workshop.json';

app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;

function createApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `关于${APP_NAME}` },
        { type: 'separator' },
        { role: 'hide', label: `隐藏${APP_NAME}` },
        { role: 'hideOthers', label: '隐藏其他应用' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: `退出${APP_NAME}` },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: APP_NAME,
    titleBarStyle,
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#f5efe2',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(join(app.getAppPath(), 'dist', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const storage = new WorkshopStorage(join(app.getPath('userData'), storageFileName));
  console.info(`[${APP_NAME}] 数据文件：${storage.filePath}`);
  registerWorkshopIpc(storage);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createApplicationMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
