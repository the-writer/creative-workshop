# 8. 构建与发布

### 8.1 脚本

| 命令                | 行为                                        |
| ------------------- | ------------------------------------------- |
| `pnpm start`        | 构建渲染层与主进程后启动 Electron           |
| `pnpm dev:renderer` | 启动 Vite 渲染层开发服务器                  |
| `pnpm build`        | 类型检查、Vite 构建、Electron CommonJS 编译 |
| `pnpm test`         | 运行 Vitest 单元测试                        |
| `pnpm dist:mac`     | 清理旧产物、重新构建并生成 macOS arm64 PKG  |

源码构建输出：

- `dist/`：渲染层。
- `dist-electron/`：主进程与预加载脚本。
- `release/`：打包产物，不参与源码提交。

### 8.2 打包配置

`package.json` 中的 `build` 段配置：

- `appId`: `cn.com.stdout.creation-workshop`
- `productName`: `创作工坊`
- macOS target：仅 arm64 PKG，不生成 DMG、ZIP 或 blockmap
- `asar`: 启用
- `afterPack`: `scripts/after-pack.cjs`
- 未提供 `CSC_LINK` / `CSC_NAME` / `APPLE_ID` 时由 `dist-mac.sh` 关闭证书自动发现，避免误用钥匙串中的无效身份；`.app` 由后处理执行 ad-hoc 签名
- `files` 明确包含 `assets/imgs/trayTemplate*.png`，保证打包后托盘图标可加载
- 安装位置：固定 `/Applications`，禁止安装到任意位置或当前用户 Home
- `isRelocatable=false`，避免 macOS Installer 把新版本重定位到旧路径
- 产物名：`creation-workshop-v<version>-<arch>.pkg`

`dist:mac` 执行 `scripts/dist-mac.sh`：先删除 `dist`、`dist-electron` 与 `release`，再重新构建并调用
`electron-builder --mac --arm64 --publish never`。PKG 成功后删除 `release/` 中的 `mac-arm64`、调试元数据与组件
plist，使发布目录只保留 `.pkg`。脚本不会生成 DMG 或 ZIP。

PKG 安装脚本目录为 `scripts/pkg-scripts`：

| 阶段          | 行为                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `preinstall`  | 在 `/dev/console` 对应当前登录用户会话中请求“创作工坊”退出；等待 5 秒后仍运行则强制结束                |
| `postinstall` | 安装完成后通过 `launchctl asuser` 从登录用户会话执行 `open /Applications/创作工坊.app`，自动启动新版本 |

不配置 Installer 的 `must-close` 交互声明；关闭旧进程完全由 `preinstall` 自动完成，避免安装时要求用户手动关闭应用。

未配置 Developer ID Application / Developer ID Installer 证书时，`.app` 使用 ad-hoc 签名，PKG 本身未签名；
仍需正式分发时应同时配置两类 Developer ID 证书。

打包后处理固定按“asar 保护 → Electron Fuses → ad-hoc 签名”执行：

- 使用 `asarmor` 修改 `app.asar` 头部。
- 关闭 `RunAsNode`、Node 环境变量与 CLI 调试参数；启用 Cookie 加密；仅允许从 `app.asar` 加载。
- 因 asar 保护需要改写文件，关闭嵌入式 asar 完整性校验。
- macOS arm64 在翻转 Fuses 后执行 ad-hoc 重签；正式发布仍应配置稳定的 Developer ID。

### 8.3 依赖策略

- 包管理统一使用 `pnpm`，锁文件为 `pnpm-lock.yaml`。
- 运行时依赖只保留 React、React DOM、Lucide 图标与样式合并工具。
- Electron 与 electron-builder 放在 `devDependencies`。
- 不保留音频、3D、AI、移动端组件库或未引用 UI 组件。

### 8.4 验证门槛

提交功能前至少执行：

```sh
pnpm run typecheck
pnpm test
pnpm run build
```

涉及桌面窗口、托盘或 IPC 的改动还需进行一次 Electron 启动验证，并在同一轮检查 JSON 文件路径、主界面、托盘图标加载与关键弹窗。
打包变更还应确认 `release/` 中只有 `.pkg`，并检查安装脚本已被打入安装包。
