import path from 'path';
import fs from 'fs-extra';
import { LLMClient } from '@/core/llm';
import { WikiManager } from '@/core/wiki';
import { ProjectConfig, QueryResult, LLMMessage } from '@/types';

export class QueryEngine {
  private llmClient: LLMClient;
  private wikiManager: WikiManager;
  private outputsDir: string;

  constructor(config: ProjectConfig) {
    this.llmClient = new LLMClient(config);
    this.wikiManager = new WikiManager(config.projectRoot);
    this.outputsDir = path.join(config.projectRoot, 'outputs');
  }

  /** Initialize query engine */
  async initialize(): Promise<void> {
    await this.wikiManager.initialize();
    await fs.ensureDir(this.outputsDir);
  }

  /** Run query and generate answer */
  async runQuery(question: string): Promise<QueryResult> {
    try {
      // Search wiki for relevant documents
      const relevantDocs = await this.searchWiki(question);

      // Build context from relevant documents
      const context = await this.buildContext(relevantDocs);

      // Generate answer using LLM
      const answer = await this.llmClient.query(question, context);

      // Analyze answer quality
      const analysis = await this.analyzeAnswer(answer, question);

      // Save answer to outputs
      await this.saveAnswer(question, answer, relevantDocs);

      // Get topic recommendations
      const recommendations = await this.getTopicRecommendations(question, answer);

      return {
        answer,
        qualityScore: analysis.score,
        suggestSave: analysis.suggestSave,
        derivedFrom: relevantDocs.map(d => d.fileName),
        recommendations,
      };
    } catch (error) {
      console.error('Query error:', error);
      return {
        answer: `查询失败: ${error instanceof Error ? error.message : '未知错误'}`,
        qualityScore: 0,
        suggestSave: false,
        derivedFrom: [],
      };
    }
  }

  /** Search wiki for relevant documents */
  async searchWiki(query: string): Promise<{
    fileName: string;
    title: string;
    content: string;
  }[]> {
    const docs = await this.wikiManager.searchDocuments(query);
    const relevantDocs: {
      fileName: string;
      title: string;
      content: string;
    }[] = [];

    for (const doc of docs.slice(0, 5)) {
      relevantDocs.push({
        fileName: doc.fileName,
        title: doc.title,
        content: doc.content || '',
      });
    }

    return relevantDocs;
  }

  /** Build context from relevant documents */
  async buildContext(docs: {
    fileName: string;
    title: string;
    content: string;
    score?: number;
  }[]): Promise<string> {
    if (docs.length === 0) {
      return '（知识库为空，没有找到相关信息）';
    }

    const blocks: string[] = [];
    let totalChars = 0;
    const maxChars = 4000;

    for (const doc of docs) {
      const score = doc.score || 0;
      const title = doc.title || 'Unknown';
      const content = doc.content || '';

      // 提取相关段落（包含关键词的段落）
      const relevantParagraphs = this.extractRelevantParagraphs(content, this.extractKeywordsFromText(doc.title + ' ' + content));

      const block = `### [[${title}]]\n` +
        `相关度: ${score}\n` +
        `${relevantParagraphs.slice(0, 500)}`;

      if (totalChars + block.length > maxChars) {
        break;
      }

      blocks.push(block);
      totalChars += block.length;
    }

    return blocks.join('\n\n---\n\n') + `\n\n---\n\n[共 ${blocks.length} 个相关知识条目]`;
  }

  /** Extract keywords from text */
  private extractKeywordsFromText(text: string): string[] {
    const chineseTerms = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
    const englishWords = text.match(/[a-zA-Z]{2,}/g) || [];
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];

    const allWords = [...chineseTerms, ...englishWords, ...chineseChars];

    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'from', 'about', 'a', 'an', 'of', 'to', 'in', 'on', 'by',
      'what', 'how', 'why', 'is', 'are', 'can', 'do', 'this', 'that',
      '什么', '是', '的', '了', '在', '有', '和', '我', '他', '她', '它', '们'
    ]);

    return [...new Set(allWords.filter(w => !stopWords.has(w.toLowerCase())))];
  }

  /** Extract relevant paragraphs containing keywords */
  private extractRelevantParagraphs(content: string, keywords: string[]): string {
    const paragraphs = content.split(/\n\n+/);
    const relevant = paragraphs.filter(p =>
      keywords.some(kw => p.toLowerCase().includes(kw.toLowerCase())) &&
      p.length > 30
    );
    return relevant.join('\n\n');
  }

  /** Analyze answer quality */
  async analyzeAnswer(answer: string, question: string): Promise<{
    score: number;
    suggestSave: boolean;
  }> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `你是一个答案质量评估助手，评估以下答案的质量。\n\n评估标准：\n1. 相关性：答案是否直接回答了问题\n2. 准确性：答案是否准确\n3. 完整性：答案是否完整\n4. 清晰度：答案是否清晰易懂\n5. 深度：答案是否有深度\n\n评分范围：0-10分\n\n如果答案质量高（7分以上），建议保存到Wiki。\n\n输出格式：\n{"score": 8, "suggestSave": true}`,
      },
      {
        role: 'user',
        content: `问题: ${question}\n\n答案: ${answer}`,
      },
    ];

    try {
      const response = await this.llmClient.chat(messages, {
        temperature: 0.3,
        maxTokens: 100,
      });

      const parsed = JSON.parse(response);
      return {
        score: parsed.score || 5,
        suggestSave: parsed.suggestSave || false,
      };
    } catch {
      return {
        score: 5,
        suggestSave: false,
      };
    }
  }

  /** Save answer to outputs directory */
  async saveAnswer(question: string, answer: string, relevantDocs: {
    fileName: string;
    title: string;
    content: string;
  }[]): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}.md`;
    const filePath = path.join(this.outputsDir, fileName);

    const content = [
      '---',
      `title: "${question}"`,
      `created: ${new Date().toISOString()}`,
      `source: query-generated`,
      `derived_from: [${relevantDocs.map(d => `"${d.fileName}"`).join(', ')}]`,
      `original_question: "${question}"`,
      '---',
      '',
      `# ${question}`,
      '',
      answer,
      '',
      '## 相关文档',
      ...relevantDocs.map(d => `- [[${d.title}]]`),
    ].join('\n');

    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /** Save answer to wiki */
  async saveToWiki(question: string, answer: string, relevantDocs: string[]): Promise<string> {
    const title = question;
    const content = [
      `# ${title}`,
      '',
      answer,
      '',
      '## 相关文档',
      ...relevantDocs.map(doc => `- [[${doc.replace('.md', '')}]]`),
    ].join('\n');

    const metadata = {
      source: 'query-generated',
      derived_from: relevantDocs,
      original_question: question,
      type: 'note',
    };

    return this.wikiManager.saveDocument(title, content, metadata);
  }

  /** Get topic recommendations */
  async getTopicRecommendations(question: string, answer: string): Promise<string[]> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `你是一个话题推荐助手，基于用户的问题和答案，生成5个相关的话题推荐。\n\n推荐标准：\n1. 与原问题相关\n2. 能够扩展知识\n3. 具有探索价值\n4. 语言简洁明了\n\n输出格式：\n["话题1", "话题2", "话题3", "话题4", "话题5"]`,
      },
      {
        role: 'user',
        content: `问题: ${question}\n\n答案: ${answer}`,
      },
    ];

    try {
      const response = await this.llmClient.chat(messages, {
        temperature: 0.7,
        maxTokens: 200,
      });

      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Get knowledge gaps */
  async getKnowledgeGaps(): Promise<string[]> {
    const docs = await this.wikiManager.listDocuments();
    const allLinks = new Set<string>();
    const existingDocs = new Set<string>(docs.map(d => d.title.toLowerCase()));

    // Collect all links from wiki documents
    for (const doc of docs) {
      for (const link of doc.links) {
        allLinks.add(link.toLowerCase());
      }
    }

    // Identify missing links
    const knowledgeGaps: string[] = [];
    for (const link of allLinks) {
      if (!existingDocs.has(link)) {
        knowledgeGaps.push(link);
      }
    }

    return knowledgeGaps.slice(0, 10); // Limit to top 10 gaps
  }
}