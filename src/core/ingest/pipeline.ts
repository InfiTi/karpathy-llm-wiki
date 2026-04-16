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
        const result = await this.fetchWebContent(source);
        content = result.text;
        fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}_url.md`;
        // Save raw content
        const rawPath = path.join(this.rawDir, fileName);
        const rawContent = [
          '---',
          `title: "${result.title}"`,
          `source_url: ${source}`,
          `created: ${new Date().toISOString()}`,
          '---',
          '',
          `# ${result.title}`,
          '',
          content,
        ].join('\n');
        await fs.writeFile(rawPath, rawContent, 'utf-8');
      } else {
        // Read content from file
        content = await fs.readFile(source, 'utf-8');
        fileName = path.basename(source);
        // Save raw content
        const rawPath = path.join(this.rawDir, fileName);
        await fs.writeFile(rawPath, content, 'utf-8');
      }

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

  /** Fetch web content and extract main text */
  private async fetchWebContent(url: string): Promise<{ title: string; text: string }> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    const response = await axios.get(url, { headers, timeout: 20000 });
    const html = response.data as string;

    // Parse HTML to extract title and content
    const { title, text } = this.extractTextFromHtml(html, url);

    if (!text || text.length < 50) {
      throw new Error(`无法提取网页正文: ${url}`);
    }

    return { title, text };
  }

  /** Extract title and main content from HTML */
  private extractTextFromHtml(html: string, baseUrl: string): { title: string; text: string } {
    // Extract title
    let title = '';
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i) ||
      html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:title"[^>]*>/i);
    if (titleMatch) {
      title = this.decodeHtmlEntities(titleMatch[1]);
    } else {
      const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
      if (h1Match) {
        title = this.decodeHtmlEntities(h1Match[1]);
      }
    }

    // Extract main content - remove scripts, styles, etc.
    let text = '';

    // Try to find main content area
    const contentPatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*main[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];

    let mainContent = '';
    for (const pattern of contentPatterns) {
      const match = html.match(pattern);
      if (match && match[1].length > mainContent.length) {
        mainContent = match[1];
      }
    }

    // If no specific content area found, use body
    if (!mainContent) {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      mainContent = bodyMatch ? bodyMatch[1] : html;
    }

    // Remove unwanted tags
    mainContent = mainContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract text from paragraphs
    const paragraphRegex = /<p[^>]*>([^<]*)<\/p>/gi;
    const paragraphs: string[] = [];
    let match;
    while ((match = paragraphRegex.exec(mainContent)) !== null) {
      const text = match[1].trim();
      if (text.length > 20) {
        paragraphs.push(text);
      }
    }

    // If no paragraphs found, extract all text
    if (paragraphs.length === 0) {
      text = mainContent
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      text = paragraphs.map(p => this.decodeHtmlEntities(p)).join('\n\n');
    }

    // Clean up text
    text = text
      .replace(/[\r\n]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { title, text };
  }

  /** Decode HTML entities */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
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