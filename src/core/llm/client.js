/**
 * LLM Client - Unified interface for Ollama and LM Studio
 */

export class LLMClient {
  constructor(config) {
    this.backend = config.llmBackend || 'ollama';
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
      ingest: `你是一个知识库管理员，负责从原始文档中提取关键信息，生成结构化的维基条目。
输入：原始文档内容
输出：结构化的 Markdown 维基内容，包含：
- 标题（# 一级标题）
- 摘要（200字以内）
- 关键概念（用列表）
- 详细内容（分章节）
- 相关链接（[[双向链接]] 格式）
请用中文输出。`,

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
