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

export type WikiDocumentType = 'note' | 'index' | 'moc';
export type WikiDocumentStatus = 'Raw' | 'Compiled' | 'Deprecated';
export type SourceType = 'wechat_article' | 'pdf' | 'web_clip' | 'book' | 'other';
export type Reliability = 1 | 2 | 3 | 4 | 5;

export interface WikiFrontMatter {
  title: string;
  created: string;
  modified: string;
  type: WikiDocumentType;
  status: WikiDocumentStatus;

  source_type: SourceType;
  raw_file: string;
  reliability: Reliability;

  compiler: string;
  compiler_version: string;

  compiled_at: string;
  lint_count: number;
  last_linted_at: string;

  aliases: string[];
  tags: string[];
  entities: string[];
}

export interface WikiDocument {
  filePath: string;
  metadata: WikiFrontMatter;
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
  rawPath?: string;
  title?: string;
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
    count?: number;
    affectedDocuments?: string[];
    actionItems?: string[];
    evidence?: string[];
    details?: string[];
  }[];
  summary: string;
  priorities?: string[];
  governance?: {
    totalDocuments: number;
    issueCount: number;
    issueGroupCount: number;
    severityCounts: {
      high: number;
      medium: number;
      low: number;
    };
    scoreBreakdown: {
      key: string;
      label: string;
      points: number;
      issueGroupCount: number;
      signalCount: number;
      summary: string;
      issueTypes: string[];
    }[];
    sourceUrlHighlights: {
      raw: {
        sourceUrl: string;
        count: number;
        documents: string[];
      }[];
      wiki: {
        sourceUrl: string;
        count: number;
        documents: string[];
      }[];
    };
    topIssueTypes: {
      type: string;
      severity: 'high' | 'medium' | 'low';
      count: number;
      description: string;
      suggestion: string;
    }[];
    topDocuments: {
      fileName: string;
      title: string;
      issueCount: number;
      issueTypes: string[];
    }[];
    recommendedActions: {
      type: string;
      severity: 'high' | 'medium' | 'low';
      count: number;
      action: string;
      documents: string[];
    }[];
  };
}
