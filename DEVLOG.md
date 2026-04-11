# Karpathy LLM Wiki - 开发日志

## v0.1.0 - 基础架构 (2026-04-11)

### 完成内容
- [x] 项目初始化 - Electron + React + Vite
- [x] 主进程 IPC 文件系统操作
- [x] 前端 UI - 6 个功能页面（Dashboard / Setup / Ingest / Query / Lint / Config）
- [x] 核心模块：
  - `src/core/llm/` - Ollama / LM Studio 统一客户端
  - `src/core/wiki/` - Wiki 文档管理、双向链接、Link Graph
  - `src/core/ingest/` - 原始文档摄入 pipeline
  - `src/core/query/` - 知识库查询引擎
  - `src/core/lint/` - Wiki 质量检查
- [x] GitHub 推送 https://github.com/InfiTi/karpathy-llm-wiki
- [x] 运行验证：Vite dev server 正常启动

### 技术栈
- Electron + React + Vite
- Zustand（状态管理）
- React Router（页面导航）
- Ollama / LM Studio（本地 AI）

### 待完成
- [ ] 主进程与前端 IPC 深度集成
- [ ] Ingest pipeline 实际调用 AI
- [ ] Query 接入真实 Wiki 数据
- [ ] LLM Lint 分析
- [ ] Obsidian 双向链接预览
