/**
 * Lint Core - Quality checking for wiki documents
 */

import { WikiManager } from '../wiki/index.js';
import { LLMClient } from '../llm/client.js';

export class LintEngine {
  constructor(config) {
    this.wiki = new WikiManager(config.projectRoot);
    this.llm = new LLMClient(config);
  }

  /** Lint a single document */
  async lintDocument(filePath) {
    const fs = await import('fs-extra');
    const content = await fs.readFile(filePath, 'utf-8');
    const doc = new (require('../wiki/index.js').WikiDocument)(filePath, content);

    const messages = [
      { role: 'system', content: LLMClient.wikiSystemPrompt('lint') },
      { role: 'user', content: `请检查以下维基文档的质量问题：\n\n=== 文档内容 ===\n${doc.body.slice(0, 6000)}` }
    ];

    const rawResult = await this.llm.chat(messages, { temperature: 0.2, maxTokens: 2048 });

    // Parse JSON response
    try {
      const result = JSON.parse(rawResult);
      return { ...result, filePath, title: doc.title };
    } catch {
      return {
        score: 50,
        issues: [{ type: 'parse_error', severity: 'medium', description: '无法解析LLM返回结果', suggestion: '检查LLM响应格式' }],
        summary: rawResult.slice(0, 200),
        filePath,
        title: doc.title
      };
    }
  }

  /** Lint all documents */
  async lintAll(onProgress) {
    const docs = await this.wiki.listDocuments();
    const results = [];
    for (let i = 0; i < docs.length; i++) {
      const result = await this.lintDocument(docs[i].filePath);
      results.push(result);
      onProgress?.(i + 1, docs.length, docs[i].title);
    }
    return results;
  }

  /** Quick quality checks without LLM */
  async quickCheck(filePath) {
    const fs = await import('fs-extra');
    const content = await fs.readFile(filePath, 'utf-8');
    const issues = [];

    // Check 1: Empty content
    if (content.trim().length < 50) {
      issues.push({ type: 'empty', severity: 'high', description: '文档内容过短', suggestion: '添加更多内容' });
    }

    // Check 2: Missing front-matter
    if (!content.startsWith('---')) {
      issues.push({ type: 'format', severity: 'low', description: '缺少 front-matter', suggestion: '添加 YAML front-matter' });
    }

    // Check 3: Broken wiki links
    const links = (content.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) || []);
    const docs = await this.wiki.listDocuments();
    const docTitles = docs.map(d => d.title);
    for (const link of links) {
      const title = link.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/, '$1');
      if (!docTitles.includes(title)) {
        issues.push({ type: 'broken_link', severity: 'medium', description: `孤立链接: [[${title}]]`, suggestion: '确认链接目标存在或创建对应文档' });
      }
    }

    return { issues, filePath };
  }
}
