export interface BriefingSearchDocument {
  title: string;
  dek: string;
  category: string;
}

export type BriefingTopic = 'all' | 'ai-search' | 'agents-commerce' | 'local-ai' | 'field-notes';

export interface BriefingArchiveState {
  query: string;
  topic: BriefingTopic;
}

const TOPICS: readonly BriefingTopic[] = ['all', 'ai-search', 'agents-commerce', 'local-ai', 'field-notes'];
export const MAX_BRIEFING_QUERY_LENGTH = 160;

export function readBriefingQuery(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_BRIEFING_QUERY_LENGTH) {
    throw new Error('Use a search phrase of at most 160 characters.');
  }
  if (/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value)) {
    throw new Error('Use a search phrase without control characters.');
  }
  return value.trim();
}

/** The archive and agent tools use the same literal, case-insensitive search. */
export function filterBriefings<T extends BriefingSearchDocument>(
  articles: readonly T[],
  query: unknown,
): T[] {
  const phrase = readBriefingQuery(query).toLowerCase();
  if (!phrase) return [...articles];
  return articles.filter(article =>
    [article.title, article.dek, article.category].some(value => value.toLowerCase().includes(phrase)),
  );
}

/** Invalid URL values fall back to the full archive; they are never forwarded. */
export function readBriefingArchiveState(params: Readonly<Record<string, unknown>>): BriefingArchiveState {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return { query: '', topic: 'all' };
  const rawQuery: unknown = Object.getOwnPropertyDescriptor(params, 'q')?.value;
  const rawTopic: unknown = Object.getOwnPropertyDescriptor(params, 'topic')?.value;
  let query = '';
  if (typeof rawQuery === 'string') {
    try { query = readBriefingQuery(rawQuery); } catch { /* Invalid URL search is ignored. */ }
  }
  const topic = typeof rawTopic === 'string' && TOPICS.some(value => value === rawTopic)
    ? rawTopic as BriefingTopic : 'all';
  return { query, topic };
}

export function briefingSearchParams(value: unknown): Record<string, string> {
  const query = readBriefingQuery(value);
  return query ? { q: query } : {};
}

export function briefingTopicParams(value: unknown): Record<string, string> {
  if (typeof value !== 'string' || !TOPICS.some(topic => topic === value)) {
    throw new Error('Choose an available briefing topic.');
  }
  return value === 'all' ? {} : { topic: value };
}
