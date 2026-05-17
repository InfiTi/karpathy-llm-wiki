import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { LLMMessage, LLOptions, ProjectConfig } from '@/types';

function getPromptFilePath(): string {
  const projectRoot = process.cwd();
  return path.join(projectRoot, 'prompts', 'ingest.md');
}

function loadIngestPromptFromFile(): string {
  try {
    const filePath = getPromptFilePath();
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (e) {
    console.warn('Failed to load ingest prompt from file:', e);
  }
  return INGEST_PROMPT_DEFAULT;
}

export interface LLMStreamCallback {
  onThinking?: (text: string) => void;
  onContent?: (text: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

export const INGEST_PROMPT_DEFAULT = `你是知识编译者，将原始文档转换为结构化的Markdown知识库。

## 页面格式（必须严格遵循）
---
title: "页面标题"
type: note
sources: ["原文来源"]
created: YYYY-MM-DD
linked: ["关联页面1", "关联页面2"]
---

## 核心观点
1. 观点1 [[内部链接]]
2. 观点2 [[内部链接]]

## 方法论
1. 步骤1
2. 步骤2

## 实战策略
1. 策略1 [[内部链接]]
2. 策略2 [[内部链接]]

## 案例分析
### 问题
...
### 分析
...
### 解决方案
...

## 总结
一句话核心结论 [[内部链接]]

## 硬性规则
1. 只输出以上格式的Markdown，不要任何其他内容
2. 不要输出"思考过程"、"分析步骤"等
3. 不要解释你在做什么
4. YAML frontmatter必须在最前面
5. 列表用数字编号（1. 2. 3.）
6. 内部链接用[[关键词]]格式，全文至少10个
7. linked字段列出所有内部链接`;

export class LLMClient {
  private backend: string;
  private url: string;
  private model: string;
  private apiKey?: string;
  private timeout: number;
  private config: ProjectConfig;

  constructor(config: ProjectConfig) {
    this.config = config;
    this.backend = config.llm.backend?.toLowerCase() || 'ollama';
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
  static wikiSystemPrompt(operation: 'ingest' | 'query' | 'lint', config?: ProjectConfig): string {
    const ingestPrompt = operation === 'ingest' ? loadIngestPromptFromFile() : INGEST_PROMPT_DEFAULT;

    const prompts = {
      ingest: ingestPrompt,

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
        content: LLMClient.wikiSystemPrompt('ingest', this.config),
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