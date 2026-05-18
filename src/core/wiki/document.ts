import path from 'path';
import matter from 'gray-matter';
import { WikiFrontMatter, WikiDocumentType, WikiDocumentStatus, SourceType, Reliability } from '@/types';

const DEFAULT_FRONT_MATTER: WikiFrontMatter = {
  title: '',
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  type: 'note',
  status: 'Compiled',
  source_type: 'other',
  source_origin: '',
  reliability: 3,
  compiler: 'manual',
  compiler_version: '',
  compiled_at: new Date().toISOString(),
  lint_count: 0,
  last_linted_at: '',
  aliases: [],
  tags: [],
  entities: [],
};

export class WikiDocument {
  public filePath: string;
  public title: string;
  public tags: string[];
  public aliases: string[];
  public entities: string[];
  public created: string;
  public modified: string;
  public links: string[];
  public backlinks: string[];
  public body: string;
  public metadata: WikiFrontMatter;

  constructor(filePath: string, content: string = '') {
    this.filePath = filePath;
    console.log('[WikiDocument] constructor, content starts with:', content.substring(0, 100));

    let body = content;
    let mergedData: Record<string, any> = {};

    if (content.startsWith('---')) {
      const frontmatterPattern = /^---\s*([\s\S]*?)\s*---/gm;
      let match;
      let lastIndex = 0;

      while ((match = frontmatterPattern.exec(content)) !== null) {
        try {
          const parsed = matter(`---\n${match[1]}\n---`);
          console.log('[WikiDocument] parsed frontmatter keys:', Object.keys(parsed.data));
          mergedData = { ...mergedData, ...parsed.data };
        } catch (e) {
          console.log('[WikiDocument] failed to parse frontmatter section');
        }
        lastIndex = frontmatterPattern.lastIndex;
      }

      body = content.substring(lastIndex).trim();
      if (!body.startsWith('#')) {
        const titleMatch = body.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          body = body.slice(body.indexOf(titleMatch[0])).trim();
        }
      }
      console.log('[WikiDocument] body after extraction:', body.substring(0, 100));
    } else {
      console.log('[WikiDocument] no frontmatter detected, using matter.parse');
      const { data, content: bodyWithoutFm } = matter(content);
      mergedData = data;
      body = bodyWithoutFm;
    }

    const fm = this._buildFrontMatter(mergedData);
    this.title = fm.title || path.basename(filePath, '.md');
    this.tags = fm.tags || [];
    this.aliases = fm.aliases || [];
    this.entities = fm.entities || [];
    this.created = fm.created;
    this.modified = fm.modified;
    this.links = this._extractLinks(body);
    this.backlinks = [];
    this.body = body;
    this.metadata = fm;
  }

  private _buildFrontMatter(data: Record<string, any>): WikiFrontMatter {
    return {
      title: data.title || path.basename(this.filePath, '.md'),
      created: data.created || new Date().toISOString(),
      modified: data.modified || new Date().toISOString(),
      type: (data.type as WikiDocumentType) || 'note',
      status: (data.status as WikiDocumentStatus) || 'Compiled',
      source_type: (data.source_type as SourceType) || 'other',
      source_origin: data.source_origin || '',
      source_url: data.source_url,
      reliability: (data.reliability as Reliability) || 3,
      compiler: data.compiler || 'manual',
      compiler_version: data.compiler_version || '',
      compiled_at: data.compiled_at || new Date().toISOString(),
      lint_count: typeof data.lint_count === 'number' ? data.lint_count : 0,
      last_linted_at: data.last_linted_at || '',
      aliases: Array.isArray(data.aliases) ? data.aliases : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      entities: Array.isArray(data.entities) ? data.entities : [],
    };
  }

  private _extractLinks(markdown: string): string[] {
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

    const formatArray = (arr: string[]): string => {
      if (!arr || arr.length === 0) return '';
      return arr.map(v => `  - "${v}"`).join('\n');
    };

    const lines: string[] = [
      '---',
      `title: "${this.metadata.title}"`,
      `created: ${formatDate(this.metadata.created)}`,
      `modified: ${formatDate(this.metadata.modified)}`,
      `type: "${this.metadata.type}"`,
      `status: "${this.metadata.status}"`,
      '',
      `source_type: "${this.metadata.source_type}"`,
      `source_origin: "${this.metadata.source_origin}"`,
    ];

    if (this.metadata.source_url) {
      lines.push(`source_url: "${this.metadata.source_url}"`);
    }
    lines.push(`reliability: ${this.metadata.reliability}`);

    lines.push('');

    if (this.metadata.compiler) {
      lines.push(`compiler: "${this.metadata.compiler}"`);
    }
    if (this.metadata.compiler_version) {
      lines.push(`compiler_version: "${this.metadata.compiler_version}"`);
    }

    lines.push('');
    lines.push(`compiled_at: ${formatDate(this.metadata.compiled_at)}`);
    lines.push(`lint_count: ${this.metadata.lint_count}`);
    lines.push(`last_linted_at: ${this.metadata.last_linted_at ? formatDate(this.metadata.last_linted_at) : ''}`);

    lines.push('');
    lines.push(`aliases:`);
    lines.push(formatArray(this.metadata.aliases));

    lines.push(`tags:`);
    lines.push(formatArray(this.metadata.tags));

    lines.push(`entities:`);
    lines.push(formatArray(this.metadata.entities));

    lines.push('---', '');

    return lines.join('\n') + this.body;
  }

  updateMetadata(metadata: Partial<WikiFrontMatter>): void {
    this.metadata = { ...this.metadata, ...metadata };
    this.title = this.metadata.title || this.title;
    this.tags = this.metadata.tags || this.tags;
    this.aliases = this.metadata.aliases || this.aliases;
    this.entities = this.metadata.entities || this.entities;
    this.modified = new Date().toISOString();
    this.metadata.modified = this.modified;
  }
}
