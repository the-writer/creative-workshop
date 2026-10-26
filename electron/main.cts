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
    type?: string;
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
const DEFAULT_WINDOW_WIDTH = 640;
const DEFAULT_WINDOW_HEIGHT = 480;
// 缺省使用 macOS 面板窗口（跟随活跃 Space、层级高于普通窗口）；是否启用由配置项决定，可回退为普通窗口
const DEFAULT_WINDOW_TYPE = 'panel';
const DEFAULT_TITLE_BAR_STYLE = 'hiddenInset';
const DEFAULT_ALWAYS_ON_TOP_LEVEL = 'floating';
// 需要盖住其它应用全屏 Space（浏览器/游戏/Flutter 全屏）时**临时**使用的层级，窗口拿到焦点后即恢复
const FULLSCREEN_OVERLAY_LEVEL = 'screen-saver';
// 全屏覆盖层级只保留很短一段时间：超时后无论焦点事件是否到达都恢复常态层级，避免长期压住其它应用
const LEVEL_RESTORE_TIMEOUT_MS = 300;
// 窗口隐藏后等待一段时间再撤销「所有工作区可见」，让 macOS 的空间过渡结束，撤销时不闪动
const SPACE_SETTLE_DELAY_MS = 60;
// 隐藏 / 显示间隔大于该值时，视为用户「关闭后重新打开」，需要重新做一次全屏覆盖与抢焦点
// （遮挡焦点丢失与窗口真正隐藏之间存在延迟，不能用 isVisible() 单独判断）
const REVEAL_MIN_INTERVAL_MS = 1000;

const packageJson = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as {
  creationWorkshop?: CreationWorkshopConfig;
};
const config = packageJson.creationWorkshop ?? {};
const windowWidth = config.window?.width ?? DEFAULT_WINDOW_WIDTH;
const windowHeight = config.window?.height ?? DEFAULT_WINDOW_HEIGHT;
const windowType = process.platform === 'darwin' ? (config.window?.type ?? DEFAULT_WINDOW_TYPE) : undefined;
const titleBarStyle = config.window?.titleBarStyle ?? DEFAULT_TITLE_BAR_STYLE;
const windowAlwaysOnTop = config.window?.alwaysOnTop ?? false;
const windowAlwaysOnTopLevel = config.window?.alwaysOnTopLevel ?? DEFAULT_ALWAYS_ON_TOP_LEVEL;
const projectConfig = config.project ?? {};
const trayIconFile = config.tray?.iconFile ?? 'assets/imgs/trayTemplate.png';

app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let isReadyToShow = false;
// 窗口隐藏时刻，用于区分「关闭后再打开」与「窗口已在可见状态再次请求打开」
let lastHiddenAt = Date.now();
// 临时抬层级（全屏覆盖）的兜底恢复定时器，同一时间最多一个，hide / before-quit 时清理
let levelRestoreTimer: NodeJS.Timeout | null = null;

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
 * 配置为 false 时**不调用 `setAlwaysOnTop`**（连 `setAlwaysOnTop(false, level)` 也不调），
 * 避免以任意层级的键给窗口留下置顶记录，重现「关掉再打开长期悬浮在最上层」的问题。
 */
function applyNormalWindowLevel(win: BrowserWindow): void {
  if (process.platform !== 'darwin' || !windowAlwaysOnTop) return;
  win.setAlwaysOnTop(true, windowAlwaysOnTopLevel);
}

/**
 * 清除窗口上的置顶状态并恢复常态层级。
 *
 * 只有窗口加载时按配置置顶过（`windowAlwaysOnTop` 为真）才需要清理：先无条件
 * `setAlwaysOnTop(false)` 把残留的 `screen-saver` 临时层级清掉，再恢复到配置的常态层级；
 * 配置为 false 时窗口从未置顶，绝不出现在任何 alwaysOnTop 层级里。重复调用是幂等的。
 */
function clearWindowLevel(): void {
  if (!windowAlwaysOnTop) return;
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(false);
  applyNormalWindowLevel(win);
}

/**
 * 撤销临时的全屏覆盖层级并清掉兜底定时器。
 *
 * 由 `focus` 一次性监听、`LEVEL_RESTORE_TIMEOUT_MS` 兜底定时器、`hide`/`closed` 触发；
 * 同一时间只保留一个定时器，不会叠加。
 */
function releaseFullscreenOverlay(): void {
  if (levelRestoreTimer) {
    clearTimeout(levelRestoreTimer);
    levelRestoreTimer = null;
  }
  clearWindowLevel();
}

/**
 * 把窗口显示到「当前 Space」、取得键盘焦点，然后回到窗口常态层级。
 *
 * 显示流程（唯一出口；`show` / `focus` 事件里不再抢焦点）：
 * 1. 页面就绪前只做登记后返回，真正的显示由 `ready-to-show` 再次调用本函数完成（避免白屏闪烁）。
 * 2. `revealed` 表示「这次是不是用户把窗口重新打开」：隐藏超过 `REVEAL_MIN_INTERVAL_MS`，或窗口本就不可见。
 *    只有这种场景才做一次临时抬升与抢焦点；窗口已在前台再次请求打开时不会反复叠加。
 * 3. 置顶：配置 `window.alwaysOnTop` 为 true 时才置顶；窗口重新打开时临时用 `FULLSCREEN_OVERLAY_LEVEL`
 *    盖住其它应用的全屏 Space，并由「拿到焦点」/`LEVEL_RESTORE_TIMEOUT_MS` 兜底恢复为常态层级。
 *    配置为 false 时**不调用任何置顶设置**，窗口自始至终不处于 alwaysOnTop 层级。
 * 4. 全屏可见：仅在 darwin 且 `revealed` 时启用「所有工作区可见 + 全屏可见」。panel 窗口跟随活跃 Space，
 *    因此这一步只用于「当前 Space 恰好是其它应用全屏」的情况；窗口隐藏后由 `releaseFromAllSpaces` 撤销。
 * 5. 抢焦点只发生一次：`app.focus({ steal: true })`（LSUIElement 无 Dock 图标时把应用激活为前台）
 *    紧接着 `win.focus()`；窗口已在前台时不再抢焦点，避免打断用户。
 */
function showMainWindow(): void {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
  const revealed = !win.isVisible() || Date.now() - lastHiddenAt >= REVEAL_MIN_INTERVAL_MS;
  if (win.isMinimized()) win.restore();
  // 页面尚未渲染完成：先返回，`ready-to-show` 会带着同一判断条件再次进来
  if (!isReadyToShow) return;

  // 配置未开启置顶时这里不会调用任何 setAlwaysOnTop，窗口自始至终不处于 alwaysOnTop 层级
  applyNormalWindowLevel(win);
  if (process.platform === 'darwin' && revealed) {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }
  // 仅 macOS、且需要临时压过其它应用的全屏窗口时才抬层；拿到焦点 / 兜底超时后恢复常态层级
  if (process.platform === 'darwin' && revealed && windowAlwaysOnTop) win.setAlwaysOnTop(true, FULLSCREEN_OVERLAY_LEVEL);

  win.show();
  win.moveTop();
  if (!revealed) return;

  if (process.platform === 'darwin') app.focus({ steal: true });
  win.focus();

  // 兜底：即使 `focus` 事件没到达，也在此后恢复常态层级，不会长期停留在全屏覆盖层级
  if (levelRestoreTimer) clearTimeout(levelRestoreTimer);
  levelRestoreTimer = setTimeout(releaseFullscreenOverlay, LEVEL_RESTORE_TIMEOUT_MS);
}

/**
 * 窗口隐藏或销毁后撤销「所有工作区可见」，让下一次打开落在当前活跃 Space。
 *
 * 延迟 `SPACE_SETTLE_DELAY_MS` 执行：此时窗口已不可见，撤销不会造成闪动；
 * 撤销后窗口仍是 panel，随当前活跃 Space 走，而不是被系统拉回首次打开时的桌面。
 */
function releaseFromAllSpaces(): void {
  if (process.platform !== 'darwin') return;
  setTimeout(() => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    win.setVisibleOnAllWorkspaces(false, { skipTransformProcessType: true });
  }, SPACE_SETTLE_DELAY_MS);
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
    // macOS 上面板窗口（`type: 'panel'`）：层级高于普通窗口、跟随当前活跃 Space（含全屏 Space），
    // 默认非激活面板且不能成为主窗口，因此不会把用户从其它应用的全屏界面里"拉回桌面"
    type: windowType,
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

  // 启动后先显示窗口选择项目；关闭按钮仍只隐藏窗口，应用由托盘驻留
  mainWindow.once('ready-to-show', () => {
    isReadyToShow = true;
    showMainWindow();
  });
  mainWindow.on('focus', () => {
    // 窗口拿到键盘焦点说明已成功显示在全屏 Space 之上，立即撤销临时的全屏覆盖层级
    releaseFullscreenOverlay();
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('hide', () => {
    lastHiddenAt = Date.now();
    releaseFullscreenOverlay();
    releaseFromAllSpaces();
  });
  mainWindow.on('closed', () => {
    releaseFullscreenOverlay();
    mainWindow = null;
    isReadyToShow = false;
  });
  return mainWindow;
}

app.whenReady().then(async () => {
  // 启动即隐藏 Dock 图标（macOS）：应用常驻托盘，只通过托盘/菜单/激活事件打开窗口
  hideDockIcon();
  const storage = new WorkshopStorage({ dataDirName: projectConfig.dataDirName });
  const projects = new ProjectManager(app.getPath('userData'), storage, projectConfig);
  await projects.initialize();
  console.info(`[${APP_NAME}] 项目登记文件：${projects.registryFilePath}`);
  registerWorkshopIpc(storage, projects);
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
  if (levelRestoreTimer) {
    clearTimeout(levelRestoreTimer);
    levelRestoreTimer = null;
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
