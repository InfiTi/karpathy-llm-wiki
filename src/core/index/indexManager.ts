import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';

export interface IndexEntry {
  title: string;
  fileName: string;
  type: string;
  tags: string[];
  created: string;
}

export class IndexManager {
  private indexPath: string;
  private wikiDir: string;

  constructor(projectRoot: string) {
    this.wikiDir = path.join(projectRoot, 'wiki');
    this.indexPath = path.join(projectRoot, 'index.md');
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.wikiDir);
  }

  async updateIndex(newEntry: IndexEntry): Promise<void> {
    let indexContent = '';
    let existingEntries: IndexEntry[] = [];

    if (await fs.pathExists(this.indexPath)) {
      indexContent = await fs.readFile(this.indexPath, 'utf-8');
      existingEntries = this.parseIndexEntries(indexContent);
    } else {
      indexContent = this.createDefaultIndex();
    }

    // Clean up new entry before adding
    const cleanedEntry = {
      ...newEntry,
      fileName: this.cleanFileName(newEntry.fileName),
    };

    const updatedEntries = this.updateEntries(existingEntries, cleanedEntry);
    const newContent = this.renderIndex(updatedEntries);
    await fs.writeFile(this.indexPath, newContent, 'utf-8');
    console.log('[IndexManager] index.md updated with new entry:', cleanedEntry.title);
  }

  /** Clean up file name to remove characters that break Obsidian links */
  private cleanFileName(fileName: string): string {
    return fileName.replace(/[\[\]]/g, '');
  }

  private parseIndexEntries(content: string): IndexEntry[] {
    const entries: IndexEntry[] = [];
    const recentSection = content.match(/## 最近更新\n\n([\s\S]*?)(?=\n## |$)/);

    if (recentSection) {
      const lines = recentSection[1].split('\n');
      for (const line of lines) {
        const match = line.match(/\[\[wiki\/([^\]|]+)\|([^\]]+)\]\]\s*-\s*(.+)/);
        if (match) {
          // Clean up any [ or ] characters in the file name
          const cleanedFileName = this.cleanFileName(match[1]);
          entries.push({
            fileName: cleanedFileName,
            title: match[2].replace(/[\[\]]/g, ''),
            type: this.guessTypeFromFileName(cleanedFileName),
            tags: [],
            created: match[3].trim(),
          });
        }
      }
    }

    return entries;
  }

  private guessTypeFromFileName(fileName: string): string {
    if (fileName.includes('概念') || fileName.includes('理论')) {
      return 'Concept';
    }
    return 'Note';
  }

  private updateEntries(existing: IndexEntry[], newEntry: IndexEntry): IndexEntry[] {
    const filtered = existing.filter(e => e.fileName !== newEntry.fileName);
    const updated = [newEntry, ...filtered];
    return updated.slice(0, 20);
  }

  private createDefaultIndex(): string {
    const now = new Date().toISOString().split('T')[0];
    return `---
title: 知识索引
type: index
tags:
  - index
  - overview
created: ${now}
---

# 知识索引

> 共收录 **0** 个知识条目

## 最近更新

## 按类型分类

### Note (0)

### Concept (0)

## 按标签分类
`;
  }

  private renderIndex(entries: IndexEntry[]): string {
    const count = entries.length;
    const now = new Date().toISOString().split('T')[0];

    const recentSection = entries.map(e => {
      return `- [[wiki/${e.fileName}|${e.title}]] - ${e.created}`;
    }).join('\n');

    const typeGroups = this.groupByType(entries);
    const typeSection = Object.entries(typeGroups).map(([type, items]) => {
      const itemsList = items.map(e => `- [[wiki/${e.fileName}|${e.title}]]`).join('\n');
      return `### ${type} (${items.length})\n\n${itemsList}`;
    }).join('\n\n');

    const tagGroups = this.groupByTags(entries);
    const tagSection = Object.entries(tagGroups).map(([tag, items]) => {
      const itemsList = items.map(e => `- [[wiki/${e.fileName}|${e.title}]]`).join('\n');
      return `### ${tag} (${items.length})\n\n${itemsList}`;
    }).join('\n\n');

    return `---
title: 知识索引
type: index
tags:
  - index
  - overview
created: 2026-04-15
updated: ${now}
---

# 知识索引

> 共收录 **${count}** 个知识条目

## 最近更新

${recentSection || '_（暂无条目）_'}

## 按类型分类

${typeSection || '_（暂无条目）_'}

## 按标签分类

${tagSection || '_（暂无条目）_'}
`;
  }

  private groupByType(entries: IndexEntry[]): Record<string, IndexEntry[]> {
    const groups: Record<string, IndexEntry[]> = {};
    for (const entry of entries) {
      const type = entry.type || 'Note';
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(entry);
    }
    return groups;
  }

  private groupByTags(entries: IndexEntry[]): Record<string, IndexEntry[]> {
    const groups: Record<string, IndexEntry[]> = {};
    for (const entry of entries) {
      for (const tag of entry.tags) {
        if (!groups[tag]) {
          groups[tag] = [];
        }
        groups[tag].push(entry);
      }
    }
    return groups;
  }

  async removeFromIndex(fileName: string): Promise<void> {
    if (!await fs.pathExists(this.indexPath)) {
      return;
    }

    const content = await fs.readFile(this.indexPath, 'utf-8');
    const entries = this.parseIndexEntries(content);
    const updated = entries.filter(e => e.fileName !== fileName);
    const newContent = this.renderIndex(updated);
    await fs.writeFile(this.indexPath, newContent, 'utf-8');
  }
}