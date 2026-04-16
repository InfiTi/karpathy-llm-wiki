import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { LLMClient } from '@/core/llm';
import { WikiManager } from '@/core/wiki';
import { ProjectConfig, IngestResult } from '@/types';

export class IngestPipeline {
  private llmClient: LLMClient;
  private wikiManager: WikiManager;
  private rawDir: string;

  constructor(config: ProjectConfig) {
    this.llmClient = new LLMClient(config);
    this.wikiManager = new WikiManager(config.projectRoot);
    this.rawDir = path.join(config.projectRoot, 'raw');
  }

  /** Initialize ingest pipeline */
  async initialize(): Promise<void> {
    await this.wikiManager.initialize();
  }

  /** Run ingest process for a file or URL */
  async runIngest(source: string, isUrl: boolean = false): Promise<IngestResult> {
    try {
      let content: string;
      let fileName: string;

      if (isUrl) {
        // Fetch content from URL
        const response = await axios.get(source);
        content = response.data;
        fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}_url.md`;
      } else {
        // Read content from file
        content = await fs.readFile(source, 'utf-8');
        fileName = path.basename(source);
      }

      // Save raw content
      const rawPath = path.join(this.rawDir, fileName);
      await fs.writeFile(rawPath, content, 'utf-8');

      // Process content
      const processedContent = await this.processContent(content);

      // Generate wiki page
      const wikiPath = await this.generateWikiPage(processedContent, fileName);

      // Update index page
      await this.updateIndexPage();

      return {
        success: true,
        filePath: wikiPath,
      };
    } catch (error) {
      console.error('Ingest error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /** Process content using LLM */
  async processContent(content: string): Promise<string> {
    return this.llmClient.ingest(content);
  }

  /** Generate wiki page from processed content */
  async generateWikiPage(content: string, sourceFileName: string): Promise<string> {
    // Extract title from content
    const titleMatch = content.match(/^#\s+(.*)$/m);
    const title = titleMatch ? titleMatch[1] : path.basename(sourceFileName, path.extname(sourceFileName));

    // Save to wiki
    return this.wikiManager.saveDocument(title, content, {
      source: 'ingest-generated',
      type: 'note',
    });
  }

  /** Update index page */
  async updateIndexPage(): Promise<void> {
    const docs = await this.wikiManager.listDocuments();

    const indexContent = [
      '---',
      'title: "索引"',
      'created: ' + new Date().toISOString(),
      'modified: ' + new Date().toISOString(),
      'source: system-generated',
      'type: index',
      '---',
      '',
      '# 知识库索引',
      '',
      '## 所有文档',
      '',
      ...docs.map(doc => `- [[${doc.title}]]`),
      '',
      '## 按标签分类',
      '',
    ];

    // Group docs by tags
    const tagsMap = new Map<string, string[]>();
    for (const doc of docs) {
      for (const tag of doc.tags) {
        if (!tagsMap.has(tag)) {
          tagsMap.set(tag, []);
        }
        tagsMap.get(tag)!.push(doc.title);
      }
    }

    // Add tags to index
    for (const [tag, taggedDocs] of tagsMap) {
      indexContent.push(`### ${tag}`);
      for (const docTitle of taggedDocs) {
        indexContent.push(`- [[${docTitle}]]`);
      }
      indexContent.push('');
    }

    await this.wikiManager.saveDocument('索引', indexContent.join('\n'), {
      source: 'system-generated',
      type: 'index',
    });
  }

  /** Find related documents */
  async findRelated(content: string): Promise<{
    fileName: string;
    title: string;
    relevance: number;
  }[]> {
    const docs = await this.wikiManager.listDocuments();
    const relatedDocs: {
      fileName: string;
      title: string;
      relevance: number;
    }[] = [];

    // Simple relevance calculation based on content similarity
    for (const doc of docs) {
      const docContent = await fs.readFile(doc.filePath, 'utf-8');
      const relevance = this.calculateRelevance(content, docContent);

      if (relevance > 0.1) {
        relatedDocs.push({
          fileName: doc.fileName,
          title: doc.title,
          relevance,
        });
      }
    }

    // Sort by relevance
    relatedDocs.sort((a, b) => b.relevance - a.relevance);
    return relatedDocs.slice(0, 3); // Return top 3 related docs
  }

  /** Calculate relevance between two texts */
  private calculateRelevance(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().match(/\w+/g) || []);
    const words2 = new Set(text2.toLowerCase().match(/\w+/g) || []);

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}