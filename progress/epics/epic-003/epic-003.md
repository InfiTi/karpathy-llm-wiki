---
id: epic-003
title: Query 增强
status: #in-progress
progress: 0%
priority: #high-priority
start_date: 2026-04-16
target_date: 2026-04-25
created: 2026-04-16
updated: 2026-04-16
version: 1
---

## 概述

增强 Query 功能，新增两个核心能力：
1. Query 答案可存入 Wiki（质量评估 + 用户确认）
2. 话题推荐系统（知识缺口 + 相关问题 + 知识探索）

## 验收标准

- [ ] LLM 返回答案时附带质量分数和建议
- [ ] 前端 Query 页面支持"保存到 Wiki"按钮
- [ ] 话题推荐功能可用（知识缺口/相关问题/知识探索）
- [ ] 存入的 wiki 条目包含 source: query-generated 和 derived_from

## 关联任务

| # | 任务ID | 标题 | 状态 |
|---|--------|------|------|
| 1 | [task-007](task-007.md) | Query 质量评估与存入 Wiki | #todo |
| 2 | [task-008](task-008.md) | 前端保存到 Wiki 按钮 | #todo |
| 3 | [task-009](task-009.md) | 话题推荐 - 知识缺口 | #todo |
| 4 | [task-010](task-010.md) | 话题推荐 - 相关问题 | #todo |
| 5 | [task-011](task-011.md) | 话题推荐 - 知识探索 | #todo |

> **进度计算**：0/5 = **0%**

## 技术方案

### 功能 1：Query 存入 Wiki

**数据流**：
```
Query 回答 → LLM 质量评估 → 前端显示"保存"按钮 → 用户确认 → 存入 wiki/
```

**Frontmatter 字段**：
```yaml
source: query-generated
derived_from: ["条目A", "条目B"]
original_question: "用户问题"
```

### 功能 2：话题推荐

| 类型 | 说明 | 实现方式 |
|------|------|----------|
| A | 知识缺口 | 扫描 wiki 中缺失的链接 |
| B | 相关问题 | 基于当前查询推荐 |
| C | 知识探索 | 随机推荐未深入的主题 |
| D | 组合 | 综合 A+B+C |

## 执行日志

### 2026-04-16
- 确认 v0.3.0 功能需求
- Query 存入 Wiki：使用 derived_from + original_question
- 话题推荐：知识缺口 + 相关问题 + 知识探索
