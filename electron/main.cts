import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, Menu, Tray, nativeImage, session, type MenuItemConstructorOptions } from 'electron';
import { registerWorkshopIpc } from './ipc/workshop-ipc.cjs';
import { ProjectManager } from './services/project-manager.cjs';
import { WorkshopStorage } from './services/workshop-storage.cjs';

interface CreationWorkshopConfig {
  window?: {
    width?: number;
    height?: number;
    titleBarStyle?: 'default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover';
    alwaysOnTop?: boolean;
    alwaysOnTopLevel?: 'normal' | 'floating' | 'torn-off-menu' | 'modal-panel' | 'main-menu' | 'status' | 'pop-up-menu' | 'screen-saver';
  };
  project?: {
    dataDirName?: string;
    registryFileName?: string;
    legacyDataFileName?: string;
    maxRecentProjects?: number;
  };
  tray?: {
    iconFile?: string;
  };
}

const APP_NAME = '创作工坊';

// 窗口常量集中在此（配置项缺省时的回退值），业务代码不散落魔法值
const DEFAULT_WINDOW_WIDTH = 800;
const DEFAULT_WINDOW_HEIGHT = 600;
const DEFAULT_TITLE_BAR_STYLE = 'hiddenInset';
const DEFAULT_ALWAYS_ON_TOP_LEVEL = 'floating';
// 独立窗口模式：窗口绑定在打开时所在的桌面，打开期间切换桌面不跟随。
// 显示后延迟绑定一次，等 macOS 的空间切换动画结束，避免窗口被系统重新分配到旧桌面。
const SPACE_BIND_DELAY_MS = 60;
const RULES_WINDOW_SIZE_RATIO = 0.8;
const RULES_WINDOW_QUERY = 'rules';

const packageJson = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as {
  creationWorkshop?: CreationWorkshopConfig;
};
const config = packageJson.creationWorkshop ?? {};
const windowWidth = config.window?.width ?? DEFAULT_WINDOW_WIDTH;
const windowHeight = config.window?.height ?? DEFAULT_WINDOW_HEIGHT;
const titleBarStyle = config.window?.titleBarStyle ?? DEFAULT_TITLE_BAR_STYLE;
const windowAlwaysOnTop = config.window?.alwaysOnTop ?? false;
const windowAlwaysOnTopLevel = config.window?.alwaysOnTopLevel ?? DEFAULT_ALWAYS_ON_TOP_LEVEL;
const projectConfig = config.project ?? {};
const trayIconFile = config.tray?.iconFile ?? 'assets/imgs/trayTemplate.png';

const WINDOW_COLLECTION_BEHAVIOR = { visibleOnFullScreen: true, skipTransformProcessType: true } as const;

app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;
let rulesWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let isReadyToShow = false;
// 显示 / 隐藏之间短暂切换时用于把窗口重新绑定到当前桌面
let desktopBindTimer: NodeJS.Timeout | null = null;

/**
 * 隐藏 Dock 图标（macOS）。
 *
 * 取舍说明：
 * - 打包后的应用在 `Info.plist` 里声明了 `LSUIElement=1`（`package.json` → `build.mac.extendInfo`），
 *   即系统层面就是 accessory/UIElement 应用，Dock 不显示图标；运行期这里只是兜底（LSUIElement 下 `app.dock` 仍存在）。
 * - 不使用 `app.setActivationPolicy('accessory')`：Electron 的 `app.focus({ steal: true })` 依赖
 *   `[NSApp activateIgnoringOtherApps:YES]` 把应用提升为前台应用，若进程被临时改成 accessory 策略，
 *   窗口可能无法成为 key window，中文输入法（输入源）也会挂不上，因此只隐藏 Dock 图标、不改激活策略。
 * - 已知问题：连续 1 秒内重复调用 `dock.hide()` 会无效；本函数只在 `whenReady` 后调用一次。
 */
function hideDockIcon(): void {
  if (process.platform !== 'darwin') return;
  if (app.dock?.isVisible()) app.dock.hide();
}

/**
 * 窗口常态置顶层：仅在配置 `window.alwaysOnTop` 为真时置顶，层级取 `window.alwaysOnTopLevel`。
 * 配置为 false 时**不调用 `setAlwaysOnTop`**，窗口自始至终不处于 alwaysOnTop 层级。
 */
function applyNormalWindowLevel(win: BrowserWindow): void {
  if (process.platform !== 'darwin' || !windowAlwaysOnTop) return;
  win.setAlwaysOnTop(true, windowAlwaysOnTopLevel);
}

/**
 * 把窗口绑定到当前活跃桌面（独立窗口模式）。
 *
 * `setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true })`
 * 等于「带全屏辅助、但不加入所有桌面」：窗口可以浮在当前桌面的全屏应用之上，
 * 用户切换桌面时窗口留在原桌面，不会自动跟随。
 */
function bindWindowToCurrentDesktop(win: BrowserWindow): void {
  if (process.platform !== 'darwin' || win.isDestroyed()) return;
  win.setVisibleOnAllWorkspaces(false, WINDOW_COLLECTION_BEHAVIOR);
}

function cancelDesktopBind(): void {
  if (desktopBindTimer) {
    clearTimeout(desktopBindTimer);
    desktopBindTimer = null;
  }
}

/**
 * 显示主窗口。
 *
 * - 启动时不创建窗口，只有托盘/菜单触发本函数时才创建并显示；
 * - 窗口原本隐藏时，先临时加入所有桌面让窗口能在当前 Space 浮出，取得焦点后再绑定回当前桌面，
 *   因此「关闭后从另一个桌面打开」会出现在新桌面，而打开期间切换桌面不会跟随；
 * - 窗口已显示时只抬高并聚焦，不改变桌面归属，也不反复抢焦点。
 */
function showMainWindow(): void {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  if (win.isMinimized()) win.restore();
  // 页面尚未渲染完成：先返回，`ready-to-show` 会再次调用本函数完成显示（避免白屏闪烁）
  if (!isReadyToShow) return;

  const alreadyVisible = win.isVisible();
  applyNormalWindowLevel(win);
  cancelDesktopBind();
  if (!alreadyVisible && process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, WINDOW_COLLECTION_BEHAVIOR);
  }

  win.show();
  win.moveTop();
  if (alreadyVisible) {
    win.focus();
    return;
  }

  if (process.platform === 'darwin') app.focus({ steal: true });
  win.focus();
  if (process.platform === 'darwin') {
    desktopBindTimer = setTimeout(() => {
      desktopBindTimer = null;
      bindWindowToCurrentDesktop(win);
    }, SPACE_BIND_DELAY_MS);
  }
}

function closeRulesWindow(): void {
  if (rulesWindow && !rulesWindow.isDestroyed()) rulesWindow.close();
}

function openRulesWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (rulesWindow && !rulesWindow.isDestroyed()) {
    rulesWindow.show();
    rulesWindow.focus();
    return;
  }

  const [parentWidth = windowWidth, parentHeight = windowHeight] = mainWindow.getContentSize();
  const child = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width: Math.round(parentWidth * RULES_WINDOW_SIZE_RATIO),
    height: Math.round(parentHeight * RULES_WINDOW_SIZE_RATIO),
    useContentSize: true,
    center: true,
    movable: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: false,
    title: '规则设置',
    titleBarStyle: 'hiddenInset',
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
  rulesWindow = child;
  child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  child.webContents.on('will-navigate', (event) => event.preventDefault());
  child.webContents.on('will-attach-webview', (event) => event.preventDefault());
  child.webContents.setZoomFactor(1);
  child.webContents.on('did-finish-load', () => child.webContents.setZoomFactor(1));

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    url.searchParams.set('window', RULES_WINDOW_QUERY);
    void child.loadURL(url.toString());
  } else {
    void child.loadFile(join(app.getAppPath(), 'dist', 'index.html'), { query: { window: RULES_WINDOW_QUERY } });
  }
  child.once('ready-to-show', () => {
    if (!child.isDestroyed()) {
      child.center();
      child.show();
      child.focus();
    }
  });
  child.on('closed', () => {
    if (rulesWindow === child) rulesWindow = null;
  });
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
    // 普通独立窗口：不置顶，绑定在打开时所在的桌面，切换桌面不跟随（见 bindWindowToCurrentDesktop）
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    // 置顶只在 `showMainWindow` 里随「配置 + 是否重新打开」设置；这里不传，避免构造期就带上会残留的层级
    alwaysOnTop: false,
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

  bindWindowToCurrentDesktop(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.on('did-finish-load', () => mainWindow?.webContents.setZoomFactor(1));

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else void mainWindow.loadFile(join(app.getAppPath(), 'dist', 'index.html'));

  // 启动时不显示窗口；只有用户点击托盘/菜单后才创建并显示
  mainWindow.once('ready-to-show', () => {
    isReadyToShow = true;
    showMainWindow();
  });
  mainWindow.on('focus', () => {
    // 焦点到达时窗口就在当前桌面，再次声明独立窗口归属，避免切换桌面后被系统带走
    bindWindowToCurrentDesktop(mainWindow!);
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      closeRulesWindow();
      mainWindow?.hide();
    }
  });
  mainWindow.on('hide', () => {
    cancelDesktopBind();
  });
  mainWindow.on('closed', () => {
    cancelDesktopBind();
    closeRulesWindow();
    mainWindow = null;
    isReadyToShow = false;
  });
  return mainWindow;
}

app.whenReady().then(async () => {
  // 启动即隐藏 Dock 图标（macOS）：应用只驻留托盘，启动时不打开主窗口
  hideDockIcon();
  const storage = new WorkshopStorage({ dataDirName: projectConfig.dataDirName });
  const projects = new ProjectManager(app.getPath('userData'), storage, projectConfig);
  await projects.initialize();
  console.info(`[${APP_NAME}] 项目登记文件：${projects.registryFilePath}`);
  registerWorkshopIpc(storage, projects, {
    openRulesWindow,
    closeRulesWindow,
    notifyRulesChanged: (value) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('workshop:rules:changed', value);
    },
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  createApplicationMenu();
  tray = createTray();
  console.info(`[${APP_NAME}] 托盘已就绪`);
});

app.on('before-quit', () => {
  isQuitting = true;
  cancelDesktopBind();
  closeRulesWindow();
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
