# LLM Wiki Schema v1.1
## 核心定位
本文档是本 LLM Wiki 的唯一规则手册与编辑规范。
所有页面生成、更新、链接、命名、格式必须严格遵循本 Schema。

---

## 1. 目录结构
- `raw/`：原始资料入口，只读，不可修改、不可删除。
- `wiki/`：LLM 自动编译输出的结构化维基页面，人类可读可编辑。
- `schema/`：规则、模板、标签词典、命名规范。

---

## 2. 页面类型规范
只允许以下 6 种页面类型：
1. **concept** —— 概念、定义、原理
2. **paper** —— 论文、技术报告
3. **person** —— 研究者、从业者
4. **tool** —— 框架、库、工具、系统
5. **dataset** —— 数据集、评测基准
6. **note** —— 笔记、摘要、个人理解

---

## 3. 页面命名规则
- 统一使用 **小写字母 + 短横线**
- 无空格、无特殊符号、无中文标点
- 示例：
  - `attention-mechanism.md`
  - `2017-transformer.md`
  - `andrej-karpathy.md`
  - `llama-2.md`
- 一篇论文一页、一个概念一页、一个工具一页。

---

## 4. 页面固定格式（Frontmatter + 结构）
每个页面顶部必须包含：

```yaml
---
title: 页面标准名称
type: concept/paper/person/tool/dataset/note
tags: [tag1, tag2, tag3]
created: YYYY-MM-DD
source: raw/文件名.pdf
linked: [页面1, 页面2]
---