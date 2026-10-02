import fs from 'node:fs';
import { createHash } from 'node:crypto';

if (process.argv.length !== 3) {
  console.error('Usage: node candidate-digest.mjs <local-candidate.json>');
  process.exitCode = 2;
} else {
  const candidate = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const keys = ['id', 'slug', 'sourceUrl', 'sourceDate', 'topic', 'reason', 'sourceLicence', 'sourceExcerpt'];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || Object.keys(candidate).sort().join('|') !== keys.sort().join('|')) {
    throw new Error('Expected exactly the eight v2 candidate fields');
  }
  const canonical = JSON.stringify(Object.fromEntries(keys.sort().map((key) => [key, candidate[key]])));
  console.log(createHash('sha256').update(canonical, 'utf8').digest('hex'));
}
