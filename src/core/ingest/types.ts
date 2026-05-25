export interface IngestOptions {
  pageType?: string;
  tags?: string[];
  autoUpdateIndex?: boolean;
}

export interface RelatedDocument {
  fileName: string;
  title: string;
  relevance: number;
}

export interface IngestSource {
  path: string;
  type: 'file' | 'url' | 'text';
  content?: string;
}

export interface BatchUrlIngestOptions {
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  retryCount?: number;
  skipExistingSourceUrls?: boolean;
}

export interface BatchUrlIngestItemResult {
  url: string;
  normalizedUrl: string;
  success: boolean;
  skipped?: boolean;
  skipReason?: 'invalid_url' | 'duplicate_input' | 'duplicate_existing';
  error?: string;
  title?: string;
  filePath?: string;
  rawPath?: string;
  attempts?: number;
}

export interface BatchUrlIngestResult {
  totalRequested: number;
  totalQueued: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  results: BatchUrlIngestItemResult[];
}
