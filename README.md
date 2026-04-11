# KWiki - Karpathy LLM Wiki 入库工具

将网页链接、PDF、Word 文档通过 AI 自动整理成 Obsidian 笔记。

## 功能

- **网页**：自动提取正文 + AI 提炼摘要/标签/要点
- **视频**：yt-dlp 获取字幕 + AI 提炼（支持 B站 / YouTube 等）
- **PDF**：PyMuPDF 提取文字 + AI 提炼
- **Word**：python-docx 提取文字 + AI 提炼
- **Obsidian 格式**：自动生成 frontmatter、tags、wikilinks

## 使用方法

双击运行 `kwiki.exe`，粘贴链接或拖入文件，点击「开始入库」。

## 首次配置

1. 设置 Obsidian Vault 路径
2. 设置 LLM 后端地址（默认 Ollama: `http://localhost:11434/v1`）
3. 设置模型名称（默认 `qwen3.5`）
4. 点击「💾 保存」

## 依赖

- Python 3.8+
- Ollama（或其他 OpenAI 兼容后端）
- yt-dlp（视频字幕）
- trafilatura（网页正文）
- PyMuPDF（PDF 解析）
- python-docx（Word 解析）

## 本地运行（开发）

```bash
python kwiki.py
```
