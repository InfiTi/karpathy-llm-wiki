# 2026-05-25 压缩版上下文摘要

## 当前状态
- 已 push 到 origin/master
- 当前主线：继续做重复内容治理型 Lint
- 当前阶段不优先做 schema/frontmatter lint

## 项目边界（来自 project-definition）
当前优先级：
1. 流程与输出结构稳定
2. 规则治理
3. 语义增强暂缓

## Lint 已完成
- broken_link_group
- duplicate_title_group
- similar_title_cluster
- orphan_note_group
- route integrity v1：routing_conflict_group / unresolvable_entity_group

## 当前主线
继续把重复内容治理做深：
- 进一步聚合重复内容
- 识别重复 ingest / 同一概念多版本
- 输出更明确的治理建议
- 保持规则型、纯后端、可验收

## 不做的事
- 不优先做 LLM 语义判断
- 不优先做 schema/frontmatter lint
- 不扩复杂 RAG 基础设施

## 下一步
围绕重复内容治理继续增强 Lint，然后验证 build，再提交
