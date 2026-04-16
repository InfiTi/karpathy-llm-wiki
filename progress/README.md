# karpathy-kwiki 进度管理系统

**项目**: KWiki — Karpathy LLM Wiki 知识入库工具
**进度文件**: `e:\AI\Karpathy\progress`
**源码位置**: `E:\AI\Karpathy`
**状态**: #in-progress
**创建日期**: 2026-04-16
**最后更新**: 2026-04-16

## 核心目标

将网页、视频、PDF、Word 通过 AI 自动整理成 Obsidian 知识库。

## 技术栈

- Python 3.12 + Tkinter + PyInstaller
- Electron + React + Vite
- Ollama qwen3.5（本机 GPU）
- yt-dlp（视频）/ trafilatura+BeautifulSoup（网页）/ PyMuPDF（PDF）/ python-docx（Word）

## 三层架构

```
raw/   ← 原始内容（抓取后的 Markdown）
         ↓ Ingest（摄入）
wiki/  ← AI 维护的结构化知识（摘要/要点/链接）
         ↓ Lint（检查）
知识库质量报告 → 发现矛盾/过时/缺失
         ↓ Query（查询）
outputs/ ← AI 生成的回答（可回填 wiki/）
```

## 史诗进度

| Epic | 标题 | 进度 | 状态 |
|------|------|------|------|
| [epic-001](epics/epic-001/epic-001.md) | 核心功能实现 | 100% | #completed |
| [epic-002](epics/epic-002/epic-002.md) | 质量保证体系 | 100% | #completed |
| [epic-003](epics/epic-003/epic-003.md) | Query 增强 | 0% | #in-progress |

## 快速导航

- [路线图](ROADMAP.md)
- 史诗列表：
  - [epic-001 核心功能](epics/epic-001/epic-001.md)
  - [epic-002 质量保证](epics/epic-002/epic-002.md)
  - [epic-003 Query 增强](epics/epic-003/epic-003.md)
- 决策记录：
  - [adr-001 Markdown进度管理](decisions/adr-001.md)
  - [adr-002 前端框架选型](decisions/adr-002.md)
- 执行日志：
  - [2026-04-16 初始化](logs/2026-04-16-init.md)
  - [2026-04-16 清理知识图谱](logs/2026-04-16-cleanup.md)
  - [2026-04-16 v0.3.0 规划](logs/2026-04-16-v030-plan.md)
