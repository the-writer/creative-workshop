# 创作工坊 PRD 索引

| 项目     | 值                                |
| -------- | --------------------------------- |
| 应用名称 | 创作工坊                          |
| 当前版本 | 1.0.0                             |
| 应用 ID  | `cn.com.stdout.creation-workshop` |
| 技术形态 | Electron 桌面应用 + React 渲染层  |
| 数据形态 | 运行时目录中的单个 JSON 文件      |

## 核心设计

- 命名由本地词库、性别音系倾向与人口权重规则组合产生，不依赖网络或 AI 服务。
- 候选、设定卡、人物关系与界面偏好统一持久化到 `userData/workshop.json`。
- 渲染进程开启 `contextIsolation`，关闭 `nodeIntegration`；文件与数据能力只通过白名单预加载桥开放。
- 暂时无实现的能力保留入口，点击后以弹窗明确说明，不发起网络请求。

## 阅读指南

| 任务                         | 必读文件                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| 调整窗口、应用标识或技术架构 | [01-product-architecture.md](prd/01-product-architecture.md)                       |
| 修改词库、生成规则或组合量   | [02-name-generation.md](prd/02-name-generation.md)                                 |
| 修改候选保存、筛选或删除     | [03-candidate-library.md](prd/03-candidate-library.md)                             |
| 修改设定卡或人物关系         | [04-sheets-and-relations.md](prd/04-sheets-and-relations.md)                       |
| 修改图谱或统计               | [05-graph-and-stats.md](prd/05-graph-and-stats.md)                                 |
| 修改导出或不可用入口         | [06-export-and-unavailable-features.md](prd/06-export-and-unavailable-features.md) |
| 修改 JSON 结构、IPC 或偏好   | [07-persistence-and-ipc.md](prd/07-persistence-and-ipc.md)                         |
| 修改依赖、脚本、打包或发布   | [08-build-and-release.md](prd/08-build-and-release.md)                             |

## 维护规则

### 变更类型 → 需同步文件

| 变更类型                         | 需同步更新                                  |
| -------------------------------- | ------------------------------------------- |
| 窗口、应用名、安全边界、进程结构 | `prd/01-product-architecture.md`            |
| 词库、规则、组合量算法           | `prd/02-name-generation.md`                 |
| 候选字段、筛选、排序、删除流程   | `prd/03-candidate-library.md`               |
| 设定字段、关系类型、级联规则     | `prd/04-sheets-and-relations.md`            |
| 图谱视图、布局、统计指标         | `prd/05-graph-and-stats.md`                 |
| 导出格式、不可用能力入口         | `prd/06-export-and-unavailable-features.md` |
| 对外桥接口、JSON 结构、偏好键    | `prd/07-persistence-and-ipc.md`             |
| 依赖、脚本、打包产物、CI         | `prd/08-build-and-release.md`               |

### 编号与书写约束

- 每个一级章节使用独立文件，文件正文标题格式为 `# N. 标题`，子章节使用 `### N.x`。
- 数值必须注明代码来源；流程使用 Mermaid；对外接口必须写明签名、可用范围、持久性与副作用。
- 新增一级章节时同步新建编号文件并更新本索引，不得把章节正文追加到索引。
- 文档与实现不一致时以代码为准，随后修文档。
- 版本号变更时同步更新本索引与所有出现当前版本的章节。
