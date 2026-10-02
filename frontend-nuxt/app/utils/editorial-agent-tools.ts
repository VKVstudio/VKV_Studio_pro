import type { Article } from '../data/articles';
import { articlePath, canonicalUrl } from '../data/article-links.ts';
import { filterBriefings, readBriefingQuery } from './briefing-search.ts';
import { studioLink, studioPreviewOrigin } from './studio-links.ts';

type EditorialArticle = Pick<Article, 'slug' | 'title' | 'dek' | 'category' | 'checkedAt' | 'sources' | 'canonicalUrl'>;

export interface EditorialToolOptions {
  articles: readonly EditorialArticle[];
  publicRelease: boolean;
  studioPreviewOrigin?: string;
}

export interface EditorialToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

interface ParameterSchema {
  type: 'string' | 'integer';
  description: string;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

export interface EditorialAgentTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required?: string[];
    additionalProperties: false;
  };
  annotations: { readOnlyHint: true; untrustedContentHint: true };
  execute(args?: unknown): Promise<EditorialToolResult>;
}

interface BriefingRecord {
  slug: string;
  title: string;
  url: string;
  status: 'review' | 'published';
  checkedAt: string;
}

interface BriefingSnapshot extends BriefingRecord {
  dek: string;
  category: string;
  sources: { label: string; url: string }[];
  sourceCount: number;
}

const OUTPUT_LIMIT = 1500;
const MAX_PAGE = 1_000_000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class ToolInputError extends Error {}

/** Reject inherited input, accessors and keys omitted from the declared schema. */
function plainRecord(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ToolInputError('Provide a JSON object with the declared parameters.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ToolInputError('Provide a plain JSON object.');
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || (keys && !keys.includes(key))) {
      throw new ToolInputError('Use only the declared parameters.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new ToolInputError('Provide JSON values, without accessors.');
    }
  }
  return value as Record<string, unknown>;
}

function metadataText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum ||
      /[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value)) {
    throw new Error('Invalid editorial reference metadata');
  }
  return value;
}

function metadataDate(value: unknown): string {
  const date = metadataText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid editorial reference date');
  }
  return date;
}

function sourceReference(value: unknown): { label: string; url: string } {
  const source = plainRecord(value);
  const label = metadataText(source.label, 180);
  const href = metadataText(source.url, 800);
  const url = new URL(href);
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (url.protocol !== 'https:' || url.username || url.password ||
      hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname === 'local' || hostname.endsWith('.local') ||
      hostname === 'internal' || hostname.endsWith('.internal') || hostname.startsWith('[') ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    throw new Error('Invalid editorial source URL');
  }
  return { label, url: url.href };
}

function snapshotArticle(value: EditorialArticle, status: BriefingRecord['status']): BriefingSnapshot {
  const article = plainRecord(value);
  const slug = metadataText(article.slug, 96);
  if (!SLUG_PATTERN.test(slug)) throw new Error('Invalid editorial slug');
  const url = canonicalUrl(articlePath(slug));
  if (article.canonicalUrl !== undefined && article.canonicalUrl !== url) {
    throw new Error('Editorial reference must use its canonical URL');
  }
  if (!Array.isArray(article.sources) || article.sources.length > 100) {
    throw new Error('Invalid editorial source list');
  }
  return {
    slug,
    title: metadataText(article.title, 240),
    dek: metadataText(article.dek, 1200),
    category: metadataText(article.category, 120),
    checkedAt: metadataDate(article.checkedAt),
    url,
    status,
    sources: article.sources.slice(0, 2).map(sourceReference),
    sourceCount: article.sources.length,
  };
}

function textResult(data: Record<string, unknown>, isError = false): EditorialToolResult {
  const result: EditorialToolResult = {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    ...(isError ? { isError: true } : {}),
  };
  if (result.content[0]!.text.length > OUTPUT_LIMIT || JSON.stringify(result).length > OUTPUT_LIMIT) {
    throw new Error('Editorial reference exceeds the tool output budget');
  }
  return result;
}

function fitsBudget(data: Record<string, unknown>): boolean {
  try { textResult(data); return true; } catch { return false; }
}

function listing(article: BriefingSnapshot): BriefingRecord {
  const { slug, title, url, status, checkedAt } = article;
  return { slug, title, url, status, checkedAt };
}

/** Split at whole records, including JSON escaping and MCP envelope overhead. */
function listingPages(records: BriefingRecord[]): BriefingRecord[][] {
  const pages: BriefingRecord[][] = [];
  let page: BriefingRecord[] = [];
  for (const record of records) {
    const candidate = [...page, record];
    if (page.length && (page.length === 2 || !fitsBudget({
      page: MAX_PAGE, totalPages: MAX_PAGE, total: records.length, items: candidate, nextPage: MAX_PAGE,
    }))) {
      pages.push(page);
      page = [];
    }
    if (!fitsBudget({ page: MAX_PAGE, totalPages: MAX_PAGE, total: records.length, items: [record], nextPage: MAX_PAGE })) {
      throw new Error('Editorial listing record exceeds its output budget');
    }
    page.push(record);
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}

function reference(article: BriefingSnapshot): Record<string, unknown> {
  let result: Record<string, unknown> = {
    ...listing(article),
    sourceCount: article.sourceCount,
    sources: [],
    note: 'Read the briefing page for evidence, limitations and the complete source list.',
  };
  const sources: BriefingSnapshot['sources'] = [];
  for (const source of article.sources) {
    const candidate = { ...result, sources: [...sources, source] };
    if (!fitsBudget(candidate)) break;
    sources.push(source);
    result = candidate;
  }
  if (article.sourceCount && !sources.length) {
    throw new Error('Editorial source reference exceeds its output budget');
  }
  return result;
}

function tool(
  name: string,
  description: string,
  properties: Record<string, ParameterSchema>,
  handler: (args: Record<string, unknown>) => Record<string, unknown>,
  required?: string[],
): EditorialAgentTool {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties, ...(required ? { required } : {}), additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async execute(args: unknown = {}): Promise<EditorialToolResult> {
      try {
        return textResult(handler(plainRecord(args, Object.keys(properties))));
      } catch (error) {
        return textResult({
          error: error instanceof ToolInputError ? error.message : 'This reference is unavailable. Read the archive or method page.',
        }, true);
      }
    },
  };
}

/** Pure definitions: only the compile-time selected collection is passed in. */
export function createEditorialAgentTools(options: EditorialToolOptions): EditorialAgentTool[] {
  if (typeof options.publicRelease !== 'boolean' || !Array.isArray(options.articles) ||
      options.articles.length > 10000) throw new Error('Invalid editorial tool configuration');
  const status = options.publicRelease ? 'published' : 'review';
  const articles = options.articles.map(article => snapshotArticle(article, status));
  if (new Set(articles.map(article => article.slug)).size !== articles.length) {
    throw new Error('Duplicate editorial slug');
  }
  const previewOrigin = studioPreviewOrigin(options.studioPreviewOrigin, options.publicRelease);
  return [
    tool(
      'list_briefings',
      'Find active briefings by a literal phrase in the title, introduction or category. Returns complete short references, explicit review or published status, and a next page number when more results remain.',
      {
        query: { type: 'string', description: 'Optional literal search phrase; empty returns all active briefings.', maxLength: 160 },
        page: { type: 'integer', description: 'Result page, starting at 1. Follow nextPage to continue.', minimum: 1, maximum: MAX_PAGE },
      },
      args => {
        let query: string;
        try { query = readBriefingQuery(args.query === undefined ? '' : args.query); }
        catch (error) { throw new ToolInputError(error instanceof Error ? error.message : 'Invalid search phrase.'); }
        const page = args.page === undefined ? 1 : args.page;
        if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
          throw new ToolInputError('Use a whole page number between 1 and 1000000.');
        }
        const records = filterBriefings(articles, query).map(listing);
        const pages = listingPages(records);
        if (page > pages.length) throw new ToolInputError('This page is outside the results. Start at page 1 and follow nextPage.');
        return { page, totalPages: pages.length, total: records.length, items: pages[page - 1]!, nextPage: page < pages.length ? page + 1 : null };
      },
    ),
    tool(
      'get_briefing_reference',
      'Read an active briefing reference by its exact archive slug. Returns its canonical URL, complete title, verification date, review or published status, and initial source links. The page contains the full evidence and limitations.',
      { slug: { type: 'string', description: 'Exact active slug returned by list_briefings, without a URL or path.', maxLength: 96, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' } },
      args => {
        if (typeof args.slug !== 'string' || args.slug.length > 96 || !SLUG_PATTERN.test(args.slug)) {
          throw new ToolInputError('Use the exact active briefing slug, without a URL or path.');
        }
        const article = articles.find(item => item.slug === args.slug);
        if (!article) throw new ToolInputError('No active briefing has this slug. Use list_briefings to find a reference.');
        return reference(article);
      },
      ['slug'],
    ),
    tool(
      'get_editorial_routes',
      'Get the canonical reading routes for VKVstudio.pro: home, briefing archive, editorial method, studio and privacy. Includes the active collection status.',
      {},
      () => ({
        status,
        routes: [
          { name: 'Home', url: canonicalUrl('/') },
          { name: 'Briefing archive', url: canonicalUrl('/briefings/') },
          { name: 'Editorial method', url: canonicalUrl('/method/') },
          { name: 'Studio', url: canonicalUrl('/studio/') },
          { name: 'Privacy', url: canonicalUrl('/privacy/') },
        ],
      }),
    ),
    tool(
      'get_studio_services',
      'Get VKVstudio commercial services, trust and written contact links. Returns the configured studio destinations for this build; later contact remains a reader decision.',
      {},
      () => ({
        communication: 'Project correspondence in English; scope agreed in writing.',
        routes: [
          { name: 'Services', url: studioLink('/en/services/', previewOrigin) },
          { name: 'Written contact', url: studioLink('/en/contact/', previewOrigin) },
          { name: 'Trust and process', url: studioLink('/en/trust/', previewOrigin) },
        ],
      }),
    ),
  ];
}
