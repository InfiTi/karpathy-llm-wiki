import path from 'path';
import fs from 'fs-extra';
import { WikiManager } from '@/core/wiki';
import { WikiDocumentInfo } from '@/core/wiki/types';
import { ProjectConfig, LintResult } from '@/types';

type SimilarPair = {
  a: WikiDocumentInfo;
  b: WikiDocumentInfo;
  similarity: number;
};

export class LintChecker {
  private wikiManager: WikiManager;
  private outputsDir: string;

  constructor(config: ProjectConfig) {
    this.wikiManager = new WikiManager(config.projectRoot);
    this.outputsDir = path.join(config.projectRoot, 'outputs');
  }

  async initialize(): Promise<void> {
    await this.wikiManager.initialize();
    await fs.ensureDir(this.outputsDir);
  }

  async runLint(): Promise<LintResult> {
    try {
      const docs = await this.wikiManager.listDocuments();
      const filteredDocs = docs.filter(doc => !this.isIndexDocument(doc));
      const issues = this.runRuleChecks(filteredDocs);
      const score = this.calculateScore(issues);
      const summary = this.buildSummary(filteredDocs, issues);

      await this.generateReport(score, issues, summary);

      return {
        score,
        issues,
        summary,
      };
    } catch (error) {
      console.error('Lint error:', error);
      return {
        score: 0,
        issues: [{
          type: 'lint_runtime_error',
          severity: 'high',
          description: `Lint 执行失败：${error instanceof Error ? error.message : '未知错误'}`,
          suggestion: '检查项目路径、文档读写权限和规则实现',
        }],
        summary: 'Lint 执行失败',
      };
    }
  }

  private runRuleChecks(docs: WikiDocumentInfo[]): LintResult['issues'] {
    const duplicateGroups = this.findDuplicateTitleGroups(docs);

    return [
      ...this.checkBrokenLinks(docs),
      ...this.checkEmptyDocuments(docs),
      ...this.buildDuplicateTitleIssues(duplicateGroups),
      ...this.checkSimilarTitles(docs, duplicateGroups),
      ...this.checkOrphanNotes(docs),
    ];
  }

  private checkBrokenLinks(docs: WikiDocumentInfo[]): LintResult['issues'] {
    const existingNames = new Set<string>();

    for (const doc of docs) {
      const candidates = [this.getDocDisplayTitle(doc), ...(doc.aliases || []), ...(doc.entities || [])]
        .map(name => this.normalizeForComparison(name))
        .filter(Boolean);

      for (const candidate of candidates) {
        existingNames.add(candidate);
      }
    }

    const brokenByDoc = new Map<string, { title: string; links: string[] }>();

    for (const doc of docs) {
      const brokenLinks = [...new Set(
        (doc.links || [])
          .filter(link => {
            const normalizedLink = this.normalizeForComparison(link);
            return normalizedLink && !existingNames.has(normalizedLink);
          })
      )];

      if (brokenLinks.length === 0) continue;

      brokenByDoc.set(doc.fileName, {
        title: this.getDocDisplayTitle(doc),
        links: brokenLinks,
      });
    }

    return [...brokenByDoc.values()].map(item => ({
      type: 'broken_link_group',
      severity: 'medium' as const,
      description: `条目《${item.title}》包含 ${item.links.length} 个失效链接：${item.links.slice(0, 6).join('、')}${item.links.length > 6 ? ' 等' : ''}`,
      suggestion: '优先补齐高频概念条目，或删除这些无效双链',
      details: item.links,
    }));
  }

  private checkEmptyDocuments(docs: WikiDocumentInfo[]): LintResult['issues'] {
    return docs
      .filter(doc => (doc.content || '').trim().length < 100)
      .map(doc => ({
        type: 'empty_document',
        severity: 'low' as const,
        description: `条目《${this.getDocDisplayTitle(doc)}》内容过短，可能是占位文档或抓取不完整`,
        suggestion: '补充正文内容，或确认该条目是否应该保留',
      }));
  }

  private findDuplicateTitleGroups(docs: WikiDocumentInfo[]): WikiDocumentInfo[][] {
    const groups = new Map<string, WikiDocumentInfo[]>();

    for (const doc of docs) {
      const key = this.normalizeForComparison(this.getDocDisplayTitle(doc));
      if (!key) continue;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(doc);
    }

    return [...groups.values()].filter(items => items.length > 1);
  }

  private buildDuplicateTitleIssues(groups: WikiDocumentInfo[][]): LintResult['issues'] {
    return groups.map(items => ({
      type: 'duplicate_title_group',
      severity: 'high' as const,
      description: `发现 ${items.length} 个重复标题条目：${items.map(doc => this.getDocDisplayTitle(doc)).join(' / ')}`,
      suggestion: '确认这些条目是否应合并为同一知识实体，避免重复 ingest 持续堆积',
      details: items.map(doc => `${this.getDocDisplayTitle(doc)} -> ${doc.fileName}`),
    }));
  }

  private checkSimilarTitles(docs: WikiDocumentInfo[], duplicateGroups: WikiDocumentInfo[][]): LintResult['issues'] {
    const duplicateKeys = new Set(
      duplicateGroups.flatMap(group => group.map(doc => this.normalizeForComparison(this.getDocDisplayTitle(doc))))
    );

    const highPairs: SimilarPair[] = [];
    const mediumPairs: SimilarPair[] = [];

    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const left = docs[i];
        const right = docs[j];
        const leftKey = this.normalizeForComparison(this.getDocDisplayTitle(left));
        const rightKey = this.normalizeForComparison(this.getDocDisplayTitle(right));

        if (duplicateKeys.has(leftKey) && duplicateKeys.has(rightKey) && leftKey === rightKey) {
          continue;
        }

        const similarity = this.calculateTitleSimilarity(
          this.getDocDisplayTitle(left),
          this.getDocDisplayTitle(right)
        );

        if (similarity < 0.8) continue;

        const pair = { a: left, b: right, similarity };
        if (similarity >= 0.9) {
          highPairs.push(pair);
        } else {
          mediumPairs.push(pair);
        }
      }
    }

    const issues: LintResult['issues'] = [];

    if (highPairs.length > 0) {
      issues.push({
        type: 'similar_title_cluster',
        severity: 'high',
        description: `发现 ${highPairs.length} 组高相似标题（>=90%），例如：《${this.getDocDisplayTitle(highPairs[0].a)}》 / 《${this.getDocDisplayTitle(highPairs[0].b)}》`,
        suggestion: '优先检查这些条目是否为重复 ingest，必要时建立合并规则',
        details: highPairs.slice(0, 20).map(pair => `${this.getDocDisplayTitle(pair.a)} ↔ ${this.getDocDisplayTitle(pair.b)} (${Math.round(pair.similarity * 100)}%)`),
      });
    }

    if (mediumPairs.length > 0) {
      issues.push({
        type: 'similar_title_cluster',
        severity: 'medium',
        description: `发现 ${mediumPairs.length} 组中度相似标题（80%~90%），例如：《${this.getDocDisplayTitle(mediumPairs[0].a)}》 / 《${this.getDocDisplayTitle(mediumPairs[0].b)}》`,
        suggestion: '人工确认这些条目是否需要合并，或明确区分它们的概念边界',
        details: mediumPairs.slice(0, 20).map(pair => `${this.getDocDisplayTitle(pair.a)} ↔ ${this.getDocDisplayTitle(pair.b)} (${Math.round(pair.similarity * 100)}%)`),
      });
    }

    return issues;
  }

  private checkOrphanNotes(docs: WikiDocumentInfo[]): LintResult['issues'] {
    const conceptNames = new Set(
      docs
        .filter(doc => this.normalizeType(doc.type) === 'Concept')
        .flatMap(doc => [this.getDocDisplayTitle(doc), ...(doc.aliases || []), ...(doc.entities || [])])
        .map(name => this.normalizeForComparison(name))
        .filter(Boolean)
    );

    const orphanNotes = docs.filter(doc => {
      if (this.normalizeType(doc.type) !== 'Note') return false;

      const linkedTargets = new Set(
        [...(doc.links || []), ...(doc.entities || [])]
          .map(name => this.normalizeForComparison(name))
          .filter(Boolean)
      );

      return ![...linkedTargets].some(name => conceptNames.has(name));
    });

    if (orphanNotes.length === 0) {
      return [];
    }

    return [{
      type: 'orphan_note_group',
      severity: 'medium',
      description: `发现 ${orphanNotes.length} 个孤立 Note，例如：《${this.getDocDisplayTitle(orphanNotes[0])}》`,
      suggestion: '优先为这些 Note 建立 Concept 关联，否则后续 Query 路由会越来越分裂',
      details: orphanNotes.slice(0, 50).map(doc => `${this.getDocDisplayTitle(doc)} -> ${doc.fileName}`),
    }];
  }

  private calculateScore(issues: LintResult['issues']): number {
    let score = 100;

    for (const issue of issues) {
      if (issue.severity === 'high') score -= 12;
      else if (issue.severity === 'medium') score -= 6;
      else score -= 2;
    }

    return Math.max(0, score);
  }

  private buildSummary(docs: WikiDocumentInfo[], issues: LintResult['issues']): string {
    const high = issues.filter(issue => issue.severity === 'high').length;
    const medium = issues.filter(issue => issue.severity === 'medium').length;
    const low = issues.filter(issue => issue.severity === 'low').length;

    return `本次共扫描 ${docs.length} 个条目，发现 ${issues.length} 类问题（高优先级 ${high}，中优先级 ${medium}，低优先级 ${low}）。`;
  }

  private async generateReport(score: number, issues: LintResult['issues'], summary: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `lint-report-${timestamp}.md`;
    const filePath = path.join(this.outputsDir, fileName);

    const lines = [
      '---',
      'title: "Lint 检查报告"',
      `created: ${new Date().toISOString()}`,
      'source: system-generated',
      'type: report',
      '---',
      '',
      '# Lint 检查报告',
      '',
      '## 综合评分',
      `**${score}/100**`,
      '',
      '## 总结',
      summary,
      '',
      '## 问题列表',
      '',
    ];

    const highIssues = issues.filter(issue => issue.severity === 'high');
    const mediumIssues = issues.filter(issue => issue.severity === 'medium');
    const lowIssues = issues.filter(issue => issue.severity === 'low');

    if (highIssues.length > 0) {
      lines.push('### 高优先级');
      for (const issue of highIssues) {
        lines.push(`- **${issue.type}**：${issue.description}`);
        lines.push(`  建议：${issue.suggestion}`);
      }
      lines.push('');
    }

    if (mediumIssues.length > 0) {
      lines.push('### 中优先级');
      for (const issue of mediumIssues) {
        lines.push(`- **${issue.type}**：${issue.description}`);
        lines.push(`  建议：${issue.suggestion}`);
      }
      lines.push('');
    }

    if (lowIssues.length > 0) {
      lines.push('### 低优先级');
      for (const issue of lowIssues) {
        lines.push(`- **${issue.type}**：${issue.description}`);
        lines.push(`  建议：${issue.suggestion}`);
      }
      lines.push('');
    }

    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    return filePath;
  }

  async getWikiStatistics(): Promise<{
    totalDocuments: number;
    totalLinks: number;
    totalTags: number;
    averageDocumentSize: number;
  }> {
    const docs = await this.wikiManager.listDocuments();
    const filteredDocs = docs.filter(doc => !this.isIndexDocument(doc));
    const totalDocuments = filteredDocs.length;
    const totalLinks = filteredDocs.reduce((sum, doc) => sum + (doc.links || []).length, 0);
    const allTags = new Set<string>();
    let totalSize = 0;

    for (const doc of filteredDocs) {
      for (const tag of doc.tags || []) {
        allTags.add(tag);
      }
      totalSize += doc.size;
    }

    return {
      totalDocuments,
      totalLinks,
      totalTags: allTags.size,
      averageDocumentSize: totalDocuments > 0 ? Math.round(totalSize / totalDocuments) : 0,
    };
  }

  private isIndexDocument(doc: WikiDocumentInfo): boolean {
    return doc.type?.toLowerCase() === 'index' || doc.fileName === '索引.md' || doc.fileName === 'index.md';
  }

  private normalizeType(type?: string): string {
    const normalized = (type || 'note').toLowerCase();
    if (normalized === 'concept') return 'Concept';
    if (normalized === 'raw') return 'Raw';
    return 'Note';
  }

  private getDocDisplayTitle(doc: WikiDocumentInfo): string {
    const match = (doc.content || '').match(/^#\s+(.+)$/m);
    if (match) {
      return this.cleanDisplayText(match[1]);
    }

    return this.cleanDisplayText(doc.title || doc.fileName.replace(/\.md$/i, ''));
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
}
