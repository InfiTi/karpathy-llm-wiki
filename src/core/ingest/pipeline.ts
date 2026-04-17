import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { EventEmitter } from 'events';
import { chromium } from 'playwright';
import { LLMClient } from '@/core/llm';
import { WikiManager } from '@/core/wiki';
import { ProjectConfig, IngestResult } from '@/types';

export interface IngestProgress {
  stage: 'fetching' | 'processing' | 'writing' | 'complete';
  progress: number; // 0-100
  message: string;
  thinkingChars?: number;
  outputChars?: number;
}

export class IngestPipeline extends EventEmitter {
  private llmClient: LLMClient;
  private wikiManager: WikiManager;
  private rawDir: string;

  constructor(config: ProjectConfig) {
    super();
    console.log('[IngestPipeline] 初始化，projectRoot:', config.projectRoot);
    this.llmClient = new LLMClient(config);
    this.wikiManager = new WikiManager(config.projectRoot);
    this.rawDir = path.join(config.projectRoot, 'raw');
    console.log('[IngestPipeline] rawDir:', this.rawDir);
  }

  /** Initialize ingest pipeline */
  async initialize(): Promise<void> {
    await this.wikiManager.initialize();
  }

  /** Run ingest process for a file or URL */
  async runIngest(source: string, isUrl: boolean = false): Promise<IngestResult> {
    console.log('[IngestPipeline] 开始摄入任务');
    console.log('[IngestPipeline] 来源类型:', isUrl ? 'URL' : '文件');
    console.log('[IngestPipeline] 来源地址:', source);

    try {
      let content: string;
      let fileName: string;

      if (isUrl) {
        // Fetch content from URL
        console.log('[IngestPipeline] 阶段 1/4: 获取网页内容...');
        this.emit('progress', { stage: 'fetching', progress: 10, message: '正在获取网页内容...' });
        const result = await this.fetchWebContent(source);
        content = result.text;
        console.log('[IngestPipeline] 获取到内容长度:', content.length, '字符');

        // Check if content is valid
        if (this.isFallbackContent(content)) {
          console.log('[IngestPipeline] 内容无效或为空');
          return {
            success: false,
            error: '无法自动提取网页内容，内容无效或为空',
          };
        }

        fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}_url.md`;
        // Save raw content
        const rawPath = path.join(this.rawDir, fileName);
        console.log('[IngestPipeline] 保存原始内容到:', rawPath);
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
        console.log('[IngestPipeline] 阶段 1/4: 读取文件内容...');
        this.emit('progress', { stage: 'fetching', progress: 10, message: '正在读取文件...' });
        content = await fs.readFile(source, 'utf-8');
        console.log('[IngestPipeline] 文件内容长度:', content.length, '字符');

        // Check if content is valid
        if (!content || content.trim().length < 100) {
          console.log('[IngestPipeline] 文件内容为空或长度不足');
          return {
            success: false,
            error: '文件内容为空或长度不足',
          };
        }

        fileName = path.basename(source);
        // Save raw content
        const rawPath = path.join(this.rawDir, fileName);
        console.log('[IngestPipeline] 保存原始内容到:', rawPath);
        await fs.writeFile(rawPath, content, 'utf-8');
      }

      // Process content
      console.log('[IngestPipeline] 阶段 2/4: 处理内容 (LLM总结)...');
      this.emit('progress', { stage: 'processing', progress: 40, message: '正在使用 LLM 处理内容...' });
      const processedContent = await this.processContent(content);

      // Generate wiki page
      console.log('[IngestPipeline] 阶段 3/4: 生成Wiki页面...');
      this.emit('progress', { stage: 'writing', progress: 80, message: '正在保存到Wiki...' });
      const wikiPath = await this.generateWikiPage(processedContent, fileName);
      console.log('[IngestPipeline] Wiki页面保存路径:', wikiPath);

      console.log('[IngestPipeline] 阶段 4/4: 完成');
      this.emit('progress', { stage: 'complete', progress: 100, message: '摄入完成!' });

      return {
        success: true,
        filePath: wikiPath,
        rawPath: path.join(this.rawDir, fileName),
        title: processedContent.title,
      };
    } catch (error) {
      console.error('[IngestPipeline] 摄入失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /** Fetch web content and extract main text */
  private async fetchWebContent(url: string): Promise<{ title: string; text: string }> {
    // For WeChat articles, use Playwright
    if (url.includes('mp.weixin.qq.com')) {
      return this.fetchWithPlaywright(url);
    }

    // For other websites, use axios + cheerio
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

      return result;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`网页访问失败 (${error.response.status}): ${url}`);
      }
      throw error;
    }
  }

  /** Fetch content using Playwright for dynamic websites like WeChat */
  private async fetchWithPlaywright(url: string): Promise<{ title: string; text: string }> {
    let browser;
    try {
      // Launch browser in headless mode
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-autofill',
          '--disable-autofill-service',
          '--disable-features=Autofill'
        ]
      });
      const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      // Navigate to the page
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for dynamic content to load
      await page.waitForTimeout(2000);

      // Get page content
      const html = await page.content();

      // Extract title and content
      const result = this.extractTextFromHtml(html, url);

      // Check if content is valid
      if (!result.text || result.text.length < 100) {
        return this.createFallbackContent(url, result.title);
      }

      return result;
    } catch (error) {
      console.error('Playwright fetch error:', error);
      // Fallback to axios if Playwright fails
      return this.fetchWithAxios(url);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /** Fallback to axios for Playwright failures */
  private async fetchWithAxios(url: string): Promise<{ title: string; text: string }> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };

    try {
      const response = await axios.get(url, { headers, timeout: 20000, responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const html = this.decodeHtml(buffer);
      const result = this.extractTextFromHtml(html, url);

      if (!result.text || result.text.length < 100) {
        return this.createFallbackContent(url, result.title);
      }

      return result;
    } catch (error) {
      return this.createFallbackContent(url);
    }
  }

  /** Check if content is fallback content */
  private isFallbackContent(content: string): boolean {
    return content.includes('此内容来自:') ||
      content.includes('原文链接:') ||
      content.includes('该网页内容无法自动提取') ||
      content.trim().length < 100;
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

    // Remove unwanted elements (but not body or main content areas)
    // Only remove elements that are clearly ads or comments, not containers
    $('script, style, nav, header, footer, aside, iframe, noscript, svg').remove();
    // Remove specific ad and comment elements, but exclude content containers
    $('[class*="comment-list"], [class*="comment-item"], [class*="sidebar-content"], [class*="advertisement-box"], [class*="ad-container"]').remove();

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
        const text = this.extractTextFromElement($, el[0]);
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
        const text = this.extractTextFromElement($, el[0]);
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
  private extractTextFromElement($: cheerio.CheerioAPI, el: any): string {
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
        // 处理子节点
        if (node.children && node.children.length > 0) {
          for (let i = 0; i < node.children.length; i++) {
            processNode(node.children[i]);
          }
        }
      }
    };

    // el 可以是 cheerio 对象或 DOM 元素
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

  /** Process content using LLM with streaming for progress */
  async processContent(content: string): Promise<string> {
    const messages: { role: 'system' | 'user'; content: string }[] = [
      {
        role: 'system',
        content: LLMClient.wikiSystemPrompt('ingest'),
      },
      {
        role: 'user',
        content: content,
      },
    ];

    let fullContent = '';
    let thinkingChars = 0;

    await this.llmClient.streamChat(messages, {
      onThinking: (thinking) => {
        if (thinking.length > 0) {
          const newThinkingChars = thinking.length;
          if (newThinkingChars !== thinkingChars) {
            thinkingChars = newThinkingChars;
            this.emit('progress', {
              stage: 'processing',
              progress: 50, // We're in the middle of processing
              message: `思考中... ${thinkingChars} 字符`,
              thinkingChars,
              outputChars: 0,
            } as IngestProgress);
          }
        } else {
          // Thinking ended
          this.emit('progress', {
            stage: 'processing',
            progress: 60,
            message: '思考完成，开始生成内容...',
            thinkingChars: 0,
            outputChars: 0,
          } as IngestProgress);
        }
      },
      onContent: (delta) => {
        fullContent += delta;
        this.emit('progress', {
          stage: 'processing',
          progress: 60 + (fullContent.length / 100),
          message: `生成内容中... ${fullContent.length} 字符`,
          thinkingChars: 0,
          outputChars: fullContent.length,
        } as IngestProgress);
      },
      onComplete: (content) => {
        this.emit('progress', {
          stage: 'writing',
          progress: 90,
          message: '写入维基页面...',
          thinkingChars: 0,
          outputChars: content.length,
        } as IngestProgress);
      },
      onError: (error) => {
        console.error('LLM streaming error:', error);
      },
    });

    return fullContent;
  }

  /** Generate wiki page from processed content */
  async generateWikiPage(content: string, sourceFileName: string): Promise<string> {
    const titleMatch = content.match(/^#\s+(.*)$/m);
    const extractedTitle = titleMatch ? titleMatch[1].trim() : path.basename(sourceFileName, path.extname(sourceFileName));

    const title = extractedTitle;

    return this.wikiManager.saveDocument(title, content, {
      source: 'ingest-generated',
      type: 'note',
    });
  }

  /** Update index page - only called when explicitly requested */
  async updateIndexPage(): Promise<void> {
    // Don't auto-generate index page - only create when user explicitly asks
    // This prevents spurious index.md files from being created
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