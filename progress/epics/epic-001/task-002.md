---
id: task-002
title: 内容长度限制
status: #completed
priority: #high-priority
tags: ["#ingest", "#pipeline"]
epic: epic-001
depends_on: []
blocked_by: []
assignee: AI
due_date: 2026-04-12
created: 2026-04-11
updated: 2026-04-12
started_at: 2026-04-11
completed_at: 2026-04-12
estimated_hours: 1
actual_hours: 1
version: 1
---

## 概述

在 Ingest 流程中增加内容长度限制，避免超长内容导致 LLM 处理失败。

## 验收标准

- [x] 单条内容上限 12000 字
- [x] 超出自动截断并标注
- [x] 长内容分段处理支持

## 执行日志

### 2026-04-12
- 内容长度限制提升到 12000 字
- 超出自动截断并标注
