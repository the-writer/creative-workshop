# 1. 产品与技术架构

### 1.1 产品定位

创作工坊面向小说作者、世界观构建者与桌游设定作者，用于离线生成和整理人族、精灵族的人名、地名、官职与绰号。应用不依赖远程业务页面、AI 服务或账号体系。

当前版本为 **1.1.0**（`package.json` → `version`）。

### 1.2 进程结构

| 层              | 目录 / 文件                               | 职责                                                                       |
| --------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| Electron 主进程 | `electron/main.cts`                       | 创建窗口、托盘、应用菜单、安全策略、读取 `creationWorkshop` 配置并注册 IPC |
| 项目管理        | `electron/services/project-manager.cts`   | `userData/projects.json` 最近项目、打开/新建项目、VS Code 打开、旧数据迁移 |
| 项目数据服务    | `electron/services/workshop-storage.cts`  | 打开项目、读写 `.workshop` 分类文件、串行队列、级联规则、统计              |
| Markdown 读写   | `electron/services/workshop-markdown.cts` | 各类 Markdown 的解析与序列化、字段转义、容错读取、图谱快照                 |
| 预加载桥        | `electron/preload.cts`                    | 通过 `contextBridge` 暴露白名单 `window.workshop`                          |
| IPC 边界        | `electron/ipc/workshop-ipc.cts`           | 校验调用来源、处理项目/数据/剪贴板请求                                     |
| 渲染层          | `src/`                                    | React 界面、项目门与纯本地命名生成                                         |
| 打包脚本        | `scripts/`                                | 清理旧产物、打包后处理与安装脚本                                           |

渲染进程禁止直接访问 Node.js、文件系统与子进程；`nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`（`electron/main.cts`）。

### 1.3 启动流程与项目门

应用启动后不自动打开上次项目：主进程初始化项目登记后创建窗口与托盘，窗口在 `ready-to-show` 时立即显示；渲染层查询「当前项目」，为空时展示项目门，由用户选择最近项目、打开已有项目或新建项目。

```mermaid
flowchart TD
  A[app.whenReady] --> B[创建 WorkshopStorage 与 ProjectManager]
  B --> C[ProjectManager.initialize：读取 projects.json]
  C --> D{projects.json 不存在且旧 workshop.json 存在}
  D -- 是 --> E[迁移旧数据为 userData/projects/默认项目]
  D -- 否 --> F[跳过迁移]
  E --> G[注册 IPC、菜单、窗口、托盘]
  F --> G
  G --> H[窗口 ready-to-show 显示]
  H --> I[渲染层 getCurrentProject]
  I --> J{是否已有当前项目}
  J -- 否 --> K[项目门：最近项目 / 打开已有项目 / 新建项目]
  K --> L[open/create 成功]
  J -- 是 --> L
  L --> M[进入主界面并加载 .workshop 数据]
```

项目门行为（`src/components/ProjectGate.tsx`）：

- 最近项目列表来自 `userData/projects.json`，按 `lastOpenedAt` 倒序；不存在的项目目录在列表查询时被过滤（`ProjectManager.listRecent`）。
- 「打开已有项目…」调用系统目录选择框，只列目录；所选目录必须包含 `.workshop` 数据目录，否则提示「该目录不是创作工坊项目（缺少 .workshop 数据目录）」。
- 「新建项目」先选择存放位置，再输入项目名称；名称不能为空、不能以 `.` 开头、不能包含 `\ / : * ? " < > |` 或控制字符，长度不超过 **60** 字符（`MAX_PROJECT_NAME_LENGTH`，渲染层输入框同为 `maxLength=60`）。
- 新建时目标目录不能已存在；成功后创建 `<parentDir>/<name>/.workshop` 并写入各分类文件。
- 设置页「切换项目」只回到项目门（渲染层将当前项目置空），不关闭主进程内的数据服务；再次打开项目时替换当前项目。

### 1.4 窗口行为

| 项目           | 值                 | 来源                                                         |
| -------------- | ------------------ | ------------------------------------------------------------ |
| 窗口内容尺寸   | 800 × 600          | `package.json` → `creationWorkshop.window.width/height`      |
| 尺寸缺省回退   | 640 × 480          | `electron/main.cts`（配置缺省时）                            |
| 标题栏样式     | `hiddenInset`      | `package.json` → `creationWorkshop.window.titleBarStyle`     |
| 红绿灯位置     | `{ x: 12, y: 12 }` | `electron/main.cts` → `trafficLightPosition`                 |
| 窗口类型       | 普通窗口           | Electron 默认（不设置 `type`）                               |
| 默认置顶       | 否                 | `creationWorkshop.window.alwaysOnTop`                        |
| 可调整尺寸     | 否                 | `electron/main.cts` → `resizable/maximizable/fullscreenable` |
| 使用内容尺寸   | 是                 | `electron/main.cts` → `useContentSize: true`                 |
| 窗口背景色     | `#f5efe2`          | `electron/main.cts` → `backgroundColor`                      |
| 应用名         | 创作工坊           | `package.json` → `productName`；`app.setName`                |
| 拖拽标题栏高度 | 32 px              | `src/App.css` → `.desktop-titlebar`                          |

应用加载 `dist/index.html`；开发调试可通过 `VITE_DEV_SERVER_URL` 指向本地 Vite 服务，并在该模式下自动打开独立 DevTools。

启动时窗口由 `mainWindow.once('ready-to-show', showMainWindow)` 显示，用户首先看到项目门。主窗口系统关闭按钮只隐藏窗口（`close` 事件阻止默认并 `hide()`），应用继续由托盘驻留；托盘左键与右键菜单「打开主界面」重新打开，应用 `activate` 事件（macOS 点击 Dock）也重新打开。托盘右键菜单提供「打开主界面」和「退出创作工坊」。

主进程在 macOS 使用普通窗口（不设置 `type`），默认不启用 `alwaysOnTop`。窗口以
`setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true, skipTransformProcessType: true })` 绑定到打开时所在的桌面，用户切换桌面时不会跟随，始终留在原桌面。

> 不使用 `type: 'panel'`：Electron 的 panel 窗口会出现在所有桌面（Spaces）上，导致切换桌面时窗口跟着跑到新桌面。

从隐藏状态点击托盘重新打开时，主进程先临时启用“所有工作区可见”，随后调用 `show()`、`focus()`、`moveTop()`，并在 **60ms** 后重新绑定当前桌面。因此窗口会在点击托盘时所在的桌面打开，而不是被系统拉回旧桌面；绑定完成后普通桌面切换不会再带走窗口。

应用在 `Info.plist` 中显式声明 `NSHighResolutionCapable=true`，页面缩放固定为 1，并启用字体平滑以适配 Retina/HiDPI 显示。默认字体依次尝试思源宋体、仿宋、宋体，均不存在时回退系统默认字体。

### 1.5 安全与导航

- 仅接受来自应用 `file://` 页面或本机开发服务器（`http://127.0.0.1:` / `http://localhost:`）的 IPC 调用；其它来源直接抛错（`electron/ipc/workshop-ipc.cts` → `trustedSender`）。
- 禁止创建新窗口、嵌入 Webview 与页面导航。
- 所有媒体权限请求默认拒绝。
- 页面使用 Content Security Policy，只允许本地脚本、样式、图片与数据 URL。
- 不加载远程字体或图标资源。
- 渲染层不能指定任意保存路径；项目路径来自系统目录选择对话框或项目登记文件。

### 1.6 配置项（`package.json` → `creationWorkshop`）

| 配置键                       | 默认值 / 实际值                | 作用                             | 读取位置                                                   |
| ---------------------------- | ------------------------------ | -------------------------------- | ---------------------------------------------------------- |
| `project.dataDirName`        | `.workshop`                    | 项目内数据目录名                 | `electron/main.cts` → `ProjectManager` / `WorkshopStorage` |
| `project.registryFileName`   | `projects.json`                | `userData` 下项目登记文件名      | `electron/main.cts` → `ProjectManager`                     |
| `project.legacyDataFileName` | `workshop.json`                | 旧版单 JSON 数据文件名（迁移源） | `electron/main.cts` → `ProjectManager`                     |
| `project.maxRecentProjects`  | `10`                           | 最近项目数量上限                 | `electron/main.cts` → `ProjectManager`                     |
| `window.width` / `height`    | `800` / `600`                  | 窗口内容尺寸                     | `electron/main.cts`                                        |
| `window.titleBarStyle`       | `hiddenInset`                  | 标题栏样式                       | `electron/main.cts`                                        |
| `window.alwaysOnTop`         | `false`                        | 是否默认置顶                     | `electron/main.cts`                                        |
| `tray.iconFile`              | `assets/imgs/trayTemplate.png` | 托盘模板图标                     | `electron/main.cts`                                        |

四个 `project.*` 配置项缺省时回退到上表默认值；空字符串视为未配置。旧版 `creationWorkshop.storage.fileName` 已不存在。

### 1.7 数据位置

- 项目登记：`<userData>/projects.json`（`ProjectManager` 启动日志输出绝对路径）。
- 项目数据：用户选择的项目目录下 `.workshop/` 内的六个 Markdown 文件（详见 §7）。
- 迁移来源：`<userData>/workshop.json`（仅首次升级读取一次，迁移后保留原文件）。
- `userData` 由 Electron 按应用名与平台确定；渲染层不感知具体绝对路径。

### 1.8 资源与目录

- 应用图标：`assets/imgs/app-icon.png`、`assets/imgs/app-icon.icns`。
- 托盘模板图标：`assets/imgs/trayTemplate.png`、`trayTemplate@2x.png`、`trayTemplate@3x.png`。
- 应用内 SVG 图标通过 `lucide-react` 组件使用，不新增手写 SVG 标签。
- 图标资源仍随安装包分发：`package.json` → `build.files` 显式包含 `assets/imgs/trayTemplate*.png`。
- README 只包含应用图标与一句概述，功能细节以本 PRD 为准。
