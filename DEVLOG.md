# DEVLOG.md

## 2026-04-12 v0.1.0 - 第一版发布

### 项目重构
- 放弃 Electron 项目形态，改为 Python Tkinter 轻量桌面工具
- 目标：稳定的「知识入库工具」，不依赖 AI 对话，直接处理输入

### 技术栈
- Python 3.12 + Tkinter（GUI，无额外依赖）
- PyInstaller 打包 exe（18MB）
- yt-dlp（视频字幕）
- trafilatura + BeautifulSoup（网页正文）
- PyMuPDF（PDF 解析）
- python-docx（Word 解析）
- Ollama / OpenAI 兼容接口（LLM）

### 核心模块
```
kwiki.py          - 主入口，Tkinter GUI
config/__init__.py  - 配置管理（Vault 路径、LLM 地址）
fetchers/__init__.py - 内容抓取（网页/视频/PDF/DOCX）
llm/__init__.py      - LLM 调用
wiki/__init__.py     - Obsidian 文件写入
```

### 关键 Bug 修复
1. Ollama 中文乱码：requests 对无 charset 的 JSON 响应默认用 latin1 解码
   修复：json.loads(resp.content.decode("utf-8"))
2. trafilatura 提取失败：Wikipedia 等页面返回空
   修复：加 BeautifulSoup fallback 兜底
3. PyInstaller Qt 冲突：conda 环境同时装了 PyQt5 和 PySide6
   修复：spec 文件中排除所有 Qt 绑定

### 下一步
- [ ] exe 测试运行
- [ ] 视频字幕功能实测（B站/YouTube）
- [ ] PDF/DOCX 实测
- [ ] 视频转录功能（Whisper 深度模式）
