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