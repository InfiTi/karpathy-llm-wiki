# KWiki — Karpathy LLM Wiki

将网页、视频、PDF、Word 通过 AI 自动整理成 Obsidian 知识库。

## 三层架构

```
raw/   ← 原始内容（抓取后的 Markdown）
         ↓ Ingest（摄入）
wiki/  ← AI 维护的结构化知识（摘要 / 要点 / 链接）
         ↓ Lint（检查）
知识库质量报告 → 发现矛盾 / 过时 / 缺失
         ↓ Query（查询）
outputs/ ← AI 生成的回答（可回填 wiki/）
```

## 功能

| 标签 | 功能 |
|------|------|
| **Ingest** | 输入链接或文件 → AI 提炼 → 存入 wiki/，已有相关条目时合并而非覆盖 |
| **Query** | 向知识库提问，AI 综合已有知识回答，评估缺口并可生成新条目 |
| **Lint** | 扫描 wiki/，发现矛盾、过时信息、缺失链接，给出质量评分 |

## 目录结构

```
kwiki.py              - 主入口（Tkinter GUI）
config/               - 配置（Vault 路径 / LLM 地址）
fetchers/             - 内容抓取（网页 / 视频 / PDF / Word）
ingest/               - 摄入管道
  pipeline.py          - 核心逻辑（raw → wiki）
  finder.py           - wiki/ 相关条目搜索
query/                - 查询管道
lint/                 - 质量检查
llm/                  - LLM 调用 + 三层提示词
wiki/                 - Obsidian 文件写入
```

## 使用方法

双击 `kwiki.exe`，或 `python kwiki.py`。

首次：设置 Obsidian Vault 路径、LLM 地址（如 `http://localhost:11434/v1`）、模型名称（默认 `qwen3.5`），点击「保存」。

## 依赖

- Python 3.8+ | Ollama / OpenAI 兼容后端
- yt-dlp（视频字幕）| trafilatura + BeautifulSoup（网页）
- PyMuPDF（PDF）| python-docx（Word）
