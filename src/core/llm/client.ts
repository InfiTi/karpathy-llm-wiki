import axios from 'axios';
import { LLMMessage, LLOptions, ProjectConfig } from '@/types';

export interface LLMStreamCallback {
  onThinking?: (text: string) => void;
  onContent?: (text: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

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
      ingest: `你是一个严格的 LLM Wiki 编译系统。
请严格遵循 SCHEMA 规范，对原始资料进行深度知识提炼，生成结构化的 Markdown 维基页面。

### 必须输出的固定结构（按顺序全部输出）：

1. **YAML frontmatter**（必须包含）：
   - title：页面标题
   - type：页面类型（concept/paper/person/tool/dataset/note）
   - tags：标签列表
   - created：创建日期（YYYY-MM-DD）
   - source：来源 URL
   - linked：关联页面列表（中括号格式，如 ["黄金", "保险"]）

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

  /** Stream chat with callbacks for progress reporting */
  async streamChat(messages: LLMMessage[], callback?: LLMStreamCallback): Promise<string> {
    if (this.backend === 'ollama') {
      return this._streamChatOllama(messages, callback);
    } else if (this.backend === 'openai') {
      return this._streamChatOpenAI(messages, callback);
    } else {
      return this._streamChatLMStudio(messages, callback);
    }
  }

  private async _streamChatOllama(messages: LLMMessage[], callback?: LLMStreamCallback): Promise<string> {
    let fullContent = '';
    let thinkingContent = '';
    let inThinking = false;
    let lastChunkTime = Date.now();

    try {
      const response = await axios.post(`${this.url}/api/chat`, {
        model: this.model,
        messages,
        stream: true,
      }, {
        timeout: this.timeout,
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream',
      });

      const stream = response.data;

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => {
          try {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              const data = JSON.parse(line);
              const delta = data.message?.content || '';
              const reasoning = data.message?.reasoning || '';

              if (reasoning) {
                thinkingContent += reasoning;
                inThinking = true;
                if (callback?.onThinking) {
                  callback.onThinking(thinkingContent);
                }
              }

              if (delta) {
                if (inThinking && callback?.onThinking) {
                  callback.onThinking(''); // Signal thinking ended
                  inThinking = false;
                }
                fullContent += delta;
                if (callback?.onContent) {
                  callback.onContent(delta);
                }
              }
            }
            lastChunkTime = Date.now();
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        });

        stream.on('end', () => {
          if (callback?.onComplete) {
            callback.onComplete(fullContent);
          }
          resolve(fullContent);
        });

        stream.on('error', (err: Error) => {
          if (callback?.onError) {
            callback.onError(err);
          }
          reject(err);
        });
      });
    } catch (error) {
      if (callback?.onError && error instanceof Error) {
        callback.onError(error);
      }
      throw error;
    }
  }

  private async _streamChatOpenAI(messages: LLMMessage[], callback?: LLMStreamCallback): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    let fullContent = '';

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: this.model,
      messages,
      stream: true,
    }, {
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      responseType: 'stream',
    });

    const stream = response.data;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              if (callback?.onContent) {
                callback.onContent(delta);
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      stream.on('end', () => {
        if (callback?.onComplete) {
          callback.onComplete(fullContent);
        }
        resolve(fullContent);
      });

      stream.on('error', (err: Error) => {
        if (callback?.onError) {
          callback.onError(err);
        }
        reject(err);
      });
    });
  }

  private async _streamChatLMStudio(messages: LLMMessage[], callback?: LLMStreamCallback): Promise<string> {
    let fullContent = '';

    const response = await axios.post(`${this.url}/v1/chat/completions`, {
      model: this.model,
      messages,
      stream: true,
    }, {
      timeout: this.timeout,
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream',
    });

    const stream = response.data;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              if (callback?.onContent) {
                callback.onContent(delta);
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      stream.on('end', () => {
        if (callback?.onComplete) {
          callback.onComplete(fullContent);
        }
        resolve(fullContent);
      });

      stream.on('error', (err: Error) => {
        if (callback?.onError) {
          callback.onError(err);
        }
        reject(err);
      });
    });
  }
}