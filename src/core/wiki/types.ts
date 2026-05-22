export interface WikiDocumentInfo {
  title: string;
  filePath: string;
  fileName: string;
  type: string;
  status: string;
  sourceType: string;
  tags: string[];
  aliases: string[];
  entities: string[];
  links: string[];
  size: number;
  modified: Date;
  created: string;
  content: string;
}

export interface KnowledgeGraph {
  nodes: {
    id: string;
    label: string;
    tags: string[];
  }[];
  links: {
    source: string;
    target: string;
  }[];
}
