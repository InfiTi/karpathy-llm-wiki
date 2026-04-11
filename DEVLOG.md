# DEVLOG.md

## 2026-04-12 v0.2.0 — 三层架构完成

### 架构：raw/wiki/outputs 关系

```
用户输入（网页/视频/PDF/DOCX）
       ↓
raw/   ← 原始内容存储（抓取后的 Markdown）
       ↓ Ingest（摄入）
wiki/  ← AI 维护的结构化知识（摘要/要点/链接）
       ↓ Lint（检查）
知识库质量报告 → 发现矛盾、过时、缺失
       ↓ Query（查询）
outputs/ ← AI 生成的回答（可回填 wiki/）
```

### 技术实现

| 模块 | 文件 | 职责 |
|------|------|------|
| Ingest | `ingest/` | raw/ → wiki/，LLM 驱动，与已有知识合并 |
| Query | `query/` | 搜索 wiki/，综合回答，可回填 |
| Lint | `lint/` | 扫描 wiki/，质量评分，发现矛盾 |

### 三层 LLM 提示词设计

**Ingest（摄入）**
- 系统：知识库管理员，增量优于覆盖，精确优于泛化，链接优先
- 输入：原始文本 + 已有知识上下文（已找到的相关条目摘要）
- 输出：title/tags/summary/key_points/wikilinks/metadata（update_type/confidence）

**Query（查询）**
- 系统：知识助手 + 知识库管理员两步工作
- 输入：用户问题 + wiki 搜索结果上下文
- 输出：answer/sources/confidence/gaps/backfill（新条目建议）

**Lint（检查）**
- 系统：知识库审计员，5 个维度评分
- 输入：整个 wiki 所有条目摘要 + 所有链接概念
- 输出：score/overall_assessment/issues/improvements

### 关键实现细节

- **已有知识查找**：`ingest/finder.py` 基于标题关键词对 wiki/ 评分，合并前 3 名相关条目摘要给 LLM
- **JSON 容错**：`llm/__init__.py` 先尝试直接解析，失败后正则提取 `{}` 内容块
- **Ollama 中文**：`resp.content.decode("utf-8")` 而非 `resp.json()`，修复 latin1 乱码
- **trafilatura fallback**：网页提取失败时切 BeautifulSoup 兜底

### 已知问题
- qwen3.5 生成中文内容有时超时，建议用 qwen3:4b
- exe 打包体积 ~700MB（conda 依赖多），后续考虑精简虚拟环境

### Git 历史
- `82b6d10` - v0.1.0 初始提交
- `HEAD` - v0.2.0 三层架构完成
