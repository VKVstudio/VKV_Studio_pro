import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { articles as previewArticles } from '../app/data/preview-articles.ts';
import { loadApprovedArticles } from './editorial-ingestion.mjs';
import { verifyPublicRelease } from './release-integrity.mjs';

const generated = new URL('../app/data/approved-articles.json', import.meta.url);
// A failed gate cannot leave a previously staged public collection active.
await writeFile(generated, '[]\n', 'utf8');
try {
  const mode = process.env.PUBLICATION_MODE;
  if (mode !== undefined && !['public', 'review'].includes(mode)) throw new Error('Unknown publication mode');
  if (mode === 'public') {
    const articles = await loadApprovedArticles(fileURLToPath(new URL('../', import.meta.url)));
    const approval = JSON.parse(await readFile(new URL('../publication-approval.json', import.meta.url), 'utf8'));
    await verifyPublicRelease(fileURLToPath(new URL('../', import.meta.url)), articles, approval);
    await writeFile(generated, `${JSON.stringify(articles, null, 2)}\n`, 'utf8');
    console.log(`Content gate passed: ${articles.length} backend-approved articles with exact owner release approval.`);
  } else {
    const slugs = new Set();
    for (const article of previewArticles) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) || slugs.has(article.slug)) throw new Error('Invalid or duplicate preview slug');
      slugs.add(article.slug);
      for (const key of ['title', 'dek', 'takeaway', 'evidence', 'limits', 'category', 'checkedAt']) {
        if (typeof article[key] !== 'string' || !article[key].trim()) throw new Error(`${article.slug}: missing ${key}`);
      }
      if (!Array.isArray(article.sections) || article.sections.length < 2 || !article.sources.length) throw new Error(`${article.slug}: incomplete preview`);
      for (const source of article.sources) if (new URL(source.url).protocol !== 'https:') throw new Error('Preview source must use HTTPS');
      if (new URL(article.service.url).origin !== 'https://vkvstudio.com') throw new Error('Preview CTA must use VKVstudio.com');
    }
    console.log(`Content gate passed: ${previewArticles.length} articles in local review mode.`);
  }
} catch (error) {
  console.error(`Content gate failed: ${error.message}`);
  process.exitCode = 1;
}
