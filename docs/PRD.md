# 创作工坊 PRD 索引

| 项目     | 值                                                                        |
| -------- | ------------------------------------------------------------------------- |
| 应用名称 | 创作工坊                                                                  |
| 当前版本 | 1.10.0                                                                     |
| 应用 ID  | `cn.com.stdout.creation-workshop`                                         |
| 技术形态 | Electron 桌面应用 + React 渲染层                                          |
| 数据形态 | 项目目录 + `.workshop` 下多个分类 Markdown；`userData/projects.json` 登记 |

## 核心设计

- 命名由本地词库、性别音系倾向与人口权重规则组合产生，不依赖网络或 AI 服务；人名只保留一个「·」，姓氏固定在后。
- 规则设置通过模态子窗口调整，与主界面共享并持久化生成偏好。
- 应用以「项目」为单位组织数据：每个项目目录下的 `.workshop` 中按类别保存 `project.md`、`candidates.md`、`sheets.md`、`relations.md`、`graph.md`、`preferences.md`，并根据设定卡与候选自动生成 `sheets.ini`；项目登记与最近项目记录保存在 `userData/projects.json`。
- 启动时只驻留系统托盘，不打开主窗口；用户点击托盘后才显示项目门，选定项目后进入主界面。项目门只提供最近项目与「打开项目」，打开时会自动创建目录、自动初始化缺失的 `.workshop`。
- 渲染进程开启 `contextIsolation`，关闭 `nodeIntegration`；文件与数据能力只通过白名单预加载桥开放。
- 应用常驻系统托盘；关闭主窗口只隐藏窗口，点击托盘图标在当前桌面重新打开主界面。最近一次打开的项目排在最近列表第一位并显示「上次」TAG。
- 主窗口为普通独立窗口：不置顶，打开期间切换桌面不跟随；关闭后从其它桌面重新打开时落在当前桌面。启动与重新打开均不显示 Dock 图标。
- 不提供导出（JSON / TXT / Markdown / PNG）与分享；AI 详细设定入口保留，点击后以弹窗明确说明，不发起网络请求。
- 仓库内附带配套 VS Code 插件 `vscode-extension/`（Type Stats）：读取工作区 `.workshop/sheets.ini` / `sheets.md` 提供字数统计、码字计时/速率与设定集高亮；随主项目构建自动打包 VSIX。

## 阅读指南

| 任务                                      | 必读文件                                                     |
| ----------------------------------------- | ------------------------------------------------------------ |
| 调整窗口、应用标识、启动流程或技术架构    | [01-product-architecture.md](prd/01-product-architecture.md) |
| 修改词库、生成规则或组合量                | [02-name-generation.md](prd/02-name-generation.md)           |
| 修改候选保存、筛选或删除                  | [03-candidate-library.md](prd/03-candidate-library.md)       |
| 修改设定卡或人物关系                      | [04-sheets-and-relations.md](prd/04-sheets-and-relations.md) |
| 修改图谱、布局持久化或统计                | [05-graph-and-stats.md](prd/05-graph-and-stats.md)           |
| 修改不可用能力入口                        | [06-unavailable-features.md](prd/06-unavailable-features.md) |
| 修改项目选择/打开、`.workshop` 格式或 IPC | [07-persistence-and-ipc.md](prd/07-persistence-and-ipc.md)   |
| 修改依赖、脚本、打包或发布                | [08-build-and-release.md](prd/08-build-and-release.md)       |
| 修改 VS Code 插件、统计口径或设定集高亮   | [09-vscode-extension.md](prd/09-vscode-extension.md)         |

## 维护规则

### 变更类型 → 需同步文件

| 变更类型                                             | 需同步更新                       |
| ---------------------------------------------------- | -------------------------------- |
| 窗口、应用名、安全边界、进程结构、启动流程           | `prd/01-product-architecture.md` |
| 词库、规则、性别倾向、组合量算法、人名结构           | `prd/02-name-generation.md`      |
| 候选字段、筛选、排序、删除流程                       | `prd/03-candidate-library.md`    |
| 设定字段、关系类型、级联规则                         | `prd/04-sheets-and-relations.md` |
| 图谱视图、布局持久化、统计指标                       | `prd/05-graph-and-stats.md`      |
| 不可用能力入口                                       | `prd/06-unavailable-features.md` |
| 项目选择/打开、项目登记、`.workshop` 格式、迁移、IPC | `prd/07-persistence-and-ipc.md`  |
| 依赖、脚本、打包产物、CI                             | `prd/08-build-and-release.md`    |
| VS Code 插件、统计规则、设定集高亮、插件命令与配置   | `prd/09-vscode-extension.md`     |

### 编号与书写约束

- 每个一级章节使用独立文件，文件正文标题格式为 `# N. 标题`，子章节使用 `### N.x`。
- 数值必须注明代码来源；流程使用 Mermaid；对外接口必须写明签名、可用范围、持久性与副作用。
- 新增一级章节时同步新建编号文件并更新本索引，不得把章节正文追加到索引。
- 文档与实现不一致时以代码为准，随后修文档。
- 版本号变更时同步更新本索引与所有出现当前版本的章节。
