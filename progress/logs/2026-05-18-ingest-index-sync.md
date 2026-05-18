# 2026-05-18 Ingest Index 同步

## 问题描述

用户指出 ingest 之后没有同步更新 `F:\Obsidian\wiki Test\index.md`，而 query 和 lint 需要用到这个 index。

**为什么 Query 需要 index：**
- 作为"语义路由"，让 LLM 只读索引目录，发现相关条目，精准提取需要的文件
- 避免 9B 模型 OOM（内存溢出）

**为什么 Lint 需要 index：**
- 做冲突检测，新 ingest 时检查实体是否已存在
- 需要通过 index 检索旧知识来和新知识做对比

## 解决方案

### 1. 创建 IndexManager (`src/core/index/indexManager.ts`)

- `updateIndex(newEntry)` - 添加新条目到 index.md
- `removeFromIndex(fileName)` - 从 index.md 删除条目
- `renderIndex()` - 渲染 index.md 内容（最近更新、按类型、按标签分类）
- `cleanFileName()` - 清理文件名中的 `[` 和 `]` 字符

### 2. 修改 IngestPipeline (`src/core/ingest/pipeline.ts`)

- 添加 `indexManager` 私有变量
- 在 `runIngest()` 成功后调用 `indexManager.updateIndex()`

### 3. 修复 WikiManager ([`src/core/wiki/manager.ts`](file:///e:/AI/Karpathy/src/core/wiki/manager.ts))

- `slugify()` 函数新增 `.replace(/[\[\]]/g, '')`，确保新文件名不包含 `[` 和 `]`

### 4. 创建批量重命名脚本 ([`scripts/fix-wiki-filenames.js`](file:///e:/AI/Karpathy/scripts/fix-wiki-filenames.js))

- 自动查找和重命名包含 `[` 和 `]` 的 wiki 文件
- 同时更新 index.md 中的链接
- 成功重命名了 12 个文件

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/core/index/indexManager.ts` | 新增 - IndexManager 类 |
| `src/core/index/index.ts` | 新增 - 模块导出 |
| `src/core/ingest/pipeline.ts` | 修改 - 集成 IndexManager |
| `src/core/wiki/manager.ts` | 修改 - slugify 移除 [ 和 ] |
| `scripts/fix-wiki-filenames.js` | 新增 - 批量重命名脚本 |

## 待办

- [ ] 测试 ingest 后 index.md 是否正确更新
- [ ] Query/Lint 是否需要修改来使用 index.md 做语义路由（待评估）

## 相关决策

如需 Query 利用 index 做语义路由，需要修改 `QueryEngine.searchWiki()` 方法，先读 index.md 再精确获取相关文档。