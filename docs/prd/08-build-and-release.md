# 8. 构建与发布

### 8.1 脚本

VS Code 插件版本与主应用版本同步：版本更新时同时修改根 `package.json` 与 `vscode-extension/package.json` 的 `version`，并同步更新文档中的版本引用。

| 命令                     | 行为                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `pnpm start`             | 构建渲染层与主进程后启动 Electron                                                                      |
| `pnpm dev:renderer`      | 启动 Vite 渲染层开发服务器                                                                             |
| `pnpm build`             | 类型检查、Vite 构建、命令行工具打包、Electron CommonJS 编译，并自动构建 VS Code 插件 VSIX               |
| `pnpm build:cli`         | 仅构建命令行工具：`vite build --config vite.config.cli.ts` → `release/cli/cli.cjs`                        |
| `pnpm build:extension`   | 仅构建 `vscode-extension/`：类型检查、esbuild 打包、生成 `creation-workshop-v<version>.vsix`                  |
| `pnpm install:extension` | 按当前版本号把 `vscode-extension/creation-workshop-v<version>.vsix` 安装到 VS Code（`--force`）               |
| `pnpm test`              | 运行 Vitest 单测 + 编译 Electron + 编译命令行工具 + Markdown 存储与命令行工具测试                      |
| `pnpm dist:mac`          | 清理旧产物、重新构建并生成 macOS arm64 PKG，同时把 VSIX 复制到 `release/`                              |
| `pnpm install:mac`       | 全新执行 `dist:mac`，自动安装 VS Code 插件，再用系统 `installer` 静默安装 PKG（非 root 时调用 `sudo`） |

源码构建输出统一放在 `release/`：

- `release/renderer/`：渲染层（`vite.config.ts` → `build.outDir`）。
- `release/electron/`：主进程与预加载脚本（`tsconfig.electron.json` → `outDir`）。
- `release/cli/cli.cjs`：命令行工具（`vite.config.cli.ts` → `build.outDir`，单文件 CommonJS）。
- `vscode-extension/dist/extension.js`：插件运行时代码。
- `vscode-extension/creation-workshop-v<version>.vsix`：插件安装包。
- `release/`：同时作为 electron-builder 输出目录；`dist:mac` 后只保留应用 PKG 与插件 VSIX。整个目录不参与源码提交。

### 8.2 打包配置

`package.json` 中的 `build` 段配置（运行期配置 `creationWorkshop` 见 §1.6，其中 `project.*` 取代旧的 `storage.fileName`）：

- `appId`: `cn.com.stdout.creation-workshop`
- `productName`: `Creation Workshop`
- `protocols`: 声明系统协议 `workshop`（`schemes: ["workshop"]`），打包后写入 `Info.plist` 的 URL Types，供 §1.9 的项目链接使用
- macOS target：仅 arm64 PKG，不生成 DMG、ZIP 或 blockmap
- `asar`: 启用
- `afterPack`: `scripts/after-pack.cjs`
- 未提供 `CSC_LINK` / `CSC_NAME` / `APPLE_ID` 时由 `dist-mac.sh` 关闭证书自动发现，避免误用钥匙串中的无效身份；`.app` 由后处理执行 ad-hoc 签名
- `files` 明确包含 `release/renderer/**/*`、`release/electron/**/*`、`src/assets/imgs/trayTemplate*.png` 与 `package.json`，保证打包后主进程、渲染层与托盘图标可加载
- `mac.extendInfo`：`NSHighResolutionCapable: true`、`LSUIElement: true`（应用为菜单栏常驻应用，打包后不显示 Dock 图标，见 §1.4）
- 安装位置：固定 `/Applications`，禁止安装到任意位置或当前用户 Home
- `isRelocatable=false`，避免 macOS Installer 把新版本重定位到旧路径
- 产物名：`creation-workshop-v<version>-<arch>.pkg`

`dist:mac` 执行 `scripts/dist-mac.sh`：先删除整个 `release`，再重新构建（渲染层与主进程分别写入 `release/renderer`、`release/electron`）并调用
`electron-builder --mac --arm64 --publish never`。PKG 成功后删除 `release/` 中的 `renderer`、`electron`、`mac-arm64`、调试元数据与组件
plist，仅保留 `.pkg`，随后把 `vscode-extension/creation-workshop-v<version>.vsix` 复制到 `release/`。发布目录最终包含应用 PKG 与插件 VSIX；脚本不会生成 DMG 或 ZIP。

PKG 安装脚本目录为 `scripts/pkg-scripts`：

| 阶段          | 行为                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preinstall`  | 在 `/dev/console` 对应当前登录用户会话中请求“Creation Workshop”退出；等待 5 秒后仍运行则强制结束                                                           |
| `postinstall` | 安装完成后通过 `launchctl asuser` 从登录用户会话执行 `open -j /Applications/Creation Workshop.app`，隐藏启动新版本；应用仅在菜单栏显示托盘图标，不抢占前台；同时在 PATH 可达目录建立命令行工具软连接 `workshop`（详见 §10.7） |

不配置 Installer 的 `must-close` 交互声明；关闭旧进程完全由 `preinstall` 自动完成，避免安装时要求用户手动关闭应用。

命令行工具随应用打包：`runtime/` 目录通过 `build.extraResources` 安装到 `Creation Workshop.app/Contents/Resources/runtime`（`workshop.sh` 保留可执行权限），`release/cli/**/*` 进入 `app.asar`。`postinstall` 依次尝试在 `/usr/local/bin`、`/opt/homebrew/bin` 建立指向 `Contents/Resources/runtime/workshop.sh` 的 `workshop` 软连接；目录不可写时跳过，不影响安装结果（见 §10.6、§10.7）。

未配置 Developer ID Application / Developer ID Installer 证书时，`.app` 使用 ad-hoc 签名，PKG 本身未签名；
仍需正式分发时应同时配置两类 Developer ID 证书。

打包后处理固定按“asar 保护 → Electron Fuses → ad-hoc 签名”执行：

- 使用 `asarmor` 修改 `app.asar` 头部。
- 关闭 `RunAsNode`、Node 环境变量与 CLI 调试参数；启用 Cookie 加密；仅允许从 `app.asar` 加载。
- 因 asar 保护需要改写文件，关闭嵌入式 asar 完整性校验。
- macOS arm64 在翻转 Fuses 后执行 ad-hoc 重签；正式发布仍应配置稳定的 Developer ID。

### 8.3 依赖策略

- 包管理统一使用 `pnpm`，锁文件为 `pnpm-lock.yaml`；根目录 `pnpm-workspace.yaml` 将 `.` 与 `vscode-extension` 纳入同一 workspace。
- 运行时依赖只保留 React、React DOM、Lucide 图标与样式合并工具。
- Electron 与 electron-builder 放在 `devDependencies`。
- VS Code 插件的 `@types/vscode`、`@vscode/vsce`、`esbuild`、`typescript` 放在其自身 `devDependencies`，由 workspace 统一安装。
- 不保留音频、3D、AI、移动端组件库或未引用 UI 组件。

### 8.4 验证门槛

提交功能前至少执行：

```sh
pnpm run typecheck
pnpm test
pnpm run build
```

涉及桌面窗口、托盘或 IPC 的改动还需进行一次 Electron 启动验证，并在同一轮检查：启动时只有托盘且不弹主窗口、点击托盘后出现项目门与「上次」TAG、打开目录自动初始化 `.workshop`、主界面、规则设置模态子窗口、托盘图标加载与桌面切换不跟随。
构建变更还应确认 `pnpm run build` 后存在 `release/renderer/index.html`、`release/electron/main.cjs` 与 `release/cli/cli.cjs`；打包变更还应确认 `release/` 中只有 `.pkg` 与 `creation-workshop-v<version>.vsix`，并检查安装脚本已被打入安装包。

命令行工具改动还需确认 `pnpm run build:cli` 通过、`node release/cli/cli.cjs --count 3` 输出表格、`runtime/workshop.sh` 能正确转发参数（含软连接场景），打包后 `Contents/Resources/runtime/workshop.sh` 存在且可执行。

插件改动还需确认 `pnpm run build:extension` 通过，且 `vscode-extension/creation-workshop-v<version>.vsix` 包含 `package.json`、`README.md`、`LICENSE.txt`、`assets/imgs/app-icon.png` 与 `dist/extension.js`，不包含 `src/` 与 `scripts/`。
