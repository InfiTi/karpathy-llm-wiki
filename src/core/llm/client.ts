import axios from 'axios';
import { LLMMessage, LLOptions, ProjectConfig } from '@/types';

export class LLMClient {
  private backend: string;
  private url: string;
  private model: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: ProjectConfig) {
    this.backend = config.llm.backend || 'ollama';
    this.url = this.backend === 'ollama'
      ? (config.llm.url || 'http://localhost:11434')
      : (config.llm.url || 'http://localhost:1234');
    this.model = config.llm.model || 'qwen3.5:latest';
    this.apiKey = config.llm.apiKey;
    this.timeout = config.llm.timeout || 120000;
  }

  /** Check if the backend is reachable */
  async ping(): Promise<boolean> {
    try {
      const endpoint = this.backend === 'ollama'
        ? `${this.url}/api/tags`
        : `${this.url}/v1/models`;
      
      const res = await axios.get(endpoint, {
        timeout: 5000,
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /** List available models */
  async listModels(): Promise<{ name: string; size: number | null }[]> {
    if (this.backend === 'ollama') {
      const res = await axios.get(`${this.url}/api/tags`);
      const data = res.data;
      return (data.models || []).map((m: any) => ({
        name: m.name,
        size: m.size,
      }));
    } else {
      const res = await axios.get(`${this.url}/v1/models`);
      const data = res.data;
      return (data.data || []).map((m: any) => ({
        name: m.id,
        size: null,
      }));
    }
  }

  /** Send a chat completion request */
  async chat(messages: LLMMessage[], options: LLOptions = {}): Promise<string> {
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? 2048;

    if (this.backend === 'ollama') {
      return this._chatOllama(messages, { temperature, maxTokens });
    } else if (this.backend === 'openai') {
      return this._chatOpenAI(messages, { temperature, maxTokens });
    } else {
      return this._chatLMStudio(messages, { temperature, maxTokens });
    }
  }

  private async _chatOllama(messages: LLMMessage[], opts: { temperature: number; maxTokens: number }): Promise<string> {
    const res = await axios.post(`${this.url}/api/chat`, {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: opts.temperature,
        num_predict: opts.maxTokens,
      },
    }, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return res.data.message.content;
  }

  private async _chatLMStudio(messages: LLMMessage[], opts: { temperature: number; maxTokens: number }): Promise<string> {
    const res = await axios.post(`${this.url}/v1/chat/completions`, {
      model: this.model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: false,
    }, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return res.data.choices[0].message.content;
  }

  private async _chatOpenAI(messages: LLMMessage[], opts: { temperature: number; maxTokens: number }): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: this.model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: false,
    }, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    return res.data.choices[0].message.content;
  }

  /** Build system prompt for LLM Wiki operations */
  static wikiSystemPrompt(operation: 'ingest' | 'query' | 'lint'): string {
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
只输出JSON，不要其他内容。`,
    };

    return prompts[operation] || prompts.query;
  }

  /** Ingest operation - compile raw content into wiki format */
  async ingest(rawContent: string): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: LLMClient.wikiSystemPrompt('ingest'),
      },
      {
        role: 'user',
        content: rawContent,
      },
    ];

    return this.chat(messages, {
      temperature: 0.3,
      maxTokens: 4096,
    });
  }

  /** Query operation - answer user question based on wiki content */
  async query(question: string, context: string): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: LLMClient.wikiSystemPrompt('query'),
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ];

    return this.chat(messages, {
      temperature: 0.7,
      maxTokens: 2048,
    });
  }

  /** Lint operation - evaluate wiki quality */
  async lint(wikiContent: string): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: LLMClient.wikiSystemPrompt('lint'),
      },
      {
        role: 'user',
        content: wikiContent,
      },
    ];

    return this.chat(messages, {
      temperature: 0.3,
      maxTokens: 2048,
    });
  }
}