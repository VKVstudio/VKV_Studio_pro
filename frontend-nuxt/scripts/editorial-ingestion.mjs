import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { validateExport, digest, OWNER } from '../../contracts/article-export.mjs';

export async function loadApprovedArticles(frontendRoot) {
  const directory = resolve(frontendRoot, 'content/approved');
  const root = await realpath(directory);
  if (root !== directory) throw new Error('Approved export directory cannot be a symlink');
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  if (!names.length) throw new Error('Public build requires backend-approved contract v2 exports');
  if (names.length > 200) throw new Error('Approved collection exceeds 200 articles');
  const articles = [];
  const slugs = new Set();
  let totalBytes = 0;
  for (const name of names) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(name)) throw new Error('Invalid export filename');
    const path = resolve(directory, name);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw new Error('Exports must be regular JSON files up to 1 MiB');
    totalBytes += info.size;
    if (totalBytes > 20 * 1024 * 1024) throw new Error('Approved collection exceeds 20 MiB');
    const article = validateExport(JSON.parse(await readFile(path, 'utf8')));
    if (name !== `${article.slug}.json` || slugs.has(article.slug)) throw new Error('Duplicate or mismatched export slug');
    slugs.add(article.slug);
    const publicRoot = await realpath(resolve(frontendRoot, 'public'));
    const image = await realpath(resolve(publicRoot, `.${article.previewImage}`));
    if (!image.startsWith(`${publicRoot}${sep}`) || !(await lstat(image)).isFile()) throw new Error('Preview image must exist inside public');
    articles.push(article);
  }
  return articles;
}

export function validateReleaseApproval(approval, articles) {
  const contentSha256 = digest(articles);
  if (!approval || Object.keys(approval).sort().join(',') !== 'approvedBy,contentSha256' || approval.approvedBy !== OWNER || approval.contentSha256 !== contentSha256) {
    throw new Error(`Public build needs owner release approval for contentSha256 ${contentSha256}`);
  }
  return contentSha256;
}
