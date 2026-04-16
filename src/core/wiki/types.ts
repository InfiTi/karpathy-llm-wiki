export interface WikiDocumentInfo {
  title: string;
  filePath: string;
  fileName: string;
  tags: string[];
  aliases: string[];
  links: string[];
  size: number;
  modified: Date;
  created: string;
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