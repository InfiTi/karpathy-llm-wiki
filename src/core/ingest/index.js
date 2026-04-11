/**
 * Ingest Core - Process raw documents into wiki entries
 */

import { WikiManager } from '../wiki/index.js';
import { LLMClient } from '../llm/client.js';

export class IngestPipeline {
  constructor(config) {
    this.wiki = new WikiManager(config.projectRoot);
    this.llm = new LLMClient(config);
    this.supportedExtensions = ['.txt', '.md', '.pdf', '.docx', '.html', '.csv', '.json'];
  }

  async initialize() {
    await this.wiki.initialize();
  }

  /** Check if file type is supported */
  isSupported(filePath) {
    return this.supportedExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
  }

  /** Process a single file */
  async processFile(filePath, onProgress) {
    if (!this.isSupported(filePath)) {
      throw new Error(`Unsupported file type: ${filePath}`);
    }

    onProgress?.('reading', filePath);
    const content = await this._extractContent(filePath);

    onProgress?.('processing', filePath);
    const title = this._extractTitle(filePath, content);
    
    const messages = [
      { role: 'system', content: LLMClient.wikiSystemPrompt('ingest') },
      { role: 'user', content: `请处理以下文档，生成结构化的维基条目：\n\n=== 文档标题 ===\n${title}\n\n=== 文档内容 ===\n${content.slice(0, 8000)}` }
    ];

    onProgress?.('llm', filePath);
    const wikiContent = await this.llm.chat(messages, { temperature: 0.3, maxTokens: 4096 });

    onProgress?.('saving', filePath);
    const savedPath = await this.wiki.saveDocument(title, wikiContent);

    return { title, wikiContent, savedPath };
  }

  /** Batch process multiple files */
  async processBatch(filePaths, onProgress) {
    const results = [];
    const total = filePaths.length;
    for (let i = 0; i < filePaths.length; i++) {
      try {
        const result = await this.processFile(filePaths[i], (stage, fp) => {
          onProgress?.(i + 1, total, stage, fp);
        });
        results.push({ success: true, ...result });
      } catch (err) {
        results.push({ success: false, filePath: filePaths[i], error: err.message });
      }
    }
    return results;
  }

  /** Extract text content from file */
  async _extractContent(filePath) {
    const fs = await import('fs-extra');
    const path = await import('path');
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.txt' || ext === '.md' || ext === '.csv') {
      return await fs.readFile(filePath, 'utf-8');
    }
    
    if (ext === '.json') {
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }
    
    if (ext === '.html') {
      const html = await fs.readFile(filePath, 'utf-8');
      // Simple HTML → text strip
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // For other types, return raw text
    return await fs.readFile(filePath, 'utf-8').catch(() => '[无法读取文件内容]');
  }

  /** Extract title from file path or content */
  _extractTitle(filePath, content) {
    const path = require('path');
    const name = path.basename(filePath, path.extname(filePath));
    
    // Try front-matter title
    const fmMatch = content.match(/^#\s+(.+)$/m);
    if (fmMatch) return fmMatch[1].trim();
    
    // Try first line
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length > 0 && firstLine.length < 100) return firstLine;
    
    return name;
  }
}
