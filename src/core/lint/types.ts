export interface LintOptions {
  autoCheck?: boolean;
  llmEvaluation?: boolean;
  reportFormat?: 'markdown' | 'json';
}

export interface WikiStatistics {
  totalDocuments: number;
  totalLinks: number;
  totalTags: number;
  averageDocumentSize: number;
}

export interface LintIssue {
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  document?: string;
}