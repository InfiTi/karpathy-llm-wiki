/**
 * Wiki Core - File-based wiki operations with Obsidian support
 */

import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';

/** Wiki document metadata */
export class WikiDocument {
  constructor(filePath, content = '') {
    this.filePath = filePath;
    const { data, content: body } = matter(content);
    this.title = data.title || path.basename(filePath, '.md');
    this.tags = data.tags || [];
    this.aliases = data.aliases || [];
    this.created = data.created || new Date().toISOString();
    this.modified = data.modified || new Date().toISOString();
    this.links = this._extractLinks(body);
    this.backlinks = [];
    this.body = body;
  }

  _extractLinks(markdown) {
    // Extract [[wiki links]] and [markdown links](url)
    const wikiLinks = (markdown.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) || [])
      .map(l => l.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/, '$1'));
    const mdLinks = (markdown.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [])
      .map(l => {
        const m = l.match(/\[([^\]]+)\]\(([^)]+)\)/);
        return m ? m[2] : '';
      })
      .filter(l => !l.startsWith('http'));
    return [...new Set([...wikiLinks, ...mdLinks])];
  }

  toMarkdown() {
    const frontmatter = [
      '---',
      `title: "${this.title}"`,
      `created: ${this.created}`,
      `modified: ${new Date().toISOString()}`,
      this.tags.length ? `tags: [${this.tags.map(t => `"${t}"`).join(', ')}]` : '',
      this.aliases.length ? `aliases: [${this.aliases.map(a => `"${a}"`).join(', ')}]` : '',
      '---',
      ''
    ].filter(Boolean).join('\n');
    return frontmatter + this.body;
  }
}

/** Wiki manager - handles file operations */
export class WikiManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.rawDir = path.join(projectRoot, 'raw_sources');
    this.wikiDir = path.join(projectRoot, 'wiki');
  }

  async initialize() {
    await fs.ensureDir(this.rawDir);
    await fs.ensureDir(this.wikiDir);
    await fs.ensureDir(path.join(this.wikiDir, '.index'));
  }

  /** List all wiki documents */
  async listDocuments() {
    const files = await fs.readdir(this.wikiDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    const docs = [];
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
        created: doc.created
      });
    }
    return docs;
  }

  /** Create or update a wiki document */
  async saveDocument(title, body, metadata = {}) {
    const fileName = title.replace(/[\\/:*?"<>|]/g, '-') + '.md';
    const filePath = path.join(this.wikiDir, fileName);
    const doc = new WikiDocument(filePath);
    doc.title = title;
    doc.body = body;
    doc.tags = metadata.tags || doc.tags;
    doc.modified = new Date().toISOString();
    if (metadata.created) doc.created = metadata.created;
    await fs.writeFile(filePath, doc.toMarkdown(), 'utf-8');
    return filePath;
  }

  /** Delete a wiki document */
  async deleteDocument(filePath) {
    await fs.remove(filePath);
  }

  /** Get document by title or filename */
  async getDocument(titleOrFileName) {
    const fileName = titleOrFileName.endsWith('.md') ? titleOrFileName : titleOrFileName + '.md';
    const filePath = path.join(this.wikiDir, fileName);
    if (!await fs.pathExists(filePath)) return null;
    const content = await fs.readFile(filePath, 'utf-8');
    return new WikiDocument(filePath, content);
  }

  /** Search documents by title and tags */
  async searchDocuments(query) {
    const docs = await this.listDocuments();
    const q = query.toLowerCase();
    return docs.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.tags.some(t => t.toLowerCase().includes(q)) ||
      d.aliases.some(a => a.toLowerCase().includes(q))
    );
  }
}
