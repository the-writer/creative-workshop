import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { app, BrowserWindow, Menu, Tray, nativeImage, dialog, screen, session, type MenuItemConstructorOptions } from 'electron';
import { IPC, registerWorkshopIpc } from './ipc/workshop-ipc.cjs';
import { ProjectManager } from './services/project-manager.cjs';
import { WorkshopStorage } from './services/workshop-storage.cjs';

interface CreationWorkshopConfig {
  window?: {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
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

const APP_NAME = 'Creation Workshop';

// 窗口常量集中在此（配置项缺省时的回退值），业务代码不散落魔法值
const DEFAULT_WINDOW_WIDTH = 800;
const DEFAULT_WINDOW_HEIGHT = 600;
const DEFAULT_WINDOW_MIN_WIDTH = 320;
const DEFAULT_WINDOW_MIN_HEIGHT = 240;
const DEFAULT_WINDOW_MAX_WIDTH = 1024;
const DEFAULT_WINDOW_MAX_HEIGHT = 768;
const DEFAULT_TITLE_BAR_STYLE = 'hiddenInset';
const DEFAULT_ALWAYS_ON_TOP_LEVEL = 'floating';
// 独立窗口模式：窗口绑定在打开时所在的桌面，打开期间切换桌面不跟随。
// 显示后延迟绑定一次，等 macOS 的空间切换动画结束，避免窗口被系统重新分配到旧桌面。
const SPACE_BIND_DELAY_MS = 60;
const RULES_WINDOW_SIZE_RATIO = 0.8;
const RULES_WINDOW_QUERY = 'rules';
const PROTOCOL_SCHEME = 'workshop';
const PROTOCOL_HOST = 'project';
const PROTOCOL_OPEN_PATH = '/open';

const packageJson = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as {
  creationWorkshop?: CreationWorkshopConfig;
};
const config = packageJson.creationWorkshop ?? {};
const windowWidth = config.window?.width ?? DEFAULT_WINDOW_WIDTH;
const windowHeight = config.window?.height ?? DEFAULT_WINDOW_HEIGHT;
const windowMinWidth: number = config.window?.minWidth ?? DEFAULT_WINDOW_MIN_WIDTH;
const windowMinHeight: number = config.window?.minHeight ?? DEFAULT_WINDOW_MIN_HEIGHT;
const windowMaxWidth: number = config.window?.maxWidth ?? DEFAULT_WINDOW_MAX_WIDTH;
const windowMaxHeight: number = config.window?.maxHeight ?? DEFAULT_WINDOW_MAX_HEIGHT;
const titleBarStyle = config.window?.titleBarStyle ?? DEFAULT_TITLE_BAR_STYLE;
const windowAlwaysOnTop = config.window?.alwaysOnTop ?? false;
const windowAlwaysOnTopLevel = config.window?.alwaysOnTopLevel ?? DEFAULT_ALWAYS_ON_TOP_LEVEL;
const projectConfig = config.project ?? {};
const trayIconFile = config.tray?.iconFile ?? 'src/assets/imgs/trayTemplate.png';

const WINDOW_COLLECTION_BEHAVIOR = { visibleOnFullScreen: true, skipTransformProcessType: true } as const;

app.setName(APP_NAME);

/**
 * 命令行模式：以 `--cli` 参数启动时只执行命令行工具的逻辑并退出。
 *
 * - 不创建窗口与托盘，不占用单实例锁（桌面应用正在运行时同样可用）；
 * - 参数原样转发给 CLI，CLI 自行解析并输出结果，退出码即进程退出码；
 * - CLI 构建产物与主进程同在 `release/` 下，缺失时给出明确提示而不是静默退出。
 */
const CLI_FLAG = '--cli';
const cliFlagIndex = process.argv.indexOf(CLI_FLAG);
const isCliMode = cliFlagIndex >= 0;
if (isCliMode) {
  try {
    const cliModule = require(join(__dirname, '..', 'cli', 'cli.cjs')) as { runCli: (args: string[]) => Promise<number> };
    void cliModule
      .runCli(process.argv.slice(cliFlagIndex + 1))
      .then((exitCode) => app.exit(exitCode))
      .catch((error: unknown) => {
        console.error(`[${APP_NAME}] 命令行模式启动失败：${(error as Error)?.message ?? String(error)}`);
        app.exit(1);
      });
  } catch (error) {
    console.error(`[${APP_NAME}] 命令行模式启动失败：${(error as Error)?.message ?? String(error)}`);
    app.exit(1);
  }
}

let mainWindow: BrowserWindow | null = null;
let rulesWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let isReadyToShow = false;
// 显示 / 隐藏之间短暂切换时用于把窗口重新绑定到当前桌面
let desktopBindTimer: NodeJS.Timeout | null = null;
let projectManager: ProjectManager | null = null;
let protocolReady = false;
// 应用尚未完成初始化时收到的项目链接，等初始化完成后补处理
let pendingProjectName: string | null = null;

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

/**
 * 把窗口移动到鼠标所在的显示器并居中，使重新打开时落在用户当前操作的桌面。
 * 仅调整位置，不小于最小尺寸，且不超出该显示器工作区。
 */
function moveWindowToCursorDisplay(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  try {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const area = display.workArea;
    const size = win.getSize();
    const width = size[0] ?? windowWidth;
    const height = size[1] ?? windowHeight;
    const safeWidth = Math.min(Math.max(width, windowMinWidth), Math.min(windowMaxWidth, area.width));
    const safeHeight = Math.min(Math.max(height, windowMinHeight), Math.min(windowMaxHeight, area.height));
    const x = Math.round(area.x + Math.max(0, (area.width - safeWidth) / 2));
    const y = Math.round(area.y + Math.max(0, (area.height - safeHeight) / 2));
    win.setBounds({ x, y, width: safeWidth, height: safeHeight });
  } catch {
    // 位置调整失败时保持系统默认位置
  }
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
 * - 窗口已显示时只抬高并聚焦，不改变桌面归属，也不反复抢焦点；
 * - `forceForeground` 用于外部协议等需要主动置前的场景，窗口已显示时也会抢回应用焦点。
 */
function showMainWindow(forceForeground = false): void {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  if (win.isMinimized()) win.restore();
  // 页面尚未渲染完成：先返回，`ready-to-show` 会再次调用本函数完成显示（避免白屏闪烁）
  if (!isReadyToShow) return;

  const alreadyVisible = win.isVisible();
  applyNormalWindowLevel(win);
  cancelDesktopBind();
  if (!alreadyVisible) {
    moveWindowToCursorDisplay(win);
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, WINDOW_COLLECTION_BEHAVIOR);
  }

  win.show();
  win.moveTop();
  if (alreadyVisible) {
    if (forceForeground && process.platform === 'darwin') app.focus({ steal: true });
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
    void child.loadFile(join(app.getAppPath(), 'release', 'renderer', 'index.html'), { query: { window: RULES_WINDOW_QUERY } });
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
  nextTray.on('click', () => showMainWindow());
  nextTray.on('right-click', () => {
    nextTray.popUpContextMenu(
      Menu.buildFromTemplate([{ label: '打开主界面', click: () => showMainWindow() }, { type: 'separator' }, { label: `退出${APP_NAME}`, click: () => app.quit() }]),
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
        { label: '显示主界面', click: () => showMainWindow() },
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
    resizable: true,
    minWidth: windowMinWidth,
    minHeight: windowMinHeight,
    maxWidth: windowMaxWidth,
    maxHeight: windowMaxHeight,
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
  } else void mainWindow.loadFile(join(app.getAppPath(), 'release', 'renderer', 'index.html'));

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

/** 解析 `workshop://project/open?name=xxx`，返回项目名称；格式不符时返回 null。 */
function parseProjectLink(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== `${PROTOCOL_SCHEME}:`) return null;
    if (url.hostname !== PROTOCOL_HOST || url.pathname !== PROTOCOL_OPEN_PATH) return null;
    const name = (url.searchParams.get('name') ?? '').trim();
    return name || null;
  } catch {
    return null;
  }
}

function findProjectLink(args: string[]): string | undefined {
  const prefix = `${PROTOCOL_SCHEME}://`;
  return args.find((arg) => arg.startsWith(prefix));
}

async function openProjectByName(name: string): Promise<void> {
  if (!projectManager || !protocolReady) {
    pendingProjectName = name;
    return;
  }
  const result = await projectManager.openByName(name);
  if (!result.ok) {
    showMainWindow(true);
    void dialog.showMessageBox({
      type: 'error',
      title: APP_NAME,
      message: result.message ?? `无法打开项目「${name}」`,
    });
    return;
  }
  showMainWindow(true);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.projectsChanged, result.project ?? null);
  }
}

function handleProjectLink(rawUrl: string): void {
  const name = parseProjectLink(rawUrl);
  if (!name) {
    console.warn(`[${APP_NAME}] 无法识别的项目链接：${rawUrl}`);
    return;
  }
  if (!projectManager || !protocolReady) {
    pendingProjectName = name;
    return;
  }
  void openProjectByName(name);
}

function registerProtocol(): void {
  const entry = process.argv[1];
  const registered =
    process.defaultApp && entry
      ? app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [resolve(entry)])
      : app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
  if (!registered) console.warn(`[${APP_NAME}] 未能注册系统协议：${PROTOCOL_SCHEME}://`);
}

// 命令行模式不占用单实例锁：桌面应用正在运行时 CLI 仍可正常使用。
const singleInstanceLock = isCliMode ? true : app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const link = findProjectLink(argv);
    if (link) handleProjectLink(link);
    else showMainWindow(true);
  });
}

// 命令行模式只跑 CLI：不注册系统协议、不初始化窗口与托盘。
if (!isCliMode) {
  registerProtocol();

  // macOS 通过 `open-url` 投递协议链接；Windows / Linux 通过启动参数传入。
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProjectLink(url);
  });

  const startupProjectLink = findProjectLink(process.argv);
  if (startupProjectLink) handleProjectLink(startupProjectLink);
}

app.whenReady().then(async () => {
  // 命令行模式只跑 CLI：不创建窗口、托盘与 IPC
  if (isCliMode) return;
  if (!singleInstanceLock) return;
  // 启动即隐藏 Dock 图标（macOS）：应用只驻留托盘，启动时不打开主窗口
  hideDockIcon();
  const storage = new WorkshopStorage({ dataDirName: projectConfig.dataDirName });
  const projects = new ProjectManager(app.getPath('userData'), storage, projectConfig);
  projectManager = projects;
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
  protocolReady = true;
  if (pendingProjectName) {
    const name = pendingProjectName;
    pendingProjectName = null;
    void openProjectByName(name);
  }
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
