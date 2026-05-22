# 2026-05-21 Ingest Bugs 修复与 UI 改进

## 问题描述

用户反馈了多个 ingest 相关的 bugs：

1. **tags/aliases 不显示** - LLM 生成的 yaml 代码块中的 tags/aliases 没有正确提取到 frontmatter
2. **raw_file 为空** - frontmatter 中的 `raw_file` 字段值为空 `[[../raw/|]]`
3. **末尾多余 ```** - wiki 文件末尾多出一个代码块结束标记
4. **缺少完成提醒** - ingest 完成后没有明显的用户通知

## 解决方案

### 1. 修复 tags/aliases 提取 (`src/core/wiki/manager.ts`)

新增两个私有方法：
- `_extractBodyMetadata()` - 从 body 中的 yaml 代码块提取 tags/aliases
- `_stripYamlCodeBlocks()` - 移除 body 中的 yaml 代码块（避免重复）

在 `saveDocument()` 中调用这两个方法，将提取的 metadata 合并到 frontmatter。

### 2. 修复 raw_file 字段名错误 (`src/core/ingest/pipeline.ts`)

将 `source_url` 改为 `raw_file`，与 `WikiDocument.toMarkdown()` 期望的字段名一致。

### 3. 修复多余 ``` 标记 (`src/core/wiki/manager.ts`)

在 `_stripYamlCodeBlocks()` 中添加逻辑，移除任何孤立的 ``` 结束标记。

### 4. 修复空数组输出格式 (`src/core/wiki/document.ts`)

修改 `toMarkdown()` 方法，空数组输出为 `aliases: []` 而非 `aliases:\n`（避免 YAML 解析为 null）。

### 5. 添加 Toast 通知 (`src/renderer/store/useStore.js` + `src/renderer/App.tsx`)

- 在 store 中添加 toast 状态管理
- 在 App.tsx 中添加 Toast 组件（右上角弹出，4秒自动消失）
- 支持 success/error/info 三种状态样式

### 6. 增强 IngestPage 结果卡片 (`src/renderer/pages/IngestPage.jsx`)

- 调用 Toast 通知
- 添加「打开文件」和「在 Obsidian 查看」按钮

### 7. 新增 CSS 样式 (`src/renderer/styles/global.css`)

- 添加 Toast 颜色变量
- 添加滑入/淡出动画

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/core/wiki/manager.ts` | 修改 - 添加 metadata 提取和清理方法 |
| `src/core/wiki/document.ts` | 修改 - 修复空数组输出格式 |
| `src/core/ingest/pipeline.ts` | 修改 - 修复 raw_file 字段名 |
| `src/renderer/store/useStore.js` | 修改 - 添加 Toast 状态管理 |
| `src/renderer/App.tsx` | 修改 - 添加 Toast 组件 |
| `src/renderer/pages/IngestPage.jsx` | 修改 - 调用 Toast + 增强结果卡片 |
| `src/renderer/styles/global.css` | 修改 - 添加 Toast 样式和动画 |
| `prompts/ingest.md` | 修改 - 优化输出格式 |
| `src/types/index.ts` | 修改 - 补充类型定义 |

## 测试验证

- [x] TypeScript 类型检查通过
- [x] 修复了现有问题文件
- [x] 代码已提交并推送到远程仓库

## 待办

- [ ] 测试新 ingest 是否正常工作
- [ ] 验证 Toast 通知是否正确显示
