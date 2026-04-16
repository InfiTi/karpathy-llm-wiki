export interface QueryOptions {
  temperature?: number;
  maxTokens?: number;
  topK?: number;
}

export interface TopicRecommendation {
  title: string;
  description: string;
  relevance: number;
}