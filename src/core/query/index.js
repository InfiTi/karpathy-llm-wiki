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
        context: searchResults.context,
        quality_score: 0,
        suggest_save: false,
        derived_from: []
      };
    }

    // Generate answer using LLM
    const messages = [
      { role: 'system', content: LLMClient.wikiSystemPrompt('query') },
      { role: 'user', content: `基于以下知识库内容回答问题。\n\n=== 知识库内容 ===\n${searchResults.context}\n\n=== 用户问题 ===\n${question}` }
    ];

    const answerText = await this.llm.chat(messages, { temperature: 0.5, maxTokens: 2048 });

    // Calculate quality score (simplified)
    const qualityScore = answerText.length > 100 ? 7 : 5;

    return {
      answer: answerText,
      sources: searchResults.results,
      context: searchResults.context,
      quality_score: qualityScore,
      suggest_save: qualityScore >= 7,
      derived_from: searchResults.results.slice(0, 3).map(r => r.title)
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

  /** Save query answer to wiki */
  async saveToWiki(question, answerData) {
    const { python } = await import('../../main/preload.js');
    return await python.runQuery(question, {
      save_to_wiki: true,
      answer: answerData.answer,
      title: answerData.title,
      tags: answerData.tags,
      derived_from: answerData.derived_from,
    });
  }

  /** Analyze knowledge gaps */
  async analyzeKnowledgeGaps() {
    const docs = await this.wiki.listDocuments();
    const gaps = {
      missingLinks: [],
      orphanedEntries: [],
      outdatedContent: [],
    };

    // 1. Find missing links
    const existingTitles = new Set(docs.map(doc => doc.title));
    for (const doc of docs) {
      const fullDoc = await this.wiki.getDocument(doc.title);
      if (fullDoc) {
        // Extract [[links]] from content
        const links = fullDoc.body.match(/\[\[(.*?)\]\]/g) || [];
        for (const link of links) {
          const title = link.replace(/\[\[|\]\]/g, '').trim();
          if (title && !existingTitles.has(title)) {
            gaps.missingLinks.push({
              source: doc.title,
              link: title,
            });
          }
        }
      }
    }

    // 2. Find orphaned entries (not linked by any other entry)
    const linkedTitles = new Set();
    for (const doc of docs) {
      const fullDoc = await this.wiki.getDocument(doc.title);
      if (fullDoc) {
        const links = fullDoc.body.match(/\[\[(.*?)\]\]/g) || [];
        for (const link of links) {
          const title = link.replace(/\[\[|\]\]/g, '').trim();
          if (title) linkedTitles.add(title);
        }
      }
    }
    gaps.orphanedEntries = docs
      .filter(doc => !linkedTitles.has(doc.title))
      .map(doc => doc.title);

    // 3. Find outdated content (simplified: based on creation date)
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    gaps.outdatedContent = docs
      .filter(doc => new Date(doc.created || 0) < oneMonthAgo)
      .map(doc => ({
        title: doc.title,
        created: doc.created,
      }));

    return gaps;
  }

  /** Get topic recommendations based on knowledge gaps */
  async getTopicRecommendations() {
    const gaps = await this.analyzeKnowledgeGaps();
    const recommendations = [];

    // Recommend missing links as topics
    for (const missing of gaps.missingLinks) {
      recommendations.push({
        type: 'missing_link',
        title: missing.link,
        source: missing.source,
        priority: 'high',
        reason: `被 ${missing.source} 引用但不存在`,
      });
    }

    // Recommend orphaned entries for improvement
    for (const orphan of gaps.orphanedEntries) {
      recommendations.push({
        type: 'orphaned',
        title: orphan,
        priority: 'medium',
        reason: '未被其他条目引用',
      });
    }

    // Recommend updating outdated content
    for (const outdated of gaps.outdatedContent) {
      recommendations.push({
        type: 'outdated',
        title: outdated.title,
        priority: 'low',
        reason: `创建于 ${outdated.created}，可能需要更新`,
      });
    }

    // Limit to top 10 recommendations
    return recommendations.slice(0, 10);
  }

  /** Get related questions based on current query */
  async getRelatedQuestions(query) {
    if (!query) return [];

    try {
      const messages = [
        { role: 'system', content: '你是一个知识助手，擅长基于用户问题生成相关的后续问题。' },
        { role: 'user', content: `基于问题："${query}"，生成 5 个相关的后续问题，这些问题应该有助于更全面地了解这个话题。` }
      ];

      const response = await this.llm.chat(messages, { temperature: 0.7, maxTokens: 500 });

      // Parse the response to extract questions
      const lines = response.split('\n');
      const questions = lines
        .map(line => line.trim())
        .filter(line => line && (line.startsWith('?') || line.endsWith('?') || line.match(/^\d+\./)))
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.endsWith('?'))
        .slice(0, 5);

      return questions.map(question => ({
        type: 'related_question',
        question: question,
        priority: 'medium',
        reason: '基于当前查询推荐',
      }));
    } catch (error) {
      console.error('Error generating related questions:', error);
      return [];
    }
  }

  /** Get related questions based on a wiki document */
  async getRelatedQuestionsForDocument(title) {
    try {
      const doc = await this.wiki.getDocument(title);
      if (!doc) return [];

      const messages = [
        { role: 'system', content: '你是一个知识助手，擅长基于文档内容生成相关的问题。' },
        { role: 'user', content: `基于文档 "${title}" 的内容，生成 5 个相关的问题，这些问题应该有助于更深入地了解这个话题。\n\n文档内容：${doc.body.slice(0, 1000)}...` }
      ];

      const response = await this.llm.chat(messages, { temperature: 0.7, maxTokens: 500 });

      // Parse the response to extract questions
      const lines = response.split('\n');
      const questions = lines
        .map(line => line.trim())
        .filter(line => line && (line.startsWith('?') || line.endsWith('?') || line.match(/^\d+\./)))
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.endsWith('?'))
        .slice(0, 5);

      return questions.map(question => ({
        type: 'related_question',
        question: question,
        document: title,
        priority: 'medium',
        reason: `基于文档 ${title} 推荐`,
      }));
    } catch (error) {
      console.error('Error generating related questions for document:', error);
      return [];
    }
  }

  /** Get knowledge exploration recommendations */
  async getKnowledgeExploration() {
    try {
      const docs = await this.wiki.listDocuments();
      if (docs.length === 0) return [];

      // Analyze document tags and links to identify core topics
      const tagCount = new Map();
      const linkCount = new Map();

      for (const doc of docs) {
        const fullDoc = await this.wiki.getDocument(doc.title);
        if (fullDoc) {
          // Count tags
          if (fullDoc.tags) {
            for (const tag of fullDoc.tags) {
              tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
            }
          }

          // Count links
          const links = fullDoc.body.match(/\[\[(.*?)\]\]/g) || [];
          for (const link of links) {
            const title = link.replace(/\[\[|\]\]/g, '').trim();
            if (title) {
              linkCount.set(title, (linkCount.get(title) || 0) + 1);
            }
          }
        }
      }

      // Identify core topics (tags with highest count)
      const coreTags = Array.from(tagCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag);

      // Identify important documents (most linked to)
      const importantDocs = Array.from(linkCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([title]) => title);

      // Combine and deduplicate
      const allTopics = [...new Set([...coreTags, ...importantDocs])];

      // Randomly select 5 topics for exploration
      const shuffled = allTopics.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 5);

      return selected.map(topic => ({
        type: 'exploration',
        topic: topic,
        priority: 'low',
        reason: '知识探索推荐',
      }));
    } catch (error) {
      console.error('Error generating knowledge exploration:', error);
      return [];
    }
  }

  /** Get combined topic recommendations (gaps + related questions + exploration) */
  async getCombinedRecommendations(query = null) {
    const [gaps, related, exploration] = await Promise.all([
      this.getTopicRecommendations(),
      query ? this.getRelatedQuestions(query) : Promise.resolve([]),
      this.getKnowledgeExploration()
    ]);

    // Combine all recommendations
    const all = [...gaps, ...related, ...exploration];

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    all.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Limit to top 10
    return all.slice(0, 10);
  }
}
