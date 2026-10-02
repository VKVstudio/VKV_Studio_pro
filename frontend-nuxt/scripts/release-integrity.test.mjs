import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, digest, OWNER } from '../../contracts/article-export.mjs';
import { releaseManifest, verifyReleaseSignature } from './release-integrity.mjs';

// Ephemeral synthetic test keys in memory; no deployment identity/credential created.
const keys = generateKeyPairSync('ed25519');
const trust = { keys: [{ id: 'test-owner', subject: OWNER, canApproveRelease: true, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) }] };
function approval(manifest) {
  const payload = { schemaVersion: 1, approvedBy: OWNER, keyId: 'test-owner', revision: 'test-revision', approvedAt: '2026-10-01T10:00:00Z', manifestSha256: digest(manifest) };
  return { payload, signature: sign(null, Buffer.from(canonical(payload)), keys.privateKey).toString('base64') };
}
test('approval requires trusted signer; name, digest or substituted key are insufficient', () => {
  const manifest = { schemaVersion: 1, contentSha256: 'test', media: [] };
  assert.equal(verifyReleaseSignature(approval(manifest), manifest, trust), manifest);
  const forged = approval(manifest); forged.payload.revision = 'altered';
  assert.throws(() => verifyReleaseSignature(forged, manifest, trust));
  assert.throws(() => verifyReleaseSignature(approval(manifest), manifest, { keys: [] }));
  assert.throws(() => verifyReleaseSignature({ approvedBy: OWNER, contentSha256: digest(manifest) }, manifest, trust));
  assert.throws(() => verifyReleaseSignature(approval(manifest), manifest, { keys: [{ ...trust.keys[0], revoked: true }] }));
});
test('release binds rendered media bytes and requires per-slug OG', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vkv-release-test-'));
  try {
    await mkdir(join(root, 'public/og'), { recursive: true });
    await mkdir(join(root, 'public/images'), { recursive: true });
    for (const file of ['vkv-logo-compact.webp', 'og/home.png', 'og/story.png', 'images/story.webp']) await writeFile(join(root, 'public', file), 'test image');
    const articles = [{ slug: 'story', previewImage: '/images/story.webp' }];
    const before = await releaseManifest(root, articles);
    const signed = approval(before);
    await writeFile(join(root, 'public/images/story.webp'), 'changed bytes, same URL');
    const after = await releaseManifest(root, articles);
    assert.throws(() => verifyReleaseSignature(signed, after, trust));
    await assert.rejects(releaseManifest(root, [{ slug: 'missing-og', previewImage: '/images/story.webp' }]));
  } finally { await rm(root, { recursive: true, force: true }); }
});
