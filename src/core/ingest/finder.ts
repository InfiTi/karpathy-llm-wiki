import fs from 'fs-extra';
import { WikiManager } from '@/core/wiki';

export class RelatedFinder {
  private wikiManager: WikiManager;

  constructor(wikiManager: WikiManager) {
    this.wikiManager = wikiManager;
  }

  /** Find related documents based on content */
  async findRelated(content: string, limit: number = 3): Promise<{
    fileName: string;
    title: string;
    relevance: number;
  }[]> {
    const docs = await this.wikiManager.listDocuments();
    const relatedDocs: {
      fileName: string;
      title: string;
      relevance: number;
    }[] = [];

    for (const doc of docs) {
      const docContent = await fs.readFile(doc.filePath, 'utf-8');
      const relevance = this.calculateRelevance(content, docContent);

      if (relevance > 0.1) {
        relatedDocs.push({
          fileName: doc.fileName,
          title: doc.title,
          relevance,
        });
      }
    }

    relatedDocs.sort((a, b) => b.relevance - a.relevance);
    return relatedDocs.slice(0, limit);
  }

  /** Calculate relevance between two texts */
  private calculateRelevance(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().match(/\w+/g) || []);
    const words2 = new Set(text2.toLowerCase().match(/\w+/g) || []);

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /** Find documents by tags */
  async findByTags(tags: string[], limit: number = 5): Promise<{
    fileName: string;
    title: string;
    tags: string[];
  }[]> {
    const docs = await this.wikiManager.listDocuments();
    const taggedDocs: {
      fileName: string;
      title: string;
      tags: string[];
    }[] = [];

    for (const doc of docs) {
      const commonTags = doc.tags.filter(tag => tags.includes(tag));
      if (commonTags.length > 0) {
        taggedDocs.push({
          fileName: doc.fileName,
          title: doc.title,
          tags: doc.tags,
        });
      }
    }

    return taggedDocs.slice(0, limit);
  }

  /** Find documents by title keyword */
  async findByTitle(keyword: string, limit: number = 5): Promise<{
    fileName: string;
    title: string;
  }[]> {
    const docs = await this.wikiManager.listDocuments();
    const matchingDocs: {
      fileName: string;
      title: string;
    }[] = [];

    for (const doc of docs) {
      if (doc.title.toLowerCase().includes(keyword.toLowerCase())) {
        matchingDocs.push({
          fileName: doc.fileName,
          title: doc.title,
        });
      }
    }

    return matchingDocs.slice(0, limit);
  }
}