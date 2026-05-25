import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import { WikiManager } from '@/core/wiki';
import { WikiDocumentInfo } from '@/core/wiki/types';
import { ProjectConfig, LintResult } from '@/types';

type SimilarPair = {
  a: WikiDocumentInfo;
  b: WikiDocumentInfo;
  similarity: number;
};

type RouteOccurrence = {
  doc: WikiDocumentInfo;
  value: string;
  source: 'title' | 'entity';
};

type GovernanceAction = {
  type: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  action: string;
  documents: string[];
};

type GovernanceIssue = {
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  count: number;
  affectedDocuments: string[];
  actionItems: string[];
  evidence: string[];
  details: string[];
};

type RawSourceEntry = {
  rawFileName: string;
  rawFilePath: string;
  sourceUrl: string;
};

export class LintChecker {
  private wikiManager: WikiManager;
  private outputsDir: string;
  private rawDir: string;

  constructor(config: ProjectConfig) {
    this.wikiManager = new WikiManager(config.projectRoot);
    this.outputsDir = path.join(config.projectRoot, 'outputs');
    this.rawDir = path.join(config.projectRoot, 'raw');
  }

  async initialize(): Promise<void> {
    await this.wikiManager.initialize();
    await fs.ensureDir(this.outputsDir);
  }

  async runLint(): Promise<LintResult> {
    try {
      const docs = await this.wikiManager.listDocuments();
      const filteredDocs = docs.filter(doc => !this.isIndexDocument(doc));
      const { issues, governanceActions } = await this.runRuleChecks(filteredDocs);
      const score = this.calculateScore(issues);
      const summary = this.buildSummary(filteredDocs, issues);
      const governance = this.buildGovernance(filteredDocs, issues, governanceActions);

      await this.generateReport(score, issues, summary);

      return {
        score,
        issues,
        summary,
        priorities: this.buildPriorities(issues),
        governance,
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
        priorities: ['先修复 Lint 运行错误，再继续做结构治理。'],
        governance: {
          totalDocuments: 0,
          issueCount: 1,
          severityCounts: { high: 1, medium: 0, low: 0 },
          topIssueTypes: [],
          topDocuments: [],
          recommendedActions: [],
        },
      };
    }
  }

  private async runRuleChecks(docs: WikiDocumentInfo[]): Promise<{ issues: LintResult['issues']; governanceActions: GovernanceAction[] }> {
    const duplicateGroups = this.findDuplicateTitleGroups(docs);
    const governanceActions: GovernanceAction[] = [];

    const brokenLinkIssues = this.checkBrokenLinks(docs);
    const emptyIssues = this.checkEmptyDocuments(docs);
    const duplicateIssues = this.buildDuplicateTitleIssues(duplicateGroups);
    const similarIssues = this.checkSimilarTitles(docs, duplicateGroups);
    const duplicateSourceIssues = await this.checkDuplicateSourceUrlGroups(docs);
    const duplicateContentIssues = this.checkDuplicateContent(docs);
    const orphanIssues = this.checkOrphanNotes(docs);
    const routeIssues = this.checkRouteIntegrity(docs);

    const allIssues = [
      ...brokenLinkIssues,
      ...emptyIssues,
      ...duplicateIssues,
      ...similarIssues,
      ...duplicateSourceIssues,
      ...duplicateContentIssues,
      ...orphanIssues,
      ...routeIssues,
    ];

    for (const issue of allIssues as GovernanceIssue[]) {
      if (issue.actionItems?.length > 0) {
        governanceActions.push({
          type: issue.type,
          severity: issue.severity,
          count: issue.count,
          action: issue.actionItems[0],
          documents: issue.affectedDocuments.slice(0, 10),
        });
      }
    }

    return { issues: allIssues, governanceActions };
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
      count: item.links.length,
      affectedDocuments: [item.title],
      actionItems: [
        `检查《${item.title}》中失效链接对应的概念是否应补建或改名`,
        '优先修复被多处引用的高频概念节点',
      ],
      evidence: item.links,
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
        count: 1,
        affectedDocuments: [this.getDocDisplayTitle(doc)],
        actionItems: ['补充正文或删除占位条目'],
        evidence: [doc.fileName],
        details: [doc.fileName],
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
      count: items.length,
      affectedDocuments: items.map(doc => this.getDocDisplayTitle(doc)),
      actionItems: [
        '优先保留唯一主条目，其余条目标记为别名或合并',
        '回溯重复 ingest 来源并调整编译规则',
      ],
      evidence: items.map(doc => doc.fileName),
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
        count: highPairs.length,
        affectedDocuments: this.collectPairDocuments(highPairs),
        actionItems: [
          '先人工确认高相似组是否属于同一概念实体',
          '必要时合并并建立重定向或别名',
        ],
        evidence: highPairs.slice(0, 20).map(pair => `${this.getDocDisplayTitle(pair.a)} ↔ ${this.getDocDisplayTitle(pair.b)}`),
        details: highPairs.slice(0, 20).map(pair => `${this.getDocDisplayTitle(pair.a)} ↔ ${this.getDocDisplayTitle(pair.b)} (${Math.round(pair.similarity * 100)}%)`),
      });
    }

    if (mediumPairs.length > 0) {
      issues.push({
        type: 'similar_title_cluster',
        severity: 'medium',
        description: `发现 ${mediumPairs.length} 组中度相似标题（80%~90%），例如：《${this.getDocDisplayTitle(mediumPairs[0].a)}》 / 《${this.getDocDisplayTitle(mediumPairs[0].b)}》`,
        suggestion: '人工确认这些条目是否需要合并，或明确区分它们的概念边界',
        count: mediumPairs.length,
        affectedDocuments: this.collectPairDocuments(mediumPairs),
        actionItems: [
          '检查命名是否只差修饰词或年份',
          '若非同一实体，补充边界说明以减少误判',
        ],
        evidence: mediumPairs.slice(0, 20).map(pair => `${this.getDocDisplayTitle(pair.a)} ↔ ${this.getDocDisplayTitle(pair.b)}`),
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
      count: orphanNotes.length,
      affectedDocuments: orphanNotes.slice(0, 50).map(doc => this.getDocDisplayTitle(doc)),
      actionItems: [
        '为孤立 Note 添加 Concept 归属',
        '补充链接到稳定的核心概念页',
      ],
      evidence: orphanNotes.slice(0, 50).map(doc => doc.fileName),
      details: orphanNotes.slice(0, 50).map(doc => `${this.getDocDisplayTitle(doc)} -> ${doc.fileName}`),
    }];
  }

  private async checkDuplicateSourceUrlGroups(docs: WikiDocumentInfo[]): Promise<LintResult['issues']> {
    const rawSources = await this.loadRawSourceEntries();
    if (rawSources.length === 0) {
      return [];
    }

    return [
      ...this.buildDuplicateRawSourceUrlIssues(rawSources),
      ...this.buildDuplicateWikiSourceUrlIssues(docs, rawSources),
    ];
  }

  private async loadRawSourceEntries(): Promise<RawSourceEntry[]> {
    if (!await fs.pathExists(this.rawDir)) {
      return [];
    }

    const files = await fs.readdir(this.rawDir);
    const mdFiles = files.filter(file => file.endsWith('.md'));
    const rawSources: RawSourceEntry[] = [];

    for (const file of mdFiles) {
      const rawFilePath = path.join(this.rawDir, file);

      try {
        const content = await fs.readFile(rawFilePath, 'utf-8');
        const parsed = matter(content);
        const sourceUrl = this.normalizeSourceUrl(parsed.data?.source_url || parsed.data?.source || '');

        if (!sourceUrl) continue;

        rawSources.push({
          rawFileName: file,
          rawFilePath,
          sourceUrl,
        });
      } catch {
        continue;
      }
    }

    return rawSources;
  }

  private buildDuplicateRawSourceUrlIssues(rawSources: RawSourceEntry[]): LintResult['issues'] {
    const groups = new Map<string, RawSourceEntry[]>();

    for (const rawSource of rawSources) {
      if (!groups.has(rawSource.sourceUrl)) {
        groups.set(rawSource.sourceUrl, []);
      }
      groups.get(rawSource.sourceUrl)!.push(rawSource);
    }

    return [...groups.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([sourceUrl, items]) => ({
        type: 'duplicate_source_url_raw_group',
        severity: 'high' as const,
        description: `发现 ${items.length} 个 raw 文件指向同一个 source_url：${sourceUrl}`,
        suggestion: '优先在 ingest 入口拦截同源文章重复抓取，并为已落库的重复 raw 建立清理流程',
        count: items.length,
        affectedDocuments: items.map(item => item.rawFileName),
        actionItems: [
          '保留同一来源文章的一份有效 raw，其余 raw 视情况删除、归档或标记为重复',
          '在 ingest 侧使用 source_url/source 作为重复抓取的首要排查锚点',
        ],
        evidence: items.map(item => `${item.rawFileName} -> ${sourceUrl}`),
        details: items.map(item => `${item.rawFileName} -> ${item.rawFilePath}`),
      }));
  }

  private buildDuplicateWikiSourceUrlIssues(
    docs: WikiDocumentInfo[],
    rawSources: RawSourceEntry[]
  ): LintResult['issues'] {
    const rawSourceMap = new Map<string, RawSourceEntry>();
    for (const rawSource of rawSources) {
      rawSourceMap.set(rawSource.rawFileName.toLowerCase(), rawSource);
    }

    const groups = new Map<string, { sourceUrl: string; docs: WikiDocumentInfo[] }>();

    for (const doc of docs) {
      const rawFileName = this.extractRawFileName(doc.rawFile);
      if (!rawFileName) continue;

      const rawSource = this.findRawSourceEntry(rawFileName, rawSourceMap);
      if (!rawSource) continue;

      if (!groups.has(rawSource.sourceUrl)) {
        groups.set(rawSource.sourceUrl, {
          sourceUrl: rawSource.sourceUrl,
          docs: [],
        });
      }

      groups.get(rawSource.sourceUrl)!.docs.push(doc);
    }

    return [...groups.values()]
      .filter(group => group.docs.length > 1)
      .map(group => ({
        type: 'duplicate_source_url_wiki_group',
        severity: 'high' as const,
        description: `发现 ${group.docs.length} 个 wiki 条目回溯到同一个 source_url：${group.sourceUrl}`,
        suggestion: '优先确认这些 wiki 条目是否应合并为同一知识实体，避免同源文章在 wiki 层重复编译',
        count: group.docs.length,
        affectedDocuments: group.docs.map(doc => this.getDocDisplayTitle(doc)),
        actionItems: [
          '为同一 source_url 只保留一个主条目，其余条目合并、删除或降级为别名/重定向',
          '回溯该来源文章的编译规则，避免同源 raw 在 wiki 层继续派生重复内容',
        ],
        evidence: group.docs.map(doc => `${this.getDocDisplayTitle(doc)} -> ${doc.fileName}`),
        details: group.docs.map(doc => {
          const rawFileName = this.extractRawFileName(doc.rawFile) || 'missing raw_file';
          return `${this.getDocDisplayTitle(doc)} -> ${doc.fileName} -> ${rawFileName}`;
        }),
      }));
  }

  private checkDuplicateContent(docs: WikiDocumentInfo[]): LintResult['issues'] {
    const groups = new Map<string, WikiDocumentInfo[]>();

    for (const doc of docs) {
      const normalizedContent = this.normalizeContentForComparison(doc.content || '');
      if (!normalizedContent || normalizedContent.length < 80) continue;

      if (!groups.has(normalizedContent)) {
        groups.set(normalizedContent, []);
      }
      groups.get(normalizedContent)!.push(doc);
    }

    return [...groups.values()]
      .filter(items => items.length > 1)
      .map(items => ({
        type: 'duplicate_content_group',
        severity: 'high' as const,
        description: `发现 ${items.length} 个正文完全重复的条目：${items.map(doc => this.getDocDisplayTitle(doc)).join(' / ')}`,
        suggestion: '优先确认是否为重复 ingest 或拆分失败，再决定合并到唯一主条目',
        count: items.length,
        affectedDocuments: items.map(doc => this.getDocDisplayTitle(doc)),
        actionItems: [
          '先保留信息最完整的版本作为主条目',
          '其余重复正文条目合并、删除或仅保留指向主条目的说明',
        ],
        evidence: items.map(doc => doc.fileName),
        details: items.map(doc => `${this.getDocDisplayTitle(doc)} -> ${doc.fileName}`),
      }));
  }

  private checkRouteIntegrity(docs: WikiDocumentInfo[]): LintResult['issues'] {
    const routeOccurrences = new Map<string, RouteOccurrence[]>();

    for (const doc of docs) {
      const routeNames = [this.getDocDisplayTitle(doc), ...(doc.entities || [])]
        .map(name => this.cleanDisplayText(name))
        .filter(Boolean);

      for (const name of routeNames) {
        const key = this.normalizeForComparison(name);
        if (!key) continue;

        if (!routeOccurrences.has(key)) {
          routeOccurrences.set(key, []);
        }

        routeOccurrences.get(key)!.push({
          doc,
          value: name,
          source: name === this.getDocDisplayTitle(doc) ? 'title' : 'entity',
        });
      }
    }

    const issues: LintResult['issues'] = [];
    const conflictingGroups = [...routeOccurrences.entries()]
      .map(([key, occurrences]) => ({
        key,
        occurrences,
        fileCount: new Set(occurrences.map(item => item.doc.fileName)).size,
      }))
      .filter(group => group.fileCount > 1);

    if (conflictingGroups.length > 0) {
      const example = conflictingGroups[0];
      const exampleDocs = [...new Set(
        example.occurrences.map(item => `《${this.getDocDisplayTitle(item.doc)}》(${item.source}:${item.value})`)
      )].join(' / ');

      issues.push({
        type: 'routing_conflict_group',
        severity: 'high',
        description: `发现 ${conflictingGroups.length} 组路由键冲突，例如：${exampleDocs}`,
        suggestion: '确保每个可路由键只指向唯一主条目，避免 Query 或后续 entities_map 路由发生歧义',
        count: conflictingGroups.length,
        affectedDocuments: [...new Set(
          conflictingGroups.flatMap(group => group.occurrences.map(item => this.getDocDisplayTitle(item.doc)))
        )].slice(0, 50),
        actionItems: [
          '为冲突键只保留一个主条目，其余条目改为别名、重定向或合并',
          '检查 entities 字段是否错误承担了主路由键职责',
        ],
        evidence: conflictingGroups.slice(0, 20).map(group => group.key),
        details: conflictingGroups.slice(0, 20).map(group => {
          const targets = [...new Set(
            group.occurrences.map(item => `${this.getDocDisplayTitle(item.doc)} -> ${item.source}:${item.value}`)
          )].join(' / ');
          return `${group.key} => ${targets}`;
        }),
      });
    }

    const routableKeys = new Set(routeOccurrences.keys());
    const unresolvedEntities = docs
      .map(doc => {
        const missing = [...new Set((doc.entities || [])
          .map(name => this.cleanDisplayText(name))
          .filter(Boolean)
          .filter(name => {
            const key = this.normalizeForComparison(name);
            return key && !routableKeys.has(key);
          }))];

        return {
          doc,
          missing,
        };
      })
      .filter(item => item.missing.length > 0);

    if (unresolvedEntities.length > 0) {
      const example = unresolvedEntities[0];
      issues.push({
        type: 'unresolvable_entity_group',
        severity: 'medium',
        description: `发现 ${unresolvedEntities.length} 个条目的 entities 无法命中现有路由，例如：《${this.getDocDisplayTitle(example.doc)}》`,
        suggestion: '补齐缺失概念页，或把 entities 改成现有稳定路由键，避免 Query 后续接入 entities_map 时命中失败',
        count: unresolvedEntities.reduce((sum, item) => sum + item.missing.length, 0),
        affectedDocuments: unresolvedEntities.map(item => this.getDocDisplayTitle(item.doc)).slice(0, 50),
        actionItems: [
          '优先把 entities 字段改为可稳定命中的主概念键',
          '若对应概念应存在，则补建条目并进入 index 路由表',
        ],
        evidence: unresolvedEntities.slice(0, 20).flatMap(item => item.missing.map(name => `${this.getDocDisplayTitle(item.doc)} -> ${name}`)),
        details: unresolvedEntities.slice(0, 20).map(item => `${this.getDocDisplayTitle(item.doc)} -> ${item.missing.join('、')}`),
      });
    }

    return issues;
  }

  private collectPairDocuments(pairs: SimilarPair[]): string[] {
    return [...new Set(pairs.flatMap(pair => [this.getDocDisplayTitle(pair.a), this.getDocDisplayTitle(pair.b)]))].slice(0, 20);
  }

  private extractRawFileName(rawFile: string): string {
    const value = (rawFile || '').trim();
    if (!value) return '';

    const wikiLinkMatch = value.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/);
    const target = wikiLinkMatch ? wikiLinkMatch[1] : value;

    return target
      .replace(/^\.\.\/raw\//i, '')
      .replace(/^raw\//i, '')
      .trim();
  }

  private findRawSourceEntry(
    rawFileName: string,
    rawSourceMap: Map<string, RawSourceEntry>
  ): RawSourceEntry | null {
    const normalized = rawFileName.toLowerCase();

    if (rawSourceMap.has(normalized)) {
      return rawSourceMap.get(normalized)!;
    }

    const withExtension = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
    return rawSourceMap.get(withExtension) || null;
  }

  private normalizeSourceUrl(sourceUrl: string): string {
    const cleaned = this.cleanDisplayText(sourceUrl || '').trim();
    if (!cleaned) return '';

    try {
      const normalized = new URL(cleaned);
      normalized.hash = '';
      return normalized.toString();
    } catch {
      return cleaned;
    }
  }

  private normalizeContentForComparison(content: string): string {
    return (content || '')
      .replace(/^#\s+.+$/gm, '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
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

  private buildPriorities(issues: LintResult['issues']): string[] {
    const priorities: string[] = [];

    const duplicateIssue = issues.find(issue => issue.type === 'duplicate_title_group');
    const duplicateSourceIssue = issues.find(issue =>
      issue.type === 'duplicate_source_url_raw_group' || issue.type === 'duplicate_source_url_wiki_group'
    );
    const duplicateContentIssue = issues.find(issue => issue.type === 'duplicate_content_group');
    const routeConflictIssue = issues.find(issue => issue.type === 'routing_conflict_group');
    const similarIssue = issues.find(issue => issue.type === 'similar_title_cluster' && issue.severity === 'high');
    const brokenLinkIssue = issues.find(issue => issue.type === 'broken_link_group');
    const orphanIssue = issues.find(issue => issue.type === 'orphan_note_group');
    const unresolvedEntityIssue = issues.find(issue => issue.type === 'unresolvable_entity_group');

    if (duplicateIssue) {
      priorities.push('先处理重复标题组，避免重复 ingest 持续放大知识分裂。');
    }

    if (duplicateSourceIssue) {
      priorities.push('尽快处理同源重复 ingest，避免同一 raw source 在库里持续派生出多个竞争条目。');
    }

    if (duplicateContentIssue) {
      priorities.push('随后清理正文完全重复的条目，优先保留信息最完整的主版本。');
    }

    if (routeConflictIssue) {
      priorities.push('尽快处理路由键冲突，确保同一个 route key 只指向唯一主条目。');
    }

    if (similarIssue) {
      priorities.push('再处理高相似标题簇，尽快确认哪些条目应合并为同一实体。');
    }

    if (unresolvedEntityIssue) {
      priorities.push('随后清理无法命中的 entities，避免后续 Query 接入路由表时出现空跳转。');
    }

    if (brokenLinkIssue) {
      priorities.push('随后处理坏链最密集的文档，优先补齐高频概念节点。');
    }

    if (orphanIssue) {
      priorities.push('最后处理孤立 Note，为它们补充 Concept 归属，提升后续 Query 路由稳定性。');
    }

    if (priorities.length === 0) {
      priorities.push('当前没有明显结构治理优先项，可进入下一阶段优化。');
    }

    return priorities;
  }

  private buildGovernance(
    docs: WikiDocumentInfo[],
    issues: LintResult['issues'],
    governanceActions: GovernanceAction[]
  ): NonNullable<LintResult['governance']> {
    const severityCounts = {
      high: issues.filter(issue => issue.severity === 'high').length,
      medium: issues.filter(issue => issue.severity === 'medium').length,
      low: issues.filter(issue => issue.severity === 'low').length,
    };

    const issueGroups = new Map<string, { issue: LintResult['issues'][number]; count: number }>();
    for (const issue of issues) {
      const current = issueGroups.get(issue.type);
      issueGroups.set(issue.type, {
        issue,
        count: (current?.count || 0) + (issue.count || issue.details?.length || 1),
      });
    }

    const topIssueTypes = [...issueGroups.entries()]
      .map(([type, data]) => ({
        type,
        severity: data.issue.severity,
        count: data.count,
        description: data.issue.description,
        suggestion: data.issue.suggestion,
      }))
      .sort((a, b) => {
        const severityRank = { high: 3, medium: 2, low: 1 };
        const severityDiff = severityRank[b.severity] - severityRank[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.count - a.count;
      })
      .slice(0, 6);

    const documentIssueMap = new Map<string, { fileName: string; title: string; issueTypes: Set<string> }>();
    for (const issue of issues as GovernanceIssue[]) {
      for (const docName of issue.affectedDocuments || []) {
        const key = docName.toLowerCase();
        if (!documentIssueMap.has(key)) {
          documentIssueMap.set(key, { fileName: docName, title: docName, issueTypes: new Set<string>() });
        }
        documentIssueMap.get(key)!.issueTypes.add(issue.type);
      }
    }

    const topDocuments = [...documentIssueMap.values()]
      .map(item => ({
        fileName: item.fileName,
        title: item.title,
        issueCount: item.issueTypes.size,
        issueTypes: [...item.issueTypes],
      }))
      .sort((a, b) => b.issueCount - a.issueCount)
      .slice(0, 10);

    const actionMap = new Map<string, GovernanceAction>();
    for (const action of governanceActions) {
      const existing = actionMap.get(action.type);
      if (!existing || existing.count < action.count) {
        actionMap.set(action.type, action);
      }
    }

    const recommendedActions = [...actionMap.values()]
      .sort((a, b) => {
        const severityRank = { high: 3, medium: 2, low: 1 };
        const severityDiff = severityRank[b.severity] - severityRank[a.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.count - a.count;
      })
      .slice(0, 6);

    return {
      totalDocuments: docs.length,
      issueCount: issues.length,
      severityCounts,
      topIssueTypes,
      topDocuments,
      recommendedActions,
    };
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
