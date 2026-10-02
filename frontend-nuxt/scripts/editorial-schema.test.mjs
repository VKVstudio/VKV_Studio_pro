import assert from 'node:assert/strict';
import test from 'node:test';
import { articles } from '../app/data/preview-articles.ts';
import { editorialArticleSchema, editorialProfileSchema, serializeEditorialSchema, trustedEditorialScript } from '../app/utils/editorial-schema.ts';

const allowed = new Set([
  serializeEditorialSchema(editorialProfileSchema),
  ...articles.map(article => serializeEditorialSchema(editorialArticleSchema(article))),
]);

test('trusts only the active profile and article schemas', () => {
  for (const schema of allowed) assert.equal(trustedEditorialScript(schema, allowed), schema);
  const profile = JSON.parse(serializeEditorialSchema(editorialProfileSchema));
  profile.mainEntity.name = 'Unexpected author';
  assert.throws(() => trustedEditorialScript(JSON.stringify(profile), allowed), /outside/);
  profile.mainEntity.name = editorialProfileSchema.mainEntity.name;
  profile.injected = true;
  assert.throws(() => trustedEditorialScript(JSON.stringify(profile), allowed), /outside/);
});

test('rejects executable code, unknown schemas, scalars, invalid and oversized input', () => {
  for (const input of ['alert(1)', '{"@type":"Thing"}', 'null', '"alert(1)"', '[]', '{}', '{']) {
    assert.throws(() => trustedEditorialScript(input, allowed));
  }
  assert.throws(() => trustedEditorialScript(' '.repeat(65537), allowed), /Invalid/);
  assert.throws(() => serializeEditorialSchema({ text: 'x'.repeat(65536) }), /oversized/);
  assert.throws(() => serializeEditorialSchema(undefined), /Invalid/);
});

test('encodes script terminators and separators while preserving literal editorial text', () => {
  const article = { ...articles[0], title: '</script><script>alert(1)</script>\u2028\u2029 — Пример' };
  const schema = editorialArticleSchema(article);
  const encoded = serializeEditorialSchema(schema);
  assert.ok(!encoded.includes('<'));
  assert.ok(!encoded.includes('\u2028'));
  assert.ok(!encoded.includes('\u2029'));
  assert.deepEqual(JSON.parse(encoded), schema);
  assert.equal(trustedEditorialScript(JSON.stringify(schema), new Set([encoded])), encoded);
  assert.throws(() => trustedEditorialScript(encoded, allowed), /outside/);
});

test('canonicalizes formatting without trusting additional fields or reordered content', () => {
  const schema = editorialArticleSchema(articles[0]);
  const canonical = serializeEditorialSchema(schema);
  assert.equal(trustedEditorialScript(JSON.stringify(schema, null, 2), allowed), canonical);
  assert.throws(() => trustedEditorialScript(JSON.stringify([...schema].reverse()), allowed), /outside/);
});

test('publishes dates only for an explicitly published article', () => {
  const draft = { ...articles[0], publishedAt: undefined };
  assert.equal('datePublished' in editorialArticleSchema(draft)[0], false);
  const published = { ...draft, publishedAt: '2026-09-01', checkedAt: '2026-10-02' };
  const schema = editorialArticleSchema(published);
  assert.equal(schema[0].datePublished, '2026-09-01');
  assert.equal(schema[0].dateModified, '2026-10-02');
  assert.equal(schema[1].itemListElement[2].item, schema[0].mainEntityOfPage);
  assert.equal(editorialArticleSchema({ ...published, checkedAt: '2026-08-01' })[0].dateModified, '2026-09-01');
});
