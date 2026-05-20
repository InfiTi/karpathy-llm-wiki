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
  raw_file: '',
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

    let body = content;
    let mergedData: Record<string, any> = {};

    if (content.startsWith('---')) {
      const frontmatterPattern = /^---\s*([\s\S]*?)\s*---/gm;
      let match;
      let lastIndex = 0;

      while ((match = frontmatterPattern.exec(content)) !== null) {
        try {
          const parsed = matter(`---\n${match[1]}\n---`);
          mergedData = { ...mergedData, ...parsed.data };
        } catch (e) {
          // skip
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
    }

    const bodyMetadata = this._parseBodyMetadata(body);
    mergedData = { ...mergedData, ...bodyMetadata };

    const allLines = body.split('\n');
    const cleanedLines: string[] = [];
    let inYamlBlock = false;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];

      if (line.trim() === '```yaml') {
        inYamlBlock = true;
        if (i > 0 && allLines[i - 1].trim().startsWith('## Metadata')) {
          cleanedLines.pop();
        }
        continue;
      }

      if (inYamlBlock && (line.trim() === '```' || line.trim() === '---')) {
        inYamlBlock = false;
        continue;
      }

      if (!inYamlBlock) {
        cleanedLines.push(line);
      }
    }

    body = cleanedLines.join('\n').trim();

    if (bodyMetadata.tags && bodyMetadata.tags.length > 0) {
      mergedData.tags = bodyMetadata.tags;
    }
    if (bodyMetadata.aliases && bodyMetadata.aliases.length > 0) {
      mergedData.aliases = bodyMetadata.aliases;
    }

    if (!content.startsWith('---')) {
      mergedData.title = path.basename(filePath, '.md');
    }

    const fm = this._buildFrontMatter(mergedData);
    this.title = fm.title || path.basename(filePath, '.md');
    this.tags = fm.tags || [];
    this.aliases = fm.aliases || [];
    this.entities = fm.entities || this._extractEntities(body);
    this.created = fm.created;
    this.modified = fm.modified;
    this.links = this._extractLinks(body);
    this.backlinks = [];
    this.body = body;
    this.metadata = fm;
  }

  private _parseBodyMetadata(body: string): Record<string, any> {
    const metadata: Record<string, any> = { tags: [], aliases: [], entities: [] };

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

    if (yamlContent.length === 0) {
      return metadata;
    }

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
            metadata[currentKey].push(value);
          }
        }
      }
    }

    return metadata;
  }

  private _extractEntities(body: string): string[] {
    const wikiLinks = body.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g) || [];
    const entities = wikiLinks
      .map(l => l.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/, '$1'))
      .filter(e => !e.includes('/'));
    return [...new Set(entities)];
  }

  private _buildFrontMatter(data: Record<string, any>): WikiFrontMatter {
    return {
      title: data.title || path.basename(this.filePath, '.md'),
      created: data.created || new Date().toISOString(),
      modified: data.modified || new Date().toISOString(),
      type: (data.type as WikiDocumentType) || 'note',
      status: (data.status as WikiDocumentStatus) || 'Compiled',
      source_type: (data.source_type as SourceType) || 'other',
      raw_file: data.raw_file || '',
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

    const rawFileName = this.metadata.raw_file;
    const displayName = rawFileName.replace(/\.md$/, '');
    const lines: string[] = [
      '---',
      `title: "${this.metadata.title}"`,
      `created: ${formatDate(this.metadata.created)}`,
      `modified: ${formatDate(this.metadata.modified)}`,
      `type: "${this.metadata.type}"`,
      `status: "${this.metadata.status}"`,
      '',
      `source_type: "${this.metadata.source_type}"`,
      `raw_file: "[[../raw/${rawFileName}|${displayName}]]"`,
      `reliability: ${this.metadata.reliability}`,
    ];

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
    if (this.metadata.aliases && this.metadata.aliases.length > 0) {
      lines.push(`aliases:`);
      lines.push(formatArray(this.metadata.aliases));
    } else {
      lines.push(`aliases: []`);
    }

    if (this.metadata.tags && this.metadata.tags.length > 0) {
      lines.push(`tags:`);
      lines.push(formatArray(this.metadata.tags));
    } else {
      lines.push(`tags: []`);
    }

    if (this.metadata.entities && this.metadata.entities.length > 0) {
      lines.push(`entities:`);
      lines.push(formatArray(this.metadata.entities));
    } else {
      lines.push(`entities: []`);
    }

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
