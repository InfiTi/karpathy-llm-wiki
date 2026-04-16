// 配置类型定义
export interface LLMConfig {
  backend: 'ollama' | 'lmStudio' | 'openai';
  url: string;
  model: string;
  apiKey?: string;
  timeout: number;
}

export interface ProjectConfig {
  projectRoot: string;
  llm: LLMConfig;
  wiki: {
    directory: string;
    rawDirectory: string;
  };
  ingest: {
    defaultPageType: string;
  };
  query: {
    maxContextTokens: number;
  };
  lint: {
    autoCheck: boolean;
  };
}

// 文档类型定义
export interface WikiDocumentMetadata {
  title: string;
  type: string;
  tags: string[];
  created: string;
  modified: string;
  source: string;
  linked: string[];
  [key: string]: any;
}

export interface WikiDocument {
  filePath: string;
  metadata: WikiDocumentMetadata;
  body: string;
  links: string[];
}

// LLM 相关类型
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

// 模块类型
export interface IngestResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface QueryResult {
  answer: string;
  qualityScore: number;
  suggestSave: boolean;
  derivedFrom: string[];
  recommendations?: string[];
}

export interface LintResult {
  score: number;
  issues: {
    type: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
    suggestion: string;
  }[];
  summary: string;
}