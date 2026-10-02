import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { canonical, digest, OWNER } from '../../contracts/article-export.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function releaseManifest(frontendRoot, articles) {
  if (!articles.length || articles.length > 200) throw new Error('Release needs 1–200 approved articles');
  const root = await realpath(resolve(frontendRoot, 'public'));
  const files = new Set(['/vkv-logo-compact.webp', '/og/home.png']);
  // The composition renders theme artwork from CSS, not only previewImage.
  for (const article of articles) {
    files.add(article.previewImage);
    files.add(`/og/${article.slug}.png`);
  }
  // Bind all shipped public visual bytes, including CSS-selected theme/section art.
  const { readdir } = await import('node:fs/promises');
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Public release cannot contain symlinks');
      if (entry.isDirectory()) await walk(absolute);
      else if (/\.(?:webp|png|jpg|jpeg|avif|svg)$/i.test(entry.name)) files.add('/' + absolute.slice(root.length + 1).replaceAll('\\', '/'));
    }
  }
  await walk(root);
  if (files.size > 1000) throw new Error('Release media count exceeds limit');
  const media = [];
  let total = 0;
  for (const url of [...files].sort()) {
    if (typeof url !== 'string' || !/^\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg|jpeg|avif|svg)$/.test(url)) throw new Error('Invalid release media path');
    const file = resolve(root, `.${url}`);
    const info = await lstat(file);
    const actual = await realpath(file);
    if (!info.isFile() || info.isSymbolicLink() || !actual.startsWith(root + sep) || info.size > 20 * 1024 * 1024) throw new Error('Invalid or oversized release media');
    const bytes = await readFile(file);
    total += bytes.length;
    if (total > 200 * 1024 * 1024) throw new Error('Release media exceeds 200 MiB');
    media.push({ url, sha256: sha256(bytes), bytes: bytes.length });
  }
  return { schemaVersion: 1, contentSha256: digest(articles), media };
}

// Trust keys are operator-controlled configuration, never taken from the approval.
export function verifyReleaseSignature(approval, manifest, trust) {
  const payload = approval?.payload;
  const exact = (value, keys) => value && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
  if (!exact(approval, ['payload', 'signature']) || !exact(payload, ['schemaVersion', 'approvedBy', 'keyId', 'revision', 'approvedAt', 'manifestSha256'])
    || payload.schemaVersion !== 1 || payload.approvedBy !== OWNER
    || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(payload.keyId ?? '')
    || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(payload.revision ?? '')
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(payload.approvedAt ?? '')
    || !Number.isFinite(Date.parse(payload.approvedAt)) || payload.manifestSha256 !== digest(manifest)
    || typeof approval.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(approval.signature)) throw new Error('Invalid signed release approval');
  const trusted = trust?.keys?.find((key) => key.id === payload.keyId && key.subject === OWNER && key.canApproveRelease === true && key.revoked !== true);
  if (!trusted) throw new Error('Release approver is not trusted');
  const key = createPublicKey(trusted.publicKey);
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(canonical(payload)), key, Buffer.from(approval.signature, 'base64'))) throw new Error('Release signature verification failed');
  return manifest;
}

export async function verifyPublicRelease(frontendRoot, articles, approval) {
  const trustPath = resolve(frontendRoot, 'publication-trust.json');
  const info = await lstat(trustPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024) throw new Error('Invalid publication trust configuration');
  const trust = JSON.parse(await readFile(trustPath, 'utf8'));
  return verifyReleaseSignature(approval, await releaseManifest(frontendRoot, articles), trust);
}
