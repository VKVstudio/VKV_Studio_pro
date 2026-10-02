import { articles as selectedArticles } from '#editorial-collection';
import type { Article as PreviewArticle } from './preview-articles';

export type Article = PreviewArticle & {
  language?: 'en';
  publishedAt?: string;
  canonicalUrl?: string;
  mediaRights?: string;
  previewImage?: string;
  author?: string;
  facts?: string;
  interpretation?: string;
  practicalDecision?: string;
  evidenceStatus?: 'source' | 'ours' | 'estimate' | 'unknown';
};

// The validated build configuration selects one collection at compile time.
export const articles: Article[] = selectedArticles;
export { articlePath, canonicalUrl } from './article-links';
