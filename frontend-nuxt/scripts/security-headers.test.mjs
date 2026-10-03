import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { addSubresourceIntegrity } from './subresource-integrity.mjs';

const generator = fileURLToPath(new URL('./security-headers.mjs', import.meta.url));
const inline = 'document.documentElement.dataset.fixture = "ready";';
const entry = 'export const fixture = true;';
const css = 'body { color: black; }';
const digest = (body, algorithm = 'sha384') => `${algorithm}-${createHash(algorithm).update(body).digest('base64')}`;
const html = (tags) => `<!doctype html><html><head>${tags}<script>${inline}</script></head><body>Fixture</body></html>`;
async function fixture(tags = '<script type="module" src="/entry.js"></script><link rel="stylesheet" href="/entry.css">') {
  const root = await mkdtemp(join(tmpdir(), 'vkv-pro-csp-'));
  await writeFile(join(root, 'index.html'), html(tags));
  await writeFile(join(root, 'entry.js'), entry);
  await writeFile(join(root, 'entry.css'), css);
  // Preserve only these synthetic fixtures under the owner's no-delete rule.
  return root;
}
function generate(root) {
  return spawnSync(process.execPath, [generator, root], {
    env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
    encoding: 'utf8', windowsHide: true,
  });
}

test('strict CSP authorizes every entry with matching SRI, without trusting stylesheet hashes', async () => {
  const root = await fixture();
  const result = generate(root);
  assert.equal(result.status, 0, result.stderr);
  const headers = await readFile(join(root, '_headers'), 'utf8');
  const built = await readFile(join(root, 'index.html'), 'utf8');
  assert.ok(headers.includes("'strict-dynamic'"));
  assert.ok(headers.includes(`'${digest(entry)}'`));
  assert.ok(headers.includes(`'${digest(inline, 'sha256')}'`));
  assert.ok(!headers.includes(digest(css)));
  assert.ok(built.includes(`integrity="${digest(entry)}"`));
  assert.ok(built.includes(`integrity="${digest(css)}"`));
  assert.ok(headers.includes("base-uri 'none'"));
  assert.ok(headers.includes("require-trusted-types-for 'script'"));
  assert.ok(!headers.includes('unsafe-inline') && !headers.includes('unsafe-eval'));
  assert.ok(Buffer.byteLength(headers.split('\n')[1]) <= 2000);
  assert.equal(generate(root).status, 0, 'Post-build pass must be idempotent');
});

test('tampered asset fails rather than silently renewing an existing integrity value', async () => {
  const root = await fixture();
  await addSubresourceIntegrity(root);
  await writeFile(join(root, 'entry.js'), entry + '\nthrow new Error("tampered");');
  const result = generate(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Stale asset integrity/);
});

for (const [name, tags, error] of [
  ['third-party entry', '<script src="https://example.invalid/entry.js"></script>', /External script/],
  ['duplicate attributes', '<script src="/entry.js" src="/entry.js"></script>', /Duplicate/],
  ['escaped asset URL', '<script src="/%2e%2e/entry.js"></script>', /Unsupported/],
  ['inline handler', '<button onclick="alert(1)">Run</button>', /Unsafe attribute/],
  ['inline style', '<style>body { color: red; }</style>', /Inline style/],
]) test(`rejects ${name}`, async () => {
  const result = generate(await fixture(tags));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, error);
});

test('JSON data does not gain executable hash authorization', async () => {
  const data = '{"@context":"https://schema.org","@type":"WebSite","name":"Fixture"}';
  const root = await fixture(`<script type="application/ld+json">${data}</script><script src="/entry.js"></script>`);
  assert.equal(generate(root).status, 0);
  const headers = await readFile(join(root, '_headers'), 'utf8');
  assert.ok(!headers.includes(digest(data, 'sha256')));
});
