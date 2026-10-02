import type { Article } from '../data/articles';
import { articlePath, canonicalUrl } from '../data/article-links.ts';
import markets from '../data/markets.json' with { type: 'json' };

export const editorialProfileSchema = {
  '@context': 'https://schema.org', '@type': 'ProfilePage',
  audience: {
    '@type': 'BusinessAudience', name: 'B2B decision-makers',
    geographicArea: markets.map(market => ({ '@type': 'Country', name: market.en, identifier: market.code })),
  },
  mainEntity: { '@type': 'Person', name: 'Valerii Karpov', url: canonicalUrl('/studio/'), worksFor: { '@type': 'Organization', name: 'VKV Studio', url: 'https://vkvstudio.com/' } },
};

export function editorialArticleSchema(article: Article) {
  const url = canonicalUrl(articlePath(article.slug));
  const publishedAt = article.publishedAt;
  return [{
    '@context': 'https://schema.org', '@type': 'Article',
    headline: article.title, description: article.dek, inLanguage: 'en',
    mainEntityOfPage: url, image: canonicalUrl(`/og/${article.slug}.png`),
    author: { '@type': 'Person', name: 'Valerii Karpov', url: canonicalUrl('/studio/') },
    publisher: { '@type': 'Organization', name: 'VKV Studio', url: 'https://vkvstudio.com/' },
    ...(publishedAt ? { datePublished: publishedAt, dateModified: article.checkedAt > publishedAt ? article.checkedAt : publishedAt } : {}),
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: canonicalUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Briefings', item: canonicalUrl('/briefings/') },
      { '@type': 'ListItem', position: 3, name: article.title, item: url },
    ],
  }];
}

export function serializeEditorialSchema(schema: unknown): string {
  const json = JSON.stringify(schema);
  if (typeof json !== 'string' || json.length > 65536) throw new Error('Invalid or oversized editorial schema');
  return json.replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

// Only exact schemas produced from the active, validated collection are trusted.
export function trustedEditorialScript(input: string, allowed: ReadonlySet<string>): string {
  if (typeof input !== 'string' || input.length > 65536) throw new Error('Invalid editorial script input');
  const canonical = serializeEditorialSchema(JSON.parse(input));
  if (!allowed.has(canonical)) throw new Error('Editorial script is outside the active schema collection');
  return canonical;
}
