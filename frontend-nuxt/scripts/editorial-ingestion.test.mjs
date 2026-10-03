import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { articles } from '../app/data/preview-articles.ts';
import { validateExport, digest, canonical } from '../../contracts/article-export.mjs';
import { loadApprovedArticles, validateReleaseApproval } from './editorial-ingestion.mjs';

function fixture() {
  const article = { ...structuredClone(articles[0]), eventDate: null, language: 'en', publishedAt: '2026-10-01', author: 'Valerii Karpov', facts: 'Observed delivery.', interpretation: 'Delivery matters.', practicalDecision: 'Measure delivery.', evidenceStatus: 'ours', mediaRights: 'Owner artwork approved.', previewImage: '/images/performance.webp' };
  // The preview has source fragments; public contract requires explicit source URLs.
  article.sources = [{ label: 'Official source', url: 'https://example.org/source' }];
  article.canonicalUrl = `https://vkvstudio.pro/briefings/${article.slug}/`;
  return { schemaVersion: 2, approval: { approvedBy: 'Valerii Karpov', approvedAt: '2026-10-01T10:00:00+00:00', contentSha256: digest(article) }, article };
}
test('strict export accepts exact reviewed v2 copy', () => assert.equal(validateExport(fixture()).language, 'en'));
test('mutated content, v1, private fields, invalid dates and HTML are rejected', () => {
  for (const mutate of [
    (bundle) => { bundle.article.title = 'Changed'; },
    (bundle) => { bundle.schemaVersion = 1; },
    (bundle) => { bundle.article.privateLedger = 'Do not publish'; },
    (bundle) => { bundle.article.publishedAt = '2026-02-30'; },
    (bundle) => { bundle.article.title = '<script>alert(1)</script>'; },
    (bundle) => { bundle.article.service.url = 'https://vkvstudio.com.evil.example/en/services/websites/'; },
    (bundle) => { bundle.article.previewImage = '/images/../../private.png'; },
  ]) { const bundle = fixture(); mutate(bundle); assert.throws(() => validateExport(bundle)); }
});
test('release approval binds the complete exported collection', () => {
  const collection = [fixture().article];
  assert.equal(validateReleaseApproval({ approvedBy: 'Valerii Karpov', contentSha256: digest(collection) }, collection), digest(collection));
  assert.throws(() => validateReleaseApproval({ approvedBy: 'Valerii Karpov', contentSha256: digest(collection) }, [...collection, fixture().article]));
});
test('empty approved collection never falls back to preview during public build', async () => {
  const emptyFrontend = await mkdtemp(join(tmpdir(), 'vkv-empty-approval-'));
  await mkdir(join(emptyFrontend, 'content/approved'), { recursive: true });
  await assert.rejects(loadApprovedArticles(emptyFrontend), /requires backend-approved/);
});
test('Python backend and JavaScript boundary use the same canonical Unicode JSON', () => {
  const data = fixture().article;
  data.title = 'Тест — café';
  const python = process.env.EDITORIAL_TEST_PYTHON ?? 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
  const result = spawnSync(python, ['-c', 'import json,sys; print(json.dumps(json.load(sys.stdin),ensure_ascii=False,sort_keys=True,separators=(",",":")))'], { input: JSON.stringify(data), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const expected = canonical(data);
  const actual = result.stdout.trimEnd();
  assert.equal(actual, expected);
});
