/**
 * Query Core - Search and answer questions from the wiki
 */

import { WikiManager } from '../wiki/index.js';
import { LLMClient } from '../llm/client.js';

export class QueryEngine {
  constructor(config) {
    this.wiki = new WikiManager(config.projectRoot);
    this.llm = new LLMClient(config);
  }

  /** Semantic search across wiki documents */
  async search(query, options = {}) {
    const limit = options.limit || 10;
    
    // Keyword search
    const docs = await this.wiki.searchDocuments(query);
    
    // Build context from found docs
    const contextDocs = docs.slice(0, limit);
    const context = await this._buildContext(contextDocs);
    
    return {
      query,
      results: contextDocs,
      total: docs.length,
      context
    };
  }

  /** Ask a question using LLM with wiki context */
  async ask(question, options = {}) {
    const { useLLM = true } = options;
    
    // Find relevant documents
    const searchResults = await this.search(question, { limit: 5 });
    
    if (!useLLM) {
      return {
        answer: null,
        sources: searchResults.results,
        context: searchResults.context
      };
    }

    // Generate answer using LLM
    const messages = [
      { role: 'system', content: LLMClient.wikiSystemPrompt('query') },
      { role: 'user', content: `基于以下知识库内容回答问题。\n\n=== 知识库内容 ===\n${searchResults.context}\n\n=== 用户问题 ===\n${question}` }
    ];

    const answer = await this.llm.chat(messages, { temperature: 0.5, maxTokens: 2048 });

    return {
      answer,
      sources: searchResults.results,
      context: searchResults.context
    };
  }

  /** Build context string from documents */
  async _buildContext(docs) {
    const parts = [];
    for (const doc of docs) {
      const fullDoc = await this.wiki.getDocument(doc.title);
      if (fullDoc) {
        parts.push(`## ${fullDoc.title}\n${fullDoc.body.slice(0, 3000)}`);
      }
    }
    return parts.join('\n\n---\n\n');
  }

  /** Get backlinks for a document */
  async getBacklinks(title) {
    const graph = await this.wiki.buildLinkGraph();
    return graph[title] || [];
  }
}
