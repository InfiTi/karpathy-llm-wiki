import path from 'path';
import fs from 'fs-extra';
import { LLMClient } from '@/core/llm';
import { WikiManager } from '@/core/wiki';
import { ProjectConfig, LintResult } from '@/types';

export class LintChecker {
  private llmClient: LLMClient;
  private wikiManager: WikiManager;
  private outputsDir: string;

  constructor(config: ProjectConfig) {
    this.llmClient = new LLMClient(config);
    this.wikiManager = new WikiManager(config.projectRoot);
    this.outputsDir = path.join(config.projectRoot, 'outputs');
  }

  /** Initialize lint checker */
  async initialize(): Promise<void> {
    await this.wikiManager.initialize();
    await fs.ensureDir(this.outputsDir);
  }

  /** Run lint process on wiki */
  async runLint(): Promise<LintResult> {
    try {
      // Get all wiki documents
      const docs = await this.wikiManager.listDocuments();

      // Collect all document contents
      const documentContents: string[] = [];
      for (const doc of docs) {
        const content = await fs.readFile(doc.filePath, 'utf-8');
        documentContents.push(`# ${doc.title}\n${content}`);
      }

      // Build global context
      const globalContext = documentContents.join('\n\n---\n\n');

      // Evaluate wiki quality using LLM
      const evaluation = await this.evaluateQuality(globalContext);

      // Run auto-checks
      const autoIssues = await this.autoCheck(docs);

      // Combine issues
      const allIssues = [...evaluation.issues, ...autoIssues];

      // Generate report
      await this.generateReport(evaluation.score, allIssues, evaluation.summary);

      return {
        score: evaluation.score,
        issues: allIssues,
        summary: evaluation.summary,
      };
    } catch (error) {
      console.error('Lint error:', error);
      return {
        score: 0,
        issues: [{
          type: 'error',
          severity: 'high',
          description: `Lint process failed: ${error instanceof Error ? error.message : '未知错误'}`,
          suggestion: '检查日志以获取更多信息',
        }],
        summary: 'Lint process failed',
      };
    }
  }

  /** Evaluate wiki quality using LLM */
  async evaluateQuality(globalContext: string): Promise<{
    score: number;
    issues: LintResult['issues'];
    summary: string;
  }> {
    const evaluation = await this.llmClient.lint(globalContext);

    try {
      const parsed = JSON.parse(evaluation);
      return {
        score: parsed.score || 0,
        issues: parsed.issues || [],
        summary: parsed.summary || '',
      };
    } catch {
      return {
        score: 50,
        issues: [{
          type: 'error',
          severity: 'medium',
          description: '无法解析 LLM 评估结果',
          suggestion: '检查 LLM 配置和提示词',
        }],
        summary: '评估结果解析失败',
      };
    }
  }

  /** Run auto-checks without LLM */
  async autoCheck(docs: Awaited<ReturnType<WikiManager['listDocuments']>>): Promise<LintResult['issues']> {
    const issues: LintResult['issues'] = [];

    // Check for broken links
    const brokenLinks = await this.checkBrokenLinks(docs);
    if (brokenLinks.length > 0) {
      issues.push({
        type: 'broken_links',
        severity: 'medium',
        description: `发现 ${brokenLinks.length} 个断开的链接`,
        suggestion: '修复断开的链接',
      });
    }

    // Check for empty documents
    const emptyDocs = docs.filter(doc => doc.size < 100);
    if (emptyDocs.length > 0) {
      issues.push({
        type: 'empty_documents',
        severity: 'low',
        description: `发现 ${emptyDocs.length} 个空文档`,
        suggestion: '添加内容到空文档',
      });
    }

    // Check for duplicate titles
    const titles = new Set<string>();
    const duplicateTitles: string[] = [];
    for (const doc of docs) {
      if (titles.has(doc.title)) {
        duplicateTitles.push(doc.title);
      } else {
        titles.add(doc.title);
      }
    }
    if (duplicateTitles.length > 0) {
      issues.push({
        type: 'duplicate_titles',
        severity: 'low',
        description: `发现 ${duplicateTitles.length} 个重复标题`,
        suggestion: '重命名重复的文档',
      });
    }

    return issues;
  }

  /** Check for broken links */
  async checkBrokenLinks(docs: Awaited<ReturnType<WikiManager['listDocuments']>>): Promise<string[]> {
    const brokenLinks: string[] = [];
    const existingTitles = new Set<string>(docs.map(doc => doc.title.toLowerCase()));

    for (const doc of docs) {
      for (const link of doc.links) {
        if (!existingTitles.has(link.toLowerCase())) {
          brokenLinks.push(`${doc.title} -> ${link}`);
        }
      }
    }

    return brokenLinks;
  }

  /** Generate lint report */
  async generateReport(score: number, issues: LintResult['issues'], summary: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `lint-report-${timestamp}.md`;
    const filePath = path.join(this.outputsDir, fileName);

    const content = [
      '---',
      `title: "Lint 报告"`,
      `created: ${new Date().toISOString()}`,
      `source: system-generated`,
      `type: report`,
      '---',
      '',
      `# Lint 报告`,
      '',
      `## 总体评分`,
      `**${score}/100**`,
      '',
      `## 总体评价`,
      summary,
      '',
      `## 问题列表`,
      '',
    ];

    // Group issues by severity
    const highIssues = issues.filter(issue => issue.severity === 'high');
    const mediumIssues = issues.filter(issue => issue.severity === 'medium');
    const lowIssues = issues.filter(issue => issue.severity === 'low');

    if (highIssues.length > 0) {
      content.push(`### 高优先级`);
      for (const issue of highIssues) {
        content.push(`- **${issue.type}**: ${issue.description}`);
        content.push(`  建议: ${issue.suggestion}`);
      }
      content.push('');
    }

    if (mediumIssues.length > 0) {
      content.push(`### 中优先级`);
      for (const issue of mediumIssues) {
        content.push(`- **${issue.type}**: ${issue.description}`);
        content.push(`  建议: ${issue.suggestion}`);
      }
      content.push('');
    }

    if (lowIssues.length > 0) {
      content.push(`### 低优先级`);
      for (const issue of lowIssues) {
        content.push(`- **${issue.type}**: ${issue.description}`);
        content.push(`  建议: ${issue.suggestion}`);
      }
      content.push('');
    }

    await fs.writeFile(filePath, content.join('\n'), 'utf-8');
    return filePath;
  }

  /** Get wiki statistics */
  async getWikiStatistics(): Promise<{
    totalDocuments: number;
    totalLinks: number;
    totalTags: number;
    averageDocumentSize: number;
  }> {
    const docs = await this.wikiManager.listDocuments();
    const totalDocuments = docs.length;
    const totalLinks = docs.reduce((sum, doc) => sum + doc.links.length, 0);
    const allTags = new Set<string>();
    let totalSize = 0;

    for (const doc of docs) {
      for (const tag of doc.tags) {
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
}