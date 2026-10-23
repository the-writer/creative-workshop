# 8. 构建与发布

### 8.1 脚本

| 命令                | 行为                                           |
| ------------------- | ---------------------------------------------- |
| `pnpm start`        | 构建渲染层与主进程后启动 Electron              |
| `pnpm dev:renderer` | 启动 Vite 渲染层开发服务器                     |
| `pnpm build`        | 类型检查、Vite 构建、Electron CommonJS 编译    |
| `pnpm test`         | 运行 Vitest 单元测试                           |
| `pnpm dist:mac`     | 清理旧产物、重新构建并生成 macOS arm64 DMG/ZIP |

源码构建输出：

- `dist/`：渲染层。
- `dist-electron/`：主进程与预加载脚本。
- `release/`：打包产物，不参与源码提交。

### 8.2 打包配置

`package.json` 中的 `build` 段配置：

- `appId`: `cn.com.stdout.creation-workshop`
- `productName`: `创作工坊`
- macOS target：arm64 的 DMG 与 ZIP
- `asar`: 启用
- `afterPack`: `scripts/after-pack.cjs`
- macOS `identity`: `null`，跳过不可用的自动钥匙串身份，由后处理执行 ad-hoc 签名
- `files` 明确包含 `assets/imgs/trayTemplate*.png`，保证打包后托盘图标可加载
- 产物名：`creation-workshop-v<version>-<arch>.<ext>`

`dist:mac` 先执行 `scripts/clean-dist.sh`，删除 `dist`、`dist-electron` 与 `release`，确保不复用旧构建。

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
