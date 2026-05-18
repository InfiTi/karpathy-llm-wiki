---
id: task-015
title: Ingest 后同步更新 Index
status: #done
priority: #high
related_epic: epic-004
created: 2026-05-18
---

## 任务描述

Ingest 后同步更新 `index.md`，使 Query 和 Lint 能够利用 index 做语义路由。

## 问题分析

- Ingest 后没有更新 index.md
- Query 需要 index 做语义路由，避免 9B 模型 OOM
- Lint 需要 index 做冲突检测，检索旧知识

## 解决方案

1. **创建 IndexManager** (`src/core/index/indexManager.ts`)
   - `updateIndex(newEntry)` - 添加新条目
   - `removeFromIndex(fileName)` - 删除条目
   - 维护"最近更新"、"按类型分类"、"按标签分类"
   - `cleanFileName()` - 清理文件名中的 `[` 和 `]` 字符

2. **修改 IngestPipeline** (`src/core/ingest/pipeline.ts`)
   - 在 `runIngest()` 成功后调用 `indexManager.updateIndex()`

3. **修复 WikiManager** (`src/core/wiki/manager.ts`)
   - `slugify()` 函数新增 `.replace(/[\[\]]/g, '')`，确保新文件名不包含 `[` 和 `]`

4. **创建批量重命名脚本** (`scripts/fix-wiki-filenames.js`)
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

## 验收标准

- [x] Ingest 成功后自动更新 index.md
- [x] 文件名中的 [[]] 字符问题已修复
- [ ] Query/Lint 可以利用 index 做语义路由（待后续任务）
