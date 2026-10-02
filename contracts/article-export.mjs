import { createHash } from 'node:crypto';

export const OWNER = 'Valerii Karpov';
const arts = new Set(['feature', 'ai', 'performance', 'performance-cache', 'phone-mobile', 'ai-search-fundamentals', 'google-ai-search', 'agents-api', 'sponsored-agents', 'shieldstral', 'nemotron']);
const kinds = new Set(['source', 'ours', 'estimate', 'unknown']);
const fields = ['slug', 'category', 'title', 'dek', 'takeaway', 'eventDate', 'checkedAt', 'minutes', 'art', 'evidence', 'limits', 'sections', 'sources', 'service', 'author', 'facts', 'interpretation', 'practicalDecision', 'evidenceStatus', 'language', 'publishedAt', 'canonicalUrl', 'mediaRights', 'previewImage'];
function require(condition, message) { if (!condition) throw new Error(message); }
function exact(value, required, optional = []) {
  require(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  require(required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => [...required, ...optional].includes(key)), 'Unexpected or missing contract fields');
}
function text(value) {
  require(typeof value === 'string' && value.length <= 20000 && value.trim() && !/[<>\u0000-\u0008\u000b-\u001f]/u.test(value), 'Expected bounded nonempty plain text');
}
function date(value) {
  require(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Invalid ISO date');
}
function url(value, origin) {
  text(value);
  const parsed = new URL(value);
  require(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash && (!origin || parsed.origin === origin), 'Invalid HTTPS URL');
}
// Matches Python ensure_ascii=False, sort_keys=True, compact JSON for this contract.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }

export function validateExport(bundle) {
  exact(bundle, ['schemaVersion', 'approval', 'article']);
  require(bundle.schemaVersion === 2, 'Only contract v2 exports may enter a public build');
  exact(bundle.approval, ['approvedBy', 'approvedAt', 'contentSha256']);
  require(bundle.approval.approvedBy === OWNER, 'Missing owner approval');
  require(typeof bundle.approval.approvedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\+00:00|Z)$/.test(bundle.approval.approvedAt) && !Number.isNaN(Date.parse(bundle.approval.approvedAt)), 'Invalid approval timestamp');
  const article = bundle.article;
  exact(article, fields, ['eventLabel']);
  require(typeof article.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug), 'Invalid slug');
  for (const key of ['category', 'title', 'dek', 'takeaway', 'evidence', 'limits', 'facts', 'interpretation', 'practicalDecision', 'mediaRights']) text(article[key]);
  if (article.eventLabel !== undefined) text(article.eventLabel);
  require(article.author === OWNER && article.language === 'en', 'Invalid author or language');
  date(article.checkedAt); date(article.publishedAt);
  if (article.eventDate !== null) { date(article.eventDate); require(article.eventDate <= article.checkedAt, 'Event follows verification'); }
  require(Number.isInteger(article.minutes) && article.minutes >= 1 && article.minutes <= 60 && arts.has(article.art) && kinds.has(article.evidenceStatus), 'Invalid article classification');
  require(article.canonicalUrl === `https://vkvstudio.pro/briefings/${article.slug}/`, 'Canonical route mismatch');
  require(typeof article.previewImage === 'string' && /^\/images\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg)$/.test(article.previewImage), 'Invalid local preview image');
  require(Array.isArray(article.sections) && article.sections.length >= 2 && article.sections.length <= 20, 'Invalid section count');
  for (const section of article.sections) {
    exact(section, ['heading', 'paragraphs']); text(section.heading);
    require(Array.isArray(section.paragraphs) && section.paragraphs.length > 0 && section.paragraphs.length <= 30, 'Invalid paragraph count');
    section.paragraphs.forEach(text);
  }
  require(Array.isArray(article.sources) && article.sources.length > 0 && article.sources.length <= 100, 'Invalid source count');
  for (const source of article.sources) { exact(source, ['label', 'url']); text(source.label); url(source.url); }
  exact(article.service, ['label', 'url', 'reason']); text(article.service.label); text(article.service.reason); url(article.service.url, 'https://vkvstudio.com');
  require(/^https:\/\/vkvstudio\.com\/en\/services\/[a-z0-9-]+\/$/.test(article.service.url), 'CTA must reference a service route');
  require(bundle.approval.contentSha256 === digest(article), 'Approved digest differs from exported content');
  return article;
}
