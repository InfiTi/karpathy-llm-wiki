# 2026-05-23 压缩版上下文摘要（供后续持续推进）

## 一、项目边界

已新增项目定义文件：
- `progress/project-definition-karpathy-llm-wiki.md`

后续所有开发以该文件为准。
当前阶段重点：
1. 流程稳定
2. 输出结构稳定
3. Index / Lint 可验收
4. 暂不优先优化测试内容本身

## 二、已完成能力

### 1. Index
- 已从增量追加改为全库扫描重建
- 主索引位置：`projectRoot/index.md`
- 已移除误生成的 `wiki/索引.md`
- 已支持：
  - `entities_map`
  - 待合并 / 待治理
  - 孤立条目（待关联）
  - 标签分类

### 2. Lint（规则型）
- 后端已支持：
  - `broken_link_group`
  - `duplicate_title_group`
  - `similar_title_cluster`
  - `orphan_note_group`
- 前端已支持：
  - 展开详情
  - 严重级别筛选
  - 问题类型筛选
  - 顶部摘要卡片联动筛选
  - 按严重级别 / 详情数量排序

## 三、测试库现状

测试库：`F:\Obsidian\wiki Test`

最近一次规则型 Lint 验收结果：
- 扫描条目数：65
- 问题类别数：63
- 分布：
  - `broken_link_group`: 55
  - `duplicate_title_group`: 6
  - `similar_title_cluster`: 1
  - `orphan_note_group`: 1

说明：
- 当前库非常适合作为流程与输出结构的验收环境
- 重点不是内容本身，而是 APP 能否稳定给出结构化结果

## 四、当前最合理的下一步

继续强化 Lint，使其更适合做“结构验收器”。
优先方向：
1. 让摘要更可操作
2. 让问题组能给出更明确的治理优先级
3. 在 UI 上让用户更快定位“最值得处理的组”

## 五、最近提交点
- `7c22b46` 重构索引生成并落地第一版规则型Lint
- `2284a1c` 增强Lint展示并支持问题详情展开
- `60c33b5` 补充项目定义并增强Lint筛选交互
