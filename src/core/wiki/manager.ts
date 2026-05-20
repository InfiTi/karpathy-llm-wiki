import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import { WikiDocument } from './document';

export class WikiManager {
  private rawDir: string;
  private wikiDir: string;

  constructor(projectRoot: string) {
    this.rawDir = path.join(projectRoot, 'raw');
    this.wikiDir = path.join(projectRoot, 'wiki');
  }

  /** Initialize wiki directories */
  async initialize(): Promise<void> {
    await fs.ensureDir(this.rawDir);
    await fs.ensureDir(this.wikiDir);
    await fs.ensureDir(path.join(this.wikiDir, '.index'));
  }

  /** List all wiki documents */
  async listDocuments(): Promise<{
    title: string;
    filePath: string;
    fileName: string;
    tags: string[];
    aliases: string[];
    links: string[];
    size: number;
    modified: Date;
    created: string;
    content: string;
  }[]> {
    const files = await fs.readdir(this.wikiDir);
    const mdFiles = files.filter((f: string) => f.endsWith('.md'));
    const docs: {
      title: string;
      filePath: string;
      fileName: string;
      tags: string[];
      aliases: string[];
      links: string[];
      size: number;
      modified: Date;
      created: string;
      content: string;
    }[] = [];

    for (const file of mdFiles) {
      const filePath = path.join(this.wikiDir, file);
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      const doc = new WikiDocument(filePath, content);

      docs.push({
        title: doc.title,
        filePath,
        fileName: file,
        tags: doc.tags,
        aliases: doc.aliases,
        links: doc.links,
        size: stat.size,
        modified: stat.mtime,
        created: doc.created,
        content: doc.body,
      });
    }

    return docs;
  }

  /** Create or update a wiki document */
  async saveDocument(title: string, body: string, metadata: Partial<WikiDocument['metadata']> = {}): Promise<string> {
    const baseName = this.slugify(title);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
    const fileName = `${baseName}_${timestamp}.md`;
    const filePath = path.join(this.wikiDir, fileName);

    let doc: WikiDocument;
    let mergedMetadata = { ...metadata };

    let cleanedBody = body
      .replace(/<think[\s\S]*?<\/think[\s>]*\s*/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    try {
      const parsed = matter(cleanedBody);
      if (parsed.data && Object.keys(parsed.data).length > 0) {
        mergedMetadata = { ...parsed.data, ...metadata };
        cleanedBody = parsed.content.trim();
      }
    } catch (e) {
      // skip
    }

    const bodyMetadata = this._extractBodyMetadata(cleanedBody);
    cleanedBody = this._stripYamlCodeBlocks(cleanedBody);

    if (bodyMetadata.tags.length > 0 && !(mergedMetadata.tags as string[])?.length) {
      mergedMetadata.tags = bodyMetadata.tags;
    }
    if (bodyMetadata.aliases.length > 0 && !(mergedMetadata.aliases as string[])?.length) {
      mergedMetadata.aliases = bodyMetadata.aliases;
    }

    if (await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, 'utf-8');
      doc = new WikiDocument(filePath, content);
      doc.body = cleanedBody;
      doc.updateMetadata(mergedMetadata);
    } else {
      doc = new WikiDocument(filePath);
      doc.title = title;
      doc.body = cleanedBody;
      doc.updateMetadata(mergedMetadata);
    }

    await fs.writeFile(filePath, doc.toMarkdown(), 'utf-8');
    return filePath;
  }

  /** Extract tags/aliases from yaml code blocks in body */
  private _extractBodyMetadata(body: string): { tags: string[]; aliases: string[] } {
    const result = { tags: [] as string[], aliases: [] as string[] };
    const lines = body.split('\n');
    let inYamlBlock = false;
    let yamlContent: string[] = [];

    for (const line of lines) {
      if (line.trim() === '```yaml') {
        inYamlBlock = true;
        continue;
      }
      if (inYamlBlock && line.trim() === '```') {
        break;
      }
      if (inYamlBlock) {
        yamlContent.push(line);
      }
    }

    if (yamlContent.length === 0) return result;

    let currentKey: string | null = null;
    for (const line of yamlContent) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '---') continue;

      const keyMatch = trimmed.match(/^(\w+):$/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        continue;
      }

      if (currentKey === 'tags' || currentKey === 'aliases') {
        const itemMatch = trimmed.match(/^-\s*(.+)$/);
        if (itemMatch && !itemMatch[1].startsWith('[')) {
          const value = itemMatch[1].replace(/"/g, '').trim();
          if (value) {
            result[currentKey].push(value);
          }
        }
      }
    }

    return result;
  }

  /** Strip yaml code blocks (and preceding ## Metadata header) from body */
  private _stripYamlCodeBlocks(body: string): string {
    const lines = body.split('\n');
    const cleaned: string[] = [];
    let inYamlBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '```yaml') {
        inYamlBlock = true;
        if (cleaned.length > 0 && cleaned[cleaned.length - 1].trim().startsWith('## Metadata')) {
          cleaned.pop();
        }
        continue;
      }
      if (inYamlBlock && (line.trim() === '```' || line.trim() === '---')) {
        inYamlBlock = false;
        continue;
      }
      if (!inYamlBlock) {
        // 移除任何多余的 ``` 结束标记
        if (line.trim() === '```') {
          continue;
        }
        cleaned.push(line);
      }
    }

    return cleaned.join('\n').trim();
  }

  /** Convert title to lowercase-hyphen slug */
  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[\[\]]/g, '')
      .replace(/[\s\/\\:#*?"<>|]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  /** Delete a wiki document */
  async deleteDocument(filePath: string): Promise<void> {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }
  }

  /** Get document by title or filename */
  async getDocument(titleOrFileName: string): Promise<WikiDocument | null> {
    const fileName = titleOrFileName.endsWith('.md') ? titleOrFileName : titleOrFileName + '.md';
    const filePath = path.join(this.wikiDir, fileName);

    if (!await fs.pathExists(filePath)) {
      return null;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return new WikiDocument(filePath, content);
  }

  /** Search documents by title, tags, and content with relevance scoring */
  async searchDocuments(query: string): Promise<{
    title: string;
    filePath: string;
    fileName: string;
    tags: string[];
    aliases: string[];
    links: string[];
    size: number;
    modified: Date;
    created: string;
    content: string;
    score: number;
  }[]> {
    const docs = await this.listDocuments();
    const keywords = this.extractKeywords(query);

    const scoredDocs = docs
      .map(d => {
        let score = 0;
        const stem = d.fileName.toLowerCase();
        const titleLower = d.title.toLowerCase();
        const contentLower = d.content?.toLowerCase() || '';

        for (const kw of keywords) {
          const kwLower = kw.toLowerCase();
          // 文件名匹配得5分
          if (stem.includes(kwLower)) {
            score += 5;
          }
          // 标题匹配得5分
          if (titleLower.includes(kwLower)) {
            score += 5;
          }
          // 内容匹配得1分
          if (contentLower.includes(kwLower)) {
            score += 1;
          }
          // 标签匹配得2分
          if (d.tags.some(t => t.toLowerCase().includes(kwLower))) {
            score += 2;
          }
        }

        return { ...d, score };
      })
      .filter(d => d.score > 0)
      .sort((a, b) => b.score - a.score);

    return scoredDocs.slice(0, 8);
  }

  /** Extract keywords from query text */
  private extractKeywords(text: string): string[] {
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

  /** Build knowledge graph from wiki documents */
  async buildKnowledgeGraph(): Promise<{
    nodes: { id: string; label: string; tags: string[] }[];
    links: { source: string; target: string }[];
  }> {
    const docs = await this.listDocuments();
    const nodes: { id: string; label: string; tags: string[] }[] = [];
    const links: { source: string; target: string }[] = [];

    // Create nodes
    for (const doc of docs) {
      nodes.push({
        id: doc.fileName,
        label: doc.title,
        tags: doc.tags,
      });
    }

    // Create links
    for (const doc of docs) {
      for (const link of doc.links) {
        const linkedDoc = docs.find(d =>
          d.title.toLowerCase() === link.toLowerCase() ||
          d.fileName.toLowerCase() === (link + '.md').toLowerCase()
        );

        if (linkedDoc) {
          links.push({
            source: doc.fileName,
            target: linkedDoc.fileName,
          });
        }
      }
    }

    return { nodes, links };
  }

  /** Get raw directory path */
  getRawDir(): string {
    return this.rawDir;
  }

  /** Get wiki directory path */
  getWikiDir(): string {
    return this.wikiDir;
  }
}