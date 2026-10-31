# 9. VS Code 插件（Type Stats）

### 9.1 定位与目录

`vscode-extension/` 是创作工坊配套的 VS Code 插件 `type-stats`（publisher `border-writer`），面向中文长文写作场景：状态栏字数统计、码字计时/速率，以及 `.workshop/sheets.ini` 设定集关键词高亮。插件版本与主应用版本保持同步（当前 `1.11.0`）。插件作为 pnpm workspace 成员随主项目一起安装依赖，并在主项目构建时自动打包 VSIX。

```text
vscode-extension/
├── src/
│   ├── extension.ts   # 激活入口、命令注册、配置变更分发
│   ├── stats.ts       # 字符统计、状态栏条目、计时器、净输入与速率
│   ├── sheets.ts      # sheets.ini / sheets.md 解析、装饰器与高亮刷新
│   └── explorer.ts    # 「设定集」树视图与条目跳转
├── scripts/build.sh   # 类型检查、打包、生成 type-stats-v<version>.vsix
├── package.json       # 插件清单、配置项、命令与视图声明
└── tsconfig.json
```

运行期数据由用户工作区提供，不随插件打包：`.workshop/sheets.ini`（高亮词条）与 `.workshop/sheets.md`（悬浮详情与树视图跳转目标）。

### 9.2 构建与安装

| 命令                              | 行为                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `pnpm run build:extension`        | 在 `vscode-extension/` 执行类型检查、esbuild 打包并生成 VSIX |
| `pnpm run install:extension`      | 按当前版本号把生成的 VSIX 安装到 VS Code（`--force`）        |
| `pnpm run build`                  | 主项目构建末尾自动调用 `build:extension`                     |
| `pnpm --dir vscode-extension run typecheck` | 仅 TypeScript 类型检查                              |
| `pnpm --dir vscode-extension run compile`   | 仅打包到 `vscode-extension/dist/extension.js`       |

VSIX 文件名由构建脚本自动拼接当前插件版本：`type-stats-v<version>.vsix`；产物不参与源码提交，执行 `pnpm dist:mac` 时会同时复制到 `release/`。

插件与应用共用同一应用图标：构建时从根目录 `src/assets/imgs/app-icon.png` 复制到 `vscode-extension/assets/imgs/app-icon.png`，并通过 `package.json` 的 `icon` 字段打包进 VSIX；复制产物不参与源码提交。安装：

```bash
pnpm run install:extension
```

依赖由根 `pnpm-workspace.yaml` 统一管理，禁止使用 `npm` / `yarn`。VSIX 打包使用 `vsce --no-dependencies`，运行时不依赖 `node_modules`。

### 9.3 核心统计规则

| 规则             | 实现                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| 有效字符         | 排除 `[\s\u0000-\u001f\u007f-\u009f]`（`src/stats.ts` `EFFECTIVE_RE`） |
| 中文             | `[\u4e00-\u9fff]`                                                    |
| 英文             | `[A-Za-z]`                                                           |
| 统计文件范围     | 仅 `file:` / `untitled:` 的 `.txt` / `.md`，且路径中不含 `.workshop` |
| 计时触发         | 仅当文档全文的有效字符数发生实际增减时启动或重置                     |
| 空闲暂停         | 连续 `typeStats.idlePauseSeconds`（默认 5 秒）无变动后暂停           |
| 净输入           | `globalTypedCount = Σ(插入有效字符 - 删除有效字符)`，删除会减少净输入 |
| 速率             | `round(globalTypedCount / (累计秒数 / 3600))`，单位「字/小时」        |

字符差按「变更前文档全文 vs 变更后全文」的有效字符差计算，不使用 `rangeLength`（UTF-16 编码单元，与有效字符口径不一致）。计时使用墙钟时间累计，暂停时把运行区间累加进 `accumulatedMs`，避免 `setInterval` 漂移。

### 9.4 启用条件与配置

插件通过 `activationEvents: ["*"]` 启动即加载。`sync()` 统一计算是否生效：`typeStats.enabled` 为真且存在可解析的 `sheets.ini`。生效时启用状态栏、高亮与树视图，并设置上下文 `typeStats.active`；文件删除后自动停用。异步同步使用 token 避免竞态。

配置项全部通过 VS Code 原生设置页修改，命令面板不暴露操作命令：

| 配置                        | 类型    | 默认值 | 说明                                                               |
| --------------------------- | ------- | ------ | ------------------------------------------------------------------ |
| `typeStats.enabled`         | boolean | `true` | 启用状态栏统计与设定集高亮；仍需存在 `sheets.ini` 才生效           |
| `typeStats.idlePauseSeconds` | number  | `5`    | 连续多少秒无文本变动后暂停计时，范围 1–600                         |
| `typeStats.sheetsPath`      | string  | 空     | `sheets.ini` 路径，支持绝对路径、`file:` 等 URI 或相对工作区根路径；留空时逐根查找 `.workshop/sheets.ini` |

### 9.5 设定集解析与高亮

`parseSheetsIni` 支持：

- `[分区]` 标题，用于分组与悬浮展示；
- `;` / `#` 注释与空行；
- `key = value`，value 可用单/双引号包裹；
- 同一 key 多行 value 合并，悬浮时全部展示；
- 记录首次出现的行号用于树视图跳转。

高亮行为：

- 仅对支持的 `.txt` / `.md` 文档生效；切换编辑器时同步刷新。
- 词条按 key 长度降序编译正则，逐条构建并转义特殊字符，处理重叠词条；每次执行前重置 `lastIndex`。
- 使用加粗、`editor.findMatchHighlightBackground` 背景、3px 圆角；左右间距用 `before` / `after` 的零宽字符加 `margin: 0 3px` 实现，不修改用户真实文本。
- 悬浮内容优先读取同目录 `sheets.md` 中同名 `## 标题` 下的字段列表，隐藏 `ID`、`创建时间`、`人物名`、`更新时间`；无匹配时回退展示 `sheets.ini` 的 value。
- 监听 `**/.workshop/sheets.{ini,md}` 变更自动重载；文本变更后 150ms 防抖刷新可见编辑器。

### 9.6 设定集树视图与跳转

资源管理器中的「设定集」树视图（`typeStats.sheetsExplorer`）按 `sheets.ini` 分区手风琴渲染：

- 分组节点使用 `folder` 图标并默认折叠；无分区词条归入「未分组」。
- 条目节点使用 `bookmark` 图标，悬浮显示分区与全部 value。
- 点击条目：若同目录 `sheets.md` 存在同名 `## 标题`，打开 `sheets.md` 并滚动到该标题；否则打开 `sheets.ini` 并定位到词条首次出现的行。
- 监听 `**/sheets.{ini,md}` 变更自动重载；插件停用时清空并隐藏内容。

### 9.7 状态栏、详情与操作菜单

状态栏条目（右侧，优先级 103 / 102 / 101）：

| 条目 | 内容                                  | 点击行为                     |
| ---- | ------------------------------------- | ---------------------------- |
| 字符 | `字符 <有效字符数>`（仅支持的文件）   | 查看详细统计                 |
| 计时 | `hh:mm:ss` 累计码字时间               | 打开操作菜单                 |
| 速率 | `<净输入速率> 字/h`                   | 打开操作菜单                 |

详细统计弹窗展示：有效字符、中文字数、英文字数、耗时、速率、净输入、打开时间、上次保存，并可一键复制到剪贴板。操作菜单提供：在工坊中打开、查看详细统计、重新加载设定集、重置计时与速率、打开 Type Stats 设置页。

编辑器右键菜单在 `typeStats.active` 时提供「在工坊中打开」，命令面板中隐藏全部插件命令。

### 9.8 与创作工坊的集成

- 「在工坊中打开」不再直接启动应用，而是用工作区根目录名构造系统协议链接 `workshop://project/open?name=<encodeURIComponent(工作区目录名)>`，通过 VS Code 的 `env.openExternal` 交给系统处理（`src/extension.ts`）。应用未安装 / 协议未注册时以错误提示反馈；未打开工作区时提示先打开项目文件夹。
- 创作工坊收到协议后按名称匹配最近项目并加载，同时自动把应用与主窗口置于前台（见 §1.9），无需插件关心应用安装路径。
- 插件只读取工作区 `.workshop/sheets.ini` 与 `.workshop/sheets.md`，不写入任何文件；由创作工坊在项目目录中生成并维护这两个文件（见 §4）。
- 插件与主应用无 IPC 或网络通信，二者通过系统协议与工作区文件解耦。

### 9.9 常见陷阱

- 文本变更计数必须比较变更前后的文档全文，不能依赖 `rangeLength`。
- 计时使用墙钟时间累计；暂停时把运行区间累加进 `accumulatedMs`。
- 装饰器的左右边距使用零宽字符加 `margin`，不得改动用户真实文本。
- 正则按 key 逐条构建，需转义特殊字符、处理重叠词条，并每次重置 `lastIndex`。
- 切换或关闭编辑器时同步维护 `lastText` 缓存，避免把首次读取当作大量插入。
- 启用状态由 `sync()` 统一计算（配置文件存在性 + `typeStats.enabled`），并用 token 避免异步竞态。

### 9.10 功能清单

- [x] 启动即激活、默认启用（可配置开关）
- [x] 仅当存在 `.workshop/sheets.ini` 时生效，创建/删除自动启用或停用
- [x] 状态栏有效字符数（实时）
- [x] 点击显示总有效字符 / 中文字数 / 英文字数
- [x] 插入/删除触发计时，空闲自动暂停
- [x] 状态栏累计时间 `hh:mm:ss`
- [x] 状态栏净输入速率 `字/h`
- [x] 仅支持 `.txt` / `.md`
- [x] 解析 `.workshop/sheets.ini` 并加粗高亮所有 key
- [x] 高亮左右渲染间距
- [x] 悬浮显示对应 value（支持分区与多 value）
- [x] 资源管理器「设定集」树视图：按分区手风琴渲染，点击跳转 `sheets.md` 同名标题或 `sheets.ini` 对应行
- [x] `sheets.ini` / `sheets.md` 变更自动重载
- [x] 配置项全部通过 VS Code 原生设置页修改，命令面板不暴露操作命令
- [x] 编辑器右键「在工坊中打开」
- [x] 主项目构建时自动生成 VSIX

### 9.11 后续可扩展

- 使用 `globalState` 持久化累计统计。
- 支持多根工作区中逐根查找 `sheets.ini`。
- 为设定集高亮提供颜色/样式配置。
- 增加单元测试（统计函数与 ini 解析可独立测试）。
