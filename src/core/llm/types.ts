export interface LLMClientConfig {
  backend: 'ollama' | 'lmStudio' | 'openai';
  url: string;
  model: string;
  apiKey?: string;
  timeout: number;
}

export interface LLMResponse {
  content: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
}