import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A flag requests the release path; the editorial gate remains the authority.
export const publicRelease = process.env.PUBLICATION_MODE === 'public' && process.env.VKV_PUBLIC_RELEASE_BUILD === '1';
export const studioPreviewOrigin = !publicRelease && process.env.VKV_COM_PREVIEW_ORIGIN === 'http://127.0.0.1:4173'
  ? 'http://127.0.0.1:4173' : '';
// Audit metadata is a separate local artifact, never a deployment candidate.
const localAuditOrigin = process.env.VKV_LOCAL_AUDIT_ORIGIN ?? '';
export const localAudit = localAuditOrigin !== '';
if (localAudit && (
  localAuditOrigin !== 'http://127.0.0.1:4323' ||
  process.env.PUBLICATION_MODE !== 'review' ||
  process.env.VKV_PUBLIC_RELEASE_BUILD === '1' ||
  studioPreviewOrigin !== 'http://127.0.0.1:4173' ||
  publicRelease
)) throw new Error('Local audit requires the exact loopback origins, review mode and no public release flag.');
export const indexable = publicRelease || localAudit;
// Origin Trial tokens are public page metadata; Chrome validates their signature and domain.
export const webmcpTrial = process.env.PUBLIC_WEBMCP_ORIGIN_TRIAL?.trim() ?? '';
if (webmcpTrial && (webmcpTrial.length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(webmcpTrial)))
  throw new Error('PUBLIC_WEBMCP_ORIGIN_TRIAL must be a single base64-encoded public token.');
if (publicRelease) {
  const gate = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('./content-gate.mjs', import.meta.url))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', env: process.env,
  });
  if (gate.status !== 0) throw new Error('Public generation requires matching editorial approval.');
}

// Keep Node-only collection selection out of the client module graph.
export const editorialCollectionPath = fileURLToPath(new URL(publicRelease
  ? '../app/data/approved-collection.ts'
  : '../app/data/preview-articles.ts', import.meta.url));
export const approvedArticleSlugs = publicRelease
  ? JSON.parse(readFileSync(new URL('../app/data/approved-articles.json', import.meta.url), 'utf8')).map(article => article.slug)
  : [];
