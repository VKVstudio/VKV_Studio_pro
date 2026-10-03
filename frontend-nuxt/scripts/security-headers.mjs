import { addSubresourceIntegrity } from './subresource-integrity.mjs';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

// An explicit output keeps isolated audits from overwriting an earlier build.
const root = resolve(process.argv[2] || '.output/public');
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? htmlFiles(join(directory, entry.name)) : entry.name.endsWith('.html') ? [join(directory, entry.name)] : []));
  return children.flat();
}

// Authorize the exact entry bytes as well as inline code. SRI alone does not
// authorize parser-inserted scripts once strict-dynamic ignores host sources.
const integrity = await addSubresourceIntegrity(root);
if (integrity.externalReferences !== 0) throw new Error('External script/style references require explicit security review');
const hashes = new Set(integrity.scriptHashes.map((hash) => `'${hash}'`));
let inlineScripts = 0;
const files = await htmlFiles(root);
for (const file of files) {
  const html = await readFile(file, 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    if (/\bsrc\s*=/.test(attrs) || /type\s*=\s*["']application\/(?:ld\+json|json)["']/.test(attrs) || !body.trim()) continue;
    hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    inlineScripts++;
  }
  if (/<[^>]+\bon[a-z]+\s*=/i.test(html) || /(?:href|src)\s*=\s*["']javascript:/i.test(html)) throw new Error(`Unsafe attribute or URL in ${relative(root, file)}`);
  if (/<style\b/i.test(html) || /<[^>]+\sstyle\s*=/i.test(html)) throw new Error(`Inline style requires explicit review in ${relative(root, file)}`);
}
if (inlineScripts === 0) throw new Error('No inline scripts found; inspect the Nuxt build before updating the policy');
const csp = [
  "default-src 'none'",
  // self is a fallback only: CSP3 browsers trust hashes and their descendants.
  `script-src 'self' 'strict-dynamic' ${[...hashes].sort().join(' ')}`,
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types vue vkv-pro-jsonld",
  "upgrade-insecure-requests",
].join('; ');
if (Buffer.byteLength(`  Content-Security-Policy: ${csp}`) > 2000) throw new Error('CSP exceeds the deployment header limit');
const headers = [
  '/*',
  `  Content-Security-Policy: ${csp}`,
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Cross-Origin-Resource-Policy: same-origin',
  '  Cross-Origin-Embedder-Policy: require-corp',
  '  Cross-Origin-Opener-Policy: same-origin-allow-popups',
  '  Strict-Transport-Security: max-age=31536000',
  '  X-Frame-Options: DENY',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), display-capture=()',
  '',
  '/_nuxt/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/llms.txt',
  '  Content-Type: text/plain; charset=utf-8',
  '',
  '/agent-skills/*',
  '  Content-Type: text/markdown; profile="urn:air:agent-skills"; charset=utf-8',
  '',
  '/.well-known/*.json',
  '  Content-Type: application/json; charset=utf-8',
  '',
].join('\n');
await writeFile(join(root, '_headers'), headers);
if (process.env.VKV_LOCAL_AUDIT_ORIGIN) {
  const { localAudit } = await import('./release-config.mjs');
  if (localAudit) {
    // This isolated loopback artifact is never a deployment candidate.
    await writeFile(join(root, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /200.html\nDisallow: /404.html\n');
  }
}
console.log(`Generated strict CSP for ${files.length} HTML files and ${hashes.size} unique script hashes.`);
console.log(`SRI: ${integrity.protectedReferences} local script/style references in ${integrity.htmlPages} pages.`);
