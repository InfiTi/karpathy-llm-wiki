---
id: task-007
title: Query 质量评估与存入 Wiki
status: #todo
priority: #high
related_epic: epic-003
created: 2026-04-16
---

## 任务描述

修改 Query 逻辑，LLM 返回答案时附带质量评估，并支持存入 wiki。

## 具体要求

1. **LLM 质量评估**
   - 质量分数（0-10）
   - 是否建议存入 wiki
   - 参考的 wiki 条目列表（derived_from）

2. **后端存储逻辑**
   - 存入时添加 `source: query-generated`
   - 添加 `derived_from` 字段记录来源
   - 添加 `original_question` 字段记录原始问题

3. **输出到 outputs/ 时也带这些信息**

## 验收标准

- [ ] LLM 返回答案时包含 quality_score、suggest_save、derived_from
- [ ] 手动触发保存时，frontmatter 正确包含三个字段
- [ ] outputs/ 中的答案也包含来源信息
