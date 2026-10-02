import approvedArticles from './approved-articles.json';
import type { Article } from './articles';

if (approvedArticles.length === 0) {
  throw new Error('Public article collection is empty');
}

export const articles = approvedArticles as Article[];
