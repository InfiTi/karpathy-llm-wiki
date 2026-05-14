/**
 * LLM Client - Unified interface for Ollama and LM Studio
 */

export class LLMClient {
  constructor(config) {
    this.backend = config.llm?.backend || config.llmBackend || 'ollama';
    this.url = this.backend === 'ollama'
      ? (config.ollamaUrl || 'http://localhost:11434')
      : (config.lmStudioUrl || 'http://localhost:1234');
    this.model = config.defaultModel || 'qwen3.5:latest';
    this.timeout = 120000;
  }

  /** Check if the backend is reachable */
  async ping() {
    try {
      const endpoint = this.backend === 'ollama'
        ? `${this.url}/api/tags`
        : `${this.url}/v1/models`;
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** List available models */
  async listModels() {
    if (this.backend === 'ollama') {
      const res = await fetch(`${this.url}/api/tags`);
      const data = await res.json();
      return (data.models || []).map(m => ({ name: m.name, size: m.size }));
    } else {
      const res = await fetch(`${this.url}/v1/models`);
      const data = await res.json();
      return (data.data || []).map(m => ({ name: m.id, size: null }));
    }
  }

  /** Send a chat completion request */
  async chat(messages, options = {}) {
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? 2048;

    if (this.backend === 'ollama') {
      return this._chatOllama(messages, { temperature, maxTokens });
    } else {
      return this._chatLMStudio(messages, { temperature, maxTokens });
    }
  }

  async _chatOllama(messages, opts) {
    const res = await fetch(`${this.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: opts.temperature,
          num_predict: opts.maxTokens,
        }
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.message.content;
  }

  async _chatLMStudio(messages, opts) {
    const res = await fetch(`${this.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) throw new Error(`LM Studio error: ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  /** Build system prompt for LLM Wiki operations */
  static wikiSystemPrompt(operation) {
    const prompts = {
      ingest: `你是一个严格的 LLM Wiki 编译系统。
请严格遵循 SCHEMA 规范，对原始资料进行深度知识提炼，生成结构化的 Markdown 维基页面。

### 必须输出的固定结构（按顺序全部输出）：

1. **YAML frontmatter**（必须包含）：
   - 必须以三个短横线 \`---\` 开头和结尾
   - title：页面标题（字符串，带双引号）
   - type：页面类型（concept/paper/person/tool/dataset/note）
   - tags：标签列表（YAML 列表格式）
   - created：创建日期（YYYY-MM-DD）
   - source：来源 URL
   - linked：关联页面列表（YAML 列表格式）

2. **正文结构（固定章节，顺序不可调）：**
   - ## 核心观点：3-5 条，用数字编号，每条一句话
   - ## 方法论：可操作的步骤方法，用数字编号
   - ## 实战策略：具体可执行的策略和话术
   - ## 案例分析：包含 ### 问题、### 分析、### 解决方案 子结构
   - ## 总结：一句话核心结论

3. **内部链接**：
   - 在正文中用 [[关键词]] 标注关联概念
   - 每页至少 10 个 [[内部链接]]
   - linked 字段必须列出所有关联页面

4. **格式规范**：
   - 列表项统一用数字编号（1. 2. 3.），不用短横线
   - 禁止幻觉，内容必须来自原始资料
   - 过滤所有营销内容（直播预约、扫码关注等）
   - 矛盾信息标注 ⚠️
   - 只输出 Markdown，不解释、不闲聊

### 输出格式示例：
\`\`\`
---
title: "保险金信托架构与婚姻财产规划"
type: paper
tags:
  - 财富传承
  - 保险金信托
  - 婚姻财产
created: 2024-05-20
source: https://example.com/article
linked:
  - 保险信托
  - 家族信托
  - 现金价值
---

## 核心观点
1. 婚姻存续期间继承所得遗产若无明确约定，通常属于 [[婚姻共同财产]]，配偶拥有 50% 所有权。
...

## 方法论
1. 需求探询：在配置产品前，先通过提问明确客户对"不安全"的定义...
...
\`\`\`

输入：原始文档内容
输出：结构化的 Markdown 维基内容`,

      query: `你是一个知识库问答助手，基于维基文档回答用户问题。
要求：
- 只基于提供的文档内容回答，不要编造
- 如果找不到答案，明确说明
- 用中文回答，语言简洁专业
- 可以引用相关文档片段`,

      lint: `你是一个知识库质量检查员，检查维基文档的质量问题。
检查维度：
1. 内容完整性（是否有遗漏的重要信息）
2. 事实一致性（是否存在矛盾）
3. 时效性（信息是否可能已过时）
4. 格式规范性（Markdown格式、双向链接）
5. 可读性（语言是否清晰）

输出格式（JSON）：
{
  "score": 0-100,
  "issues": [{"type": "类型", "severity": "high|medium|low", "description": "描述", "suggestion": "修复建议"}],
  "summary": "总体评价"
}
只输出JSON，不要其他内容。`
    };
    return prompts[operation] || prompts.query;
  }
}