import path from 'path';
import matter from 'gray-matter';
import { WikiDocumentMetadata } from '@/types';

export class WikiDocument {
  public filePath: string;
  public title: string;
  public tags: string[];
  public aliases: string[];
  public created: string;
  public modified: string;
  public links: string[];
  public backlinks: string[];
  public body: string;
  public metadata: WikiDocumentMetadata;

  constructor(filePath: string, content: string = '') {
    this.filePath = filePath;
    console.log('[WikiDocument] constructor, content starts with:', content.substring(0, 100));

    let body = content;
    if (content.includes('---') && content.indexOf('---') < 10) {
      const parts = content.split(/^---/m);
      console.log('[WikiDocument] frontmatter block, parts.length:', parts.length);
      if (parts.length >= 3) {
        console.log('[WikiDocument] processing frontmatter block');
        const yamlContent = parts[1].trim();
        let bodyStart = parts.slice(2).join('---').trim();
        if (bodyStart.startsWith('#')) {
          body = bodyStart;
        } else {
          const titleMatch = bodyStart.match(/^#\s+(.+)$/m);
          body = bodyStart;
          if (titleMatch) {
            body = bodyStart.slice(bodyStart.indexOf(titleMatch[0])).trim();
          }
        }
        console.log('[WikiDocument] body after extraction:', body.substring(0, 100));
        const parsed = matter.parse(`---\n${yamlContent}\n---`);
        Object.assign(this, {
          title: parsed.data.title || path.basename(filePath, '.md'),
          tags: parsed.data.tags || [],
          aliases: parsed.data.aliases || [],
          created: parsed.data.created || new Date().toISOString(),
          modified: parsed.data.modified || new Date().toISOString(),
          metadata: {
            title: parsed.data.title || path.basename(filePath, '.md'),
            type: parsed.data.type || 'note',
            tags: parsed.data.tags || [],
            created: parsed.data.created || new Date().toISOString(),
            modified: parsed.data.modified || new Date().toISOString(),
            source: parsed.data.source || 'manual',
            linked: parsed.data.linked || [],
            ...parsed.data,
          },
        });
        this.links = this._extractLinks(body);
        this.backlinks = [];
        this.body = body;
        return;
      }
    }

    console.log('[WikiDocument] no frontmatter detected, using matter.parse');
    const { data, content: bodyWithoutFm } = matter(content);
    body = bodyWithoutFm;

    this.title = data.title || path.basename(filePath, '.md');
    this.tags = data.tags || [];
    this.aliases = data.aliases || [];
    this.created = data.created || new Date().toISOString();
    this.modified = data.modified || new Date().toISOString();
    this.links = this._extractLinks(body);
    this.backlinks = [];
    this.body = body;

    this.metadata = {
      title: this.title,
      type: data.type || 'note',
      tags: this.tags,
      created: this.created,
      modified: this.modified,
      source: data.source || 'manual',
      linked: data.linked || [],
      ...data,
    };
  }

  private _extractLinks(markdown: string): string[] {
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

  toMarkdown(): string {
    const formatDate = (isoString: string) => {
      const date = new Date(isoString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '-');
    };

    const frontmatter = [
      '---',
      `title: "${this.title}"`,
      `created: ${formatDate(this.created)}`,
      `modified: ${formatDate(new Date().toISOString())}`,
      this.tags.length ? `tags: [${this.tags.map(t => `"${t}"`).join(', ')}]` : '',
      this.aliases.length ? `aliases: [${this.aliases.map(a => `"${a}"`).join(', ')}]` : '',
      `source: ${this.metadata.source || 'manual'}`,
      this.metadata.type ? `type: ${this.metadata.type}` : '',
      this.metadata.linked && this.metadata.linked.length ? `linked: [${this.metadata.linked.map(l => `"${l}"`).join(', ')}]` : '',
      '---',
      '',
    ].filter(Boolean).join('\n');

    return frontmatter + this.body;
  }

  updateMetadata(metadata: Partial<WikiDocumentMetadata>): void {
    this.metadata = { ...this.metadata, ...metadata };
    this.title = this.metadata.title || this.title;
    this.tags = this.metadata.tags || this.tags;
    this.modified = new Date().toISOString();
  }
}