import path from 'path';
import fs from 'fs-extra';
import { WikiManager } from '@/core/wiki';
import { WikiDocumentInfo } from '@/core/wiki/types';

export interface IndexEntry {
  title: string;
  fileName: string;
  type: string;
  tags: string[];
  created: string;
}

interface DuplicateCandidate {
  titleA: string;
  fileA: string;
  titleB: string;
  fileB: string;
  similarity: number;
  level: 'high' | 'medium';
}

interface EntityRoute {
  entity: string;
  file: string;
  aliases: string[];
  tags: string[];
  type: string;
}

const HIGH_SIMILARITY_THRESHOLD = 0.9;
const MEDIUM_SIMILARITY_THRESHOLD = 0.8;

export class IndexManager {
  private indexPath: string;
  private wikiIndexPath: string;
  private wikiDir: string;
  private wikiManager: WikiManager;

  constructor(projectRoot: string) {
    this.wikiDir = path.join(projectRoot, 'wiki');
    this.indexPath = path.join(projectRoot, 'index.md');
    this.wikiIndexPath = path.join(this.wikiDir, '索引.md');
    this.wikiManager = new WikiManager(projectRoot);
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.wikiDir);
  }

  async updateIndex(_newEntry?: IndexEntry): Promise<void> {
    const docs = await this.wikiManager.listDocuments();
    const filteredDocs = docs.filter(doc => !this.isIndexDocument(doc));
    const content = this.renderIndex(filteredDocs);

    await fs.writeFile(this.indexPath, content, 'utf-8');
    await this.removeWikiIndexIfExists();

    console.log('[IndexManager] Rebuilt index from wiki documents:', filteredDocs.length);
  }

  async removeFromIndex(_fileName: string): Promise<void> {
    await this.updateIndex();
  }

  private isIndexDocument(doc: WikiDocumentInfo): boolean {
    return doc.type?.toLowerCase() === 'index' || doc.fileName === '索引.md' || doc.fileName === 'index.md';
  }

  private async removeWikiIndexIfExists(): Promise<void> {
    if (await fs.pathExists(this.wikiIndexPath)) {
      await fs.remove(this.wikiIndexPath);
    }
  }

  private renderIndex(docs: WikiDocumentInfo[]): string {
    const now = new Date().toISOString();
    const sortedByModified = [...docs].sort((a, b) => b.modified.getTime() - a.modified.getTime());
    const recentDocs = sortedByModified.slice(0, 30);

    const entityRoutes = this.buildEntityRoutes(docs);
    const duplicateCandidates = this.findDuplicateCandidates(docs);
    const orphanNotes = this.findOrphanNotes(docs);
    const typeGroups = this.groupByType(docs);
    const tagGroups = this.groupByTags(docs);

    const routeYaml = this.renderEntitiesMapYaml(entityRoutes);
    const recentSection = recentDocs.length
      ? recentDocs.map(doc => `- ${this.renderSafeWikiLink(doc.fileName, this.getDocDisplayTitle(doc))} - ${this.formatDate(doc.modified)}`).join('\n')
      : '_暂无条目_';

    const typeSection = Object.keys(typeGroups).length
      ? Object.entries(typeGroups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, items]) => `### ${type} (${items.length})\n\n${items.map(doc => `- ${this.renderSafeWikiLink(doc.fileName, this.getDocDisplayTitle(doc))}`).join('\n')}`)
        .join('\n\n')
      : '_暂无条目_';

    const tagSection = Object.keys(tagGroups).length
      ? Object.entries(tagGroups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, items]) => `### ${tag} (${items.length})\n\n${items.map(doc => `- ${this.renderSafeWikiLink(doc.fileName, this.getDocDisplayTitle(doc))}`).join('\n')}`)
        .join('\n\n')
      : '_暂无条目_';

    const duplicateSection = duplicateCandidates.length
      ? duplicateCandidates.map(item => {
        const left = this.renderSafeWikiLink(item.fileA, item.titleA);
        const right = this.renderSafeWikiLink(item.fileB, item.titleB);
        const similarity = `${Math.round(item.similarity * 100)}%`;
        const label = item.level === 'high' ? '高相似' : '待确认';
        return `- [${label}] ${left} ↔ ${right} (${similarity})`;
      }).join('\n')
      : '_暂无重复候选_';

    const orphanSection = orphanNotes.length
      ? orphanNotes.map(doc => `- ${this.renderSafeWikiLink(doc.fileName, this.getDocDisplayTitle(doc))}`).join('\n')
      : '_暂无孤立条目_';

    return `---
title: "知识索引"
type: index
tags:
  - index
  - overview
total_notes: ${docs.length}
updated: ${now}
entities_map:
${routeYaml}
---

# 知识索引

> 当前共 **${docs.length}** 个知识条目。

## 最近更新
${recentSection}

## 按类型分类
${typeSection}

## 按标签分类
${tagSection}

## 待合并 / 待治理
${duplicateSection}

## 孤立条目（待关联）
${orphanSection}
`;
  }

  private buildEntityRoutes(docs: WikiDocumentInfo[]): EntityRoute[] {
    const routes = new Map<string, EntityRoute>();

    for (const doc of docs) {
      const primaryTitle = this.getDocDisplayTitle(doc);
      const names = [primaryTitle, ...(doc.entities || [])]
        .map(name => this.cleanDisplayText(name))
        .filter(Boolean);

      const aliases = [...new Set((doc.aliases || []).map(alias => this.cleanDisplayText(alias)).filter(Boolean))];
      const tags = [...new Set((doc.tags || []).map(tag => this.cleanDisplayText(tag)).filter(Boolean))];
      const type = this.normalizeType(doc.type);

      for (const name of names) {
        const key = this.normalizeForComparison(name);
        if (!key || routes.has(key)) continue;

        routes.set(key, {
          entity: name,
          file: `wiki/${doc.fileName}`,
          aliases,
          tags,
          type,
        });
      }
    }

    return [...routes.values()].sort((a, b) => a.entity.localeCompare(b.entity, 'zh-CN'));
  }

  private renderEntitiesMapYaml(routes: EntityRoute[]): string {
    if (routes.length === 0) {
      return '  []';
    }

    return routes.map(route => {
      const aliases = route.aliases.length
        ? `[${route.aliases.map(alias => this.quoteYaml(alias)).join(', ')}]`
        : '[]';
      const tags = route.tags.length
        ? `[${route.tags.map(tag => this.quoteYaml(tag)).join(', ')}]`
        : '[]';

      return [
        `  - entity: ${this.quoteYaml(route.entity)}`,
        `    file: ${this.quoteYaml(route.file)}`,
        `    aliases: ${aliases}`,
        `    tags: ${tags}`,
        `    type: ${this.quoteYaml(route.type)}`,
      ].join('\n');
    }).join('\n');
  }

  private findDuplicateCandidates(docs: WikiDocumentInfo[]): DuplicateCandidate[] {
    const candidates: DuplicateCandidate[] = [];

    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const left = docs[i];
        const right = docs[j];
        const leftTitle = this.getDocDisplayTitle(left);
        const rightTitle = this.getDocDisplayTitle(right);
        const similarity = this.calculateTitleSimilarity(leftTitle, rightTitle);

        if (similarity < MEDIUM_SIMILARITY_THRESHOLD) {
          continue;
        }

        candidates.push({
          titleA: leftTitle,
          fileA: left.fileName,
          titleB: rightTitle,
          fileB: right.fileName,
          similarity,
          level: similarity >= HIGH_SIMILARITY_THRESHOLD ? 'high' : 'medium',
        });
      }
    }

    return candidates.sort((a, b) => b.similarity - a.similarity);
  }

  private findOrphanNotes(docs: WikiDocumentInfo[]): WikiDocumentInfo[] {
    const conceptNames = new Set(
      docs
        .filter(doc => this.normalizeType(doc.type) === 'Concept')
        .flatMap(doc => [this.getDocDisplayTitle(doc), ...(doc.aliases || []), ...(doc.entities || [])])
        .map(name => this.normalizeForComparison(name))
        .filter(Boolean)
    );

    return docs.filter(doc => {
      if (this.normalizeType(doc.type) !== 'Note') {
        return false;
      }

      const linkedTargets = new Set(
        [...(doc.links || []), ...(doc.entities || [])]
          .map(link => this.normalizeForComparison(link))
          .filter(Boolean)
      );

      for (const target of linkedTargets) {
        if (conceptNames.has(target)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => this.getDocDisplayTitle(a).localeCompare(this.getDocDisplayTitle(b), 'zh-CN'));
  }

  private groupByType(docs: WikiDocumentInfo[]): Record<string, WikiDocumentInfo[]> {
    const groups: Record<string, WikiDocumentInfo[]> = {};

    for (const doc of docs) {
      const type = this.normalizeType(doc.type);
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(doc);
    }

    for (const type of Object.keys(groups)) {
      groups[type].sort((a, b) => this.getDocDisplayTitle(a).localeCompare(this.getDocDisplayTitle(b), 'zh-CN'));
    }

    return groups;
  }

  private groupByTags(docs: WikiDocumentInfo[]): Record<string, WikiDocumentInfo[]> {
    const groups: Record<string, WikiDocumentInfo[]> = {};

    for (const doc of docs) {
      for (const tag of doc.tags || []) {
        const cleanTag = this.cleanDisplayText(tag);
        if (!cleanTag) continue;

        if (!groups[cleanTag]) {
          groups[cleanTag] = [];
        }
        groups[cleanTag].push(doc);
      }
    }

    for (const tag of Object.keys(groups)) {
      groups[tag].sort((a, b) => this.getDocDisplayTitle(a).localeCompare(this.getDocDisplayTitle(b), 'zh-CN'));
    }

    return groups;
  }

  private normalizeType(type?: string): string {
    const normalized = (type || 'note').toLowerCase();
    if (normalized === 'concept') return 'Concept';
    if (normalized === 'raw') return 'Raw';
    return 'Note';
  }

  private renderSafeWikiLink(fileName: string, title: string): string {
    return `[[wiki/${this.cleanFileName(fileName)}|${this.cleanDisplayText(title)}]]`;
  }

  private getDocDisplayTitle(doc: WikiDocumentInfo): string {
    const headingTitle = this.extractHeadingTitle(doc.content || '');
    if (headingTitle) {
      return headingTitle;
    }

    const cleaned = this.cleanDisplayText(doc.title || '');
    const stripped = cleaned
      .replace(/_[0-9]{8}_[0-9]{6}$/g, '')
      .replace(/_[0-9]{8}$/g, '')
      .replace(/^\d{4}-\d{2}-\d{2}t\d{2}-\d{2}-\d{2}-\d{3}z_/i, '')
      .trim();

    return stripped || cleaned || doc.fileName.replace(/\.md$/i, '');
  }

  private extractHeadingTitle(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    if (!match) return null;
    const cleaned = this.cleanDisplayText(match[1]);
    return cleaned || null;
  }

  private cleanFileName(fileName: string): string {
    return fileName.replace(/[\[\]]/g, '');
  }

  private cleanDisplayText(text: string): string {
    return (text || '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeForComparison(text: string): string {
    return this.cleanDisplayText(text)
      .toLowerCase()
      .replace(/\.(md|markdown)$/g, '')
      .replace(/[()（）\[\]【】'"`’‘“”\-—_:：，,。！？!?\/\\\s]/g, '');
  }

  private calculateTitleSimilarity(left: string, right: string): number {
    const a = this.normalizeForComparison(left);
    const b = this.normalizeForComparison(right);
    if (!a || !b) return 0;
    if (a === b) return 1;

    const distance = this.levenshtein(a, b);
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1;
    return 1 - distance / maxLength;
  }

  private levenshtein(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 0; i < rows; i++) matrix[i][0] = i;
    for (let j = 0; j < cols; j++) matrix[0][j] = j;

    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[a.length][b.length];
  }

  private quoteYaml(value: string): string {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
