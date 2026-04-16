import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
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

    try {
      const response = await axios.get(url, { headers, timeout: 20000, responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);

      // Detect encoding and decode HTML
      const html = this.decodeHtml(buffer);

      // Parse HTML to extract title and content
      let result = this.extractTextFromHtml(html, url);

      // If content is too short or looks garbled, use fallback
      if (!result.text || result.text.length < 100) {
        return this.createFallbackContent(url, result.title);
      }

      // Check for WeChat specifically
      if (url.includes('mp.weixin.qq.com')) {
        // Additional check: if content has too many unusual characters, use fallback
        const unusualCharRatio = (result.text.length - result.text.replace(/[\u4e00-\u9fa5，。！？；：""''（）【】\s]/g, '').length) / result.text.length;
        if (unusualCharRatio < 0.3) {
          return this.createFallbackContent(url, result.title);
        }
      }

      return result;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`网页访问失败 (${error.response.status}): ${url}`);
      }
      throw error;
    }
  }

  /** Decode HTML buffer with proper encoding detection */
  private decodeHtml(buffer: Buffer): string {
    // Try UTF-8 first
    let html = buffer.toString('utf-8');

    // Check if content looks garbled by looking for common Chinese words
    const hasCommonWords = (text: string): boolean => {
      const commonWords = ['我们', '公司', '家庭', '这个', '什么', '可以', '因为', '所以', '但是', '就是', '不是'];
      return commonWords.some(word => text.includes(word));
    };

    // If no common Chinese words in UTF-8, try GBK
    if (!hasCommonWords(html)) {
      try {
        const htmlGbk = iconv.decode(buffer, 'gbk');
        if (hasCommonWords(htmlGbk)) {
          html = htmlGbk;
        }
      } catch (e) {
        // GBK decode failed, keep UTF-8
      }
    }

    return html;
  }

  /** Create fallback content for sites that can't be scraped */
  private createFallbackContent(url: string, title?: string): { title: string; text: string } {
    const pageTitle = title || '网页内容';
    return {
      title: pageTitle,
      text: `[此内容来自: ${url}]\n\n原文链接: ${url}\n\n注意: 该网页内容无法自动提取。\n\n建议:\n1. 复制文章链接到浏览器打开\n2. 全选复制文章内容\n3. 以文本文件方式重新摄入`,
    };
  }

  /** Extract title and main content from HTML using cheerio */
  private extractTextFromHtml(html: string, baseUrl: string): { title: string; text: string } {
    const $ = cheerio.load(html);

    // Extract title
    let title = $('meta[property="og:title"]').attr('content') || '';
    if (!title) {
      title = $('h1').first().text().trim();
    }
    if (!title) {
      title = $('title').text().trim();
    }

    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, iframe, noscript, svg, [class*="comment"], [class*="sidebar"], [class*="advertisement"], [class*="ad-"]').remove();

    // Try to find main content area - common selectors for various sites
    let contentText = '';

    // For WeChat articles
    if (baseUrl.includes('mp.weixin.qq.com')) {
      contentText = this.extractWeChatContent($);
    }

    // For general websites, try common content containers
    if (!contentText || contentText.length < 100) {
      contentText = this.extractGeneralContent($);
    }

    return { title: this.decodeHtmlEntities(title), text: contentText.trim() };
  }

  /** Extract WeChat article content */
  private extractWeChatContent($: cheerio.CheerioAPI): string {
    // WeChat specific selectors
    const selectors = [
      '#js_content',
      '.article-content',
      '.rich_media_content',
      '[id="js_content"]',
      '.weui-article',
    ];

    for (const sel of selectors) {
      const el = $(sel);
      if (el.length) {
        const text = this.extractTextFromElement($, el);
        if (text.length > 100) {
          return text;
        }
      }
    }

    return '';
  }

  /** Extract content from general websites */
  private extractGeneralContent($: cheerio.CheerioAPI): string {
    const selectors = [
      'article',
      '[role="main"]',
      'main',
      '.content',
      '.article',
      '.post',
      '.entry-content',
      '.post-content',
      '.article-content',
      '.story-body',
    ];

    for (const sel of selectors) {
      const el = $(sel);
      if (el.length) {
        const text = this.extractTextFromElement($, el);
        if (text.length > 100) {
          return text;
        }
      }
    }

    // Fallback: get all paragraph text
    const paragraphs: string[] = [];
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) {
        paragraphs.push(text);
      }
    });

    return paragraphs.join('\n\n');
  }

  /** Extract text from a cheerio element */
  private extractTextFromElement($: cheerio.CheerioAPI, el: cheerio.CheerioElement): string {
    const texts: string[] = [];

    // Get direct text from element and its children
    const processNode = (node: cheerio.Node) => {
      if (node.type === 'text') {
        const text = (node as cheerio.TextNode).data.trim();
        if (text) texts.push(text);
      } else if (node.type === 'tag') {
        const tagName = (node as cheerio.Element).tagName.toLowerCase();
        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tagName)) {
          texts.push('\n');
        }
        const children = (node as cheerio.Element).children;
        if (children) {
          children.forEach(processNode);
        }
      }
    };

    const element = $(el);
    const children = element.contents();
    children.each((_, node) => processNode(node));

    return texts.join(' ').replace(/\n{3,}/g, '\n\n').trim();
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