import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, Menu, Tray, nativeImage, session, type MenuItemConstructorOptions } from 'electron';
import { registerWorkshopIpc } from './ipc/workshop-ipc.cjs';
import { WorkshopStorage } from './services/workshop-storage.cjs';

interface CreationWorkshopConfig {
  window?: {
    width?: number;
    height?: number;
    titleBarStyle?: 'hiddenInset';
    type?: 'panel';
    alwaysOnTop?: boolean;
  };
  storage?: {
    fileName?: string;
  };
  tray?: {
    iconFile?: string;
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
const windowType = config.window?.type ?? 'panel';
const windowAlwaysOnTop = config.window?.alwaysOnTop ?? false;
const storageFileName = config.storage?.fileName ?? 'workshop.json';
const trayIconFile = config.tray?.iconFile ?? 'assets/imgs/trayTemplate.png';

app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let spaceBindTimer: NodeJS.Timeout | null = null;

function setCurrentDesktopBinding(win: BrowserWindow): void {
  if (process.platform !== 'darwin') return;
  win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true });
}

function showMainWindow(): void {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  if (win.isMinimized()) win.restore();

  if (process.platform === 'darwin') {
    if (spaceBindTimer) clearTimeout(spaceBindTimer);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
  win.setAlwaysOnTop(windowAlwaysOnTop);

  win.show();
  win.focus();
  if (typeof win.moveTop === 'function') win.moveTop();

  if (process.platform === 'darwin') {
    spaceBindTimer = setTimeout(() => {
      spaceBindTimer = null;
      if (!win.isDestroyed()) setCurrentDesktopBinding(win);
    }, 60);
  }
}

function createTray(): Tray {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), trayIconFile));
  if (icon.isEmpty()) throw new Error(`托盘图标无法加载：${trayIconFile}`);
  if (process.platform === 'darwin') icon.setTemplateImage(true);

  const nextTray = new Tray(icon);
  nextTray.setToolTip(APP_NAME);
  nextTray.on('click', showMainWindow);
  nextTray.on('right-click', () => {
    nextTray.popUpContextMenu(
      Menu.buildFromTemplate([{ label: '打开主界面', click: showMainWindow }, { type: 'separator' }, { label: `退出${APP_NAME}`, click: () => app.quit() }]),
    );
  });
  return nextTray;
}

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
        { label: '显示主界面', click: showMainWindow },
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    type: windowType,
    alwaysOnTop: windowAlwaysOnTop,
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
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.on('did-finish-load', () => mainWindow?.webContents.setZoomFactor(1));
  if (process.platform === 'darwin') {
    setCurrentDesktopBinding(mainWindow);
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else void mainWindow.loadFile(join(app.getAppPath(), 'dist', 'index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

app.whenReady().then(() => {
  const storage = new WorkshopStorage(join(app.getPath('userData'), storageFileName));
  console.info(`[${APP_NAME}] 数据文件：${storage.filePath}`);
  registerWorkshopIpc(storage);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createApplicationMenu();
  createWindow();
  tray = createTray();
  console.info(`[${APP_NAME}] 托盘已就绪`);

  app.on('activate', () => {
    showMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (spaceBindTimer) {
    clearTimeout(spaceBindTimer);
    spaceBindTimer = null;
  }
  tray?.destroy();
  tray = null;
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
