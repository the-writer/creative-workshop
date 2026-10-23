# 1. 产品与技术架构

### 1.1 产品定位

创作工坊面向小说作者、世界观构建者与桌游设定作者，用于离线生成和整理人族、妖族的人名、地名、官职与绰号。应用不依赖远程业务页面、AI 服务或账号体系。

当前版本为 **1.0.0**。

### 1.2 进程结构

| 层              | 目录                                     | 职责                                              |
| --------------- | ---------------------------------------- | ------------------------------------------------- |
| Electron 主进程 | `electron/main.cts`                      | 创建窗口、应用菜单、安全策略与 IPC 注册           |
| 预加载桥        | `electron/preload.cts`                   | 通过 `contextBridge` 暴露白名单 `window.workshop` |
| IPC 边界        | `electron/ipc/workshop-ipc.cts`          | 校验调用来源、处理数据与文件请求                  |
| 数据服务        | `electron/services/workshop-storage.cts` | JSON 读取、规范化、串行写入与级联规则             |
| 渲染层          | `src/`                                   | React 界面与纯本地命名生成                        |
| 打包脚本        | `scripts/`                               | 清理旧产物与构建前处理                            |

渲染进程禁止直接访问 Node.js、文件系统与子进程；`nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`。

### 1.3 窗口行为

| 项目            | 值            | 来源                                                     |
| --------------- | ------------- | -------------------------------------------------------- |
| 窗口内容尺寸    | 640 × 480     | `package.json` → `creationWorkshop.window.width/height`  |
| 标题栏样式      | `hiddenInset` | `package.json` → `creationWorkshop.window.titleBarStyle` |
| 可调整尺寸      | 否            | `electron/main.cts`                                      |
| 可最大化 / 全屏 | 否            | `electron/main.cts`                                      |
| 应用名          | 创作工坊      | `package.json` → `productName`                           |
| 拖拽标题栏高度  | 32 px         | `src/App.css` → `.desktop-titlebar`                      |

应用加载 `dist/index.html`；开发调试可通过 `VITE_DEV_SERVER_URL` 指向本地 Vite 服务。

### 1.4 安全与导航

- 仅接受来自应用 `file://` 页面或本机开发服务器的 IPC 调用。
- 禁止创建新窗口、嵌入 Webview 与页面导航。
- 所有媒体权限请求默认拒绝。
- 页面使用 Content Security Policy，只允许本地脚本、样式、图片与数据 URL。
- 不加载远程字体或图标资源。

### 1.5 资源与目录

- 应用图标：`assets/imgs/app-icon.png`、`assets/imgs/app-icon.icns`。
- 应用内 SVG 图标通过 `lucide-react` 组件使用，不新增手写 SVG 标签。
- README 只包含应用图标与一句概述，功能细节以本 PRD 为准。
