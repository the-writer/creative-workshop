# 7. 持久化与 IPC

### 7.1 数据文件

主进程启动后输出一条数据文件绝对路径日志：

```text
[创作工坊] 数据文件：<userData>/workshop.json
```

文件名来自 `package.json` → `creationWorkshop.storage.fileName`。`userData` 由 Electron 按应用名与平台确定。

JSON 顶层结构：

```json
{
  "schemaVersion": 1,
  "candidates": [],
  "sheets": [],
  "relations": [],
  "preferences": {
    "generator": {},
    "libraryFilters": {}
  }
}
```

写入采用“临时文件 + rename”的原子替换。损坏 JSON 会改名为 `workshop.json.corrupt-<时间>`，随后从空数据结构启动。数据操作通过串行队列执行，避免并发覆盖。

### 7.2 预加载接口

接口在 Electron 渲染进程中通过 `window.workshop` 使用，浏览器单独打开时不存在。以下操作均返回 Promise。

| 签名                           | 持久性         | 副作用                                    |
| ------------------------------ | -------------- | ----------------------------------------- |
| `candidates.list(filters)`     | 不写盘         | 返回带 `referenced` 的候选列表            |
| `candidates.get(id)`           | 不写盘         | 无                                        |
| `candidates.create(input)`     | 立即写盘       | 新增候选；重复名称返回 `duplicate=true`   |
| `candidates.update(id, patch)` | 立即写盘       | 更新收藏或备注                            |
| `candidates.references(id)`    | 不写盘         | 查询设定与关系引用                        |
| `candidates.remove(id, force)` | 立即写盘       | 删除候选；`force=true` 时清引用与地名关系 |
| `sheets.list()`                | 不写盘         | 返回带关系数量的设定卡                    |
| `sheets.save(input)`           | 立即写盘       | 新建或更新设定卡                          |
| `sheets.remove(id)`            | 立即写盘       | 删除设定并级联删除关系                    |
| `relations.list()`             | 不写盘         | 返回关系列表                              |
| `relations.add(input)`         | 立即写盘       | 新增关系；自身关系与重复关系失败          |
| `relations.remove(id)`         | 立即写盘       | 删除关系                                  |
| `data.all()`                   | 不写盘         | 返回全部业务数据                          |
| `data.stats()`                 | 不写盘         | 返回实时统计                              |
| `preferences.get(key)`         | 不写盘         | 允许 `generator`、`libraryFilters`        |
| `preferences.set(key, value)`  | 立即写盘       | 覆盖对应偏好对象                          |
| `files.save(input)`            | 用户确认后写入 | 打开系统保存对话框                        |
| `clipboard.writeText(text)`    | 不写盘         | 写入系统剪贴板                            |

示例：

```ts
const result = await window.workshop.candidates.create({
  race: 'human',
  nameType: 'person',
  nameText: '雷恩',
  structure: [{ label: '短名', word: '雷恩' }],
  source: 'generated',
});
```

### 7.3 偏好

- `generator`：生成族群、类型与规则参数。
- `libraryFilters`：候选库筛选与排序。
- 偏好与业务数据保存在同一个 JSON 文件中。
- 应用重启后恢复；选择生成结果、表单草稿和当前页面不持久化。

### 7.4 兼容与约束

- 对外字段采用 camelCase。
- 读取时兼容旧的 snake_case 字段名与字符串结构数据。
- 种族 key 当前为 `human` / `elf`；旧数据或旧偏好中的 `demon` 在读取时自动迁移为 `elf`，不丢失历史候选与设定。
- 不允许渲染层提交任意保存路径。
- 新增 IPC 通道必须在预加载白名单、类型声明、主进程处理器与本章节同时登记。
