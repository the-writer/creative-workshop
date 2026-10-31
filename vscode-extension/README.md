# Type Stats

VS Code 写作辅助插件：状态栏字数统计、码字计时/速率，以及设定集关键词高亮。

> 插件仅在当前工作区存在 `.workshop/sheets.ini`（或 `typeStats.sheetsPath` 指向的文件）时生效。文件创建后自动启用，删除后自动停用。

## 功能

- 状态栏实时显示当前 `.txt` / `.md` 文档的有效字符数，点击查看总有效字符、中文字数、英文字数。
- 检测到文本插入或删除时启动计时；连续 5 秒无变动自动暂停。
- 状态栏显示累计码字时间（`hh:mm:ss`）与净输入速率（字/小时）。
- 读取 `.workshop/sheets.ini`，将所有 key 加粗高亮，左右渲染间距，鼠标悬浮显示对应 value。

## 安装

在仓库根目录执行：

```bash
pnpm install
pnpm run build:extension
code --install-extension vscode-extension/type-stats.vsix --force
```

安装后重新加载窗口，插件会在启动时自动激活。

## 设定集格式

在打开的工作区根目录创建 `.workshop/sheets.ini`：

```ini
[人物]
林深 = 边境调查员，故事主角

[地点]
边界城 = 边境地带最大的城市
```

- 左侧为要高亮的 Key，右侧为悬浮时显示的 value。
- 支持 `[分区]`、`;` / `#` 注释、单双引号包裹的 value。
- 同一 Key 可对应多个 value，悬浮时全部显示。
- 文件保存后自动重新加载。

## 配置项

所有配置项均可直接在 VS Code 设置界面（设置 → 扩展 → Type Stats）中修改，无需使用命令面板。

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `typeStats.enabled` | `true` | 启用/停用插件功能 |
| `typeStats.idlePauseSeconds` | `5` | 无变动多少秒后暂停计时 |
| `typeStats.sheetsPath` | 空 | 自定义 `sheets.ini` 路径，留空自动查找 `.workshop/sheets.ini` |

## 状态栏操作

- 点击“字符”条目：查看详细统计。
- 点击“计时”或“速率”条目：打开操作菜单，可查看详细统计、重新加载设定集、重置计时与速率，或直接打开 Type Stats 设置页。

这些操作不会出现在命令面板中。
