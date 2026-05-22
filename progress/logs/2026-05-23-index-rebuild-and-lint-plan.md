# 2026-05-23 Index 重构与 Lint 启动

## 本次完成

### 1. Index 重构完成
- 将 Index 生成逻辑从“增量追加”改为“全库扫描重建”
- 主索引位置修正为：`F:\Obsidian\wiki Test\index.md`
- 删除误生成的：`F:\Obsidian\wiki Test\wiki\索引.md`
- 生成内容包含：
  - `entities_map`
  - 最近更新
  - 按类型分类
  - 按标签分类
  - `待合并 / 待治理`
  - `孤立条目（待关联）`

### 2. 已验证的问题
- Index 不再输出嵌套双链 `[[...|[[...]]]]`
- 能识别重复 ingest 的香港银行账户维护系列
- 能识别寿险顾问相关近重复条目
- 能识别保险金信托系列为孤立条目

### 3. 当前已知限制
- 测试库中存在大量历史脏数据，导致 `entities_map` 中部分实体名仍不够干净
- 这是历史 wiki 内容问题，不是本轮 Index 重构逻辑问题
- 当前阶段按要求不主动修改测试库既有文档内容

## 当前结论

当前测试库非常适合作为 lint 开发与验收环境：
- 有重复标题 / 高相似标题
- 有重复 ingest 样本
- 有孤立 Note
- 有索引路由需求

## 下一步

启动第一版“规则型 Lint”，优先做确定性检查：
1. 重复标题
2. 高相似标题
3. 孤立 Note
4. 坏链

## 相关文件
- `src/core/index/indexManager.ts`
- `src/core/wiki/manager.ts`
- `src/core/wiki/types.ts`
- `scripts/build-core.js`
## Lint 第二轮降噪结果（追加）

已完成规则型 Lint 的第二轮降噪优化：
- 坏链改为“按文档聚合”输出
- 重复标题改为“按组聚合”输出
- 相似标题改为“按簇聚合”输出
- 孤立 Note 改为“按组汇总”输出

### 测试库验收结果
测试路径：`F:\Obsidian\wiki Test`

本次共扫描 `65` 个条目，发现 `63` 类问题：
- `broken_link_group`: 55
- `duplicate_title_group`: 6
- `similar_title_cluster`: 1
- `orphan_note_group`: 1

### 结论
第一版规则型 Lint 已经可用，能够把重复 ingest 和知识孤岛从“海量明细噪音”收敛成可读摘要。
下一步更适合做：
1. 在前端增加问题详情展开
2. 给重复组增加“候选文件列表”
3. 让 Query 开始利用 Index 的 `entities_map` 做路由
