# 2026-04-17 微信文章摄入修复

## 日期
2026-04-17

## 修复内容

### 1. 微信文章内容提取失败问题

**问题描述**：
- 错误信息：`无法自动提取网页内容，内容无效或为空`
- 原因：移除元素的 CSS 选择器 `[class*="comment"]` 把 `<body>` 元素移除了，因为 body 的 class 包含 `comment_feature`

**解决方案**：
- 修改 `src/core/ingest/pipeline.ts` 中的移除元素逻辑
- 从通用的 `[class*="comment"]` 改为更精确的选择器
- 只移除明确的广告和评论元素：`[class*="comment-list"], [class*="comment-item"], [class*="sidebar-content"], [class*="advertisement-box"], [class*="ad-container"]`

**相关文件**：
- `src/core/ingest/pipeline.ts`

### 2. Playwright 浏览器缺少 Autofill 禁用参数

**问题描述**：
- Autofill 相关错误：`Request Autofill.enable failed`

**解决方案**：
- 在 `pipeline.ts` 的 `fetchWithPlaywright` 方法中添加 Autofill 禁用参数
- 添加的参数：`--disable-autofill`, `--disable-autofill-service`, `--disable-features=Autofill`

### 3. 日志增强

**新增功能**：
- 在 `pipeline.ts` 中添加了详细的处理过程日志
- 每个阶段都会输出日志：获取内容 → 处理内容 → 保存Wiki → 完成
- 返回结果现在包含更多字段：`filePath`, `rawPath`, `title`

**相关文件**：
- `src/types/index.ts` - 扩展了 `IngestResult` 接口

### 4. 保存路径说明

**重要说明**：
- 文件保存位置由 `config.json` 中的 `projectRoot` 配置决定
- 当前配置：`F:\Obsidian\wiki Test`
- wiki 目录：`F:\Obsidian\wiki Test\wiki\`
- raw 目录：`F:\Obsidian\wiki Test\raw\`

## 测试结果

- 微信文章 `ZBJICyjIfaPZwq9lLs4BZw` 摄入成功
- 保存位置：`F:\Obsidian\wiki Test\wiki\保险的人生态度与财富规划智慧_2026-04-17.md`

## 待办事项

- [ ] 前端需要显示详细的处理结果（保存路径、标题等）
- [ ] 考虑添加中文语言支持到日志中