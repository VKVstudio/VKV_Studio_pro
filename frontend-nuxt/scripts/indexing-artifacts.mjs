import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const siteOrigin = 'https://vkvstudio.pro';
export const publicRoutes = (articles) => ['/', '/briefings/', '/method/', '/studio/', '/privacy/', ...articles.map(({ slug }) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid sitemap slug');
  return `/briefings/${slug}/`;
})];
export const robotsText = (publicRelease) => publicRelease
  ? `User-agent: *\nAllow: /\nDisallow: /200.html\nDisallow: /404.html\nSitemap: ${siteOrigin}/sitemap.xml\n`
  : 'User-agent: *\nDisallow: /\n';
export const sitemapXml = (routes) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((route) => {
  if (!/^\/(?:[a-z0-9-]+\/)*$/.test(route)) throw new Error('Invalid sitemap route');
  return `  <url><loc>${siteOrigin}${route}</loc></url>`;
}).join('\n')}\n</urlset>\n`;

export async function writeIndexingArtifacts(output, routes) {
  // Verify every real page before enabling crawlability or writing the sitemap.
  for (const route of routes) {
    const html = await readFile(join(output, route, 'index.html'), 'utf8');
    if (!/<meta\b[^>]*name="robots"[^>]*content="index, follow"/.test(html) || html.includes('Editorial review · not published')) {
      throw new Error(`Public metadata or review state is wrong for ${route}`);
    }
    if (!html.includes(`rel="canonical" href="${siteOrigin}${route}"`)) throw new Error(`Canonical is wrong for ${route}`);
  }
  // Nuxt fallback shells are not articles or sitemap destinations.
  for (const filename of ['200.html', '404.html']) {
    const path = join(output, filename);
    let html;
    try { html = await readFile(path, 'utf8'); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    html = html.replace(/<meta\b[^>]*name="robots"[^>]*>/gi, '');
    await writeFile(path, html.replace('</head>', '<meta name="robots" content="noindex, nofollow"></head>'));
  }
  await writeFile(join(output, 'sitemap.xml'), sitemapXml(routes));
  await writeFile(join(output, 'robots.txt'), robotsText(true));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.PUBLICATION_MODE !== 'public' || process.env.VKV_PUBLIC_RELEASE_BUILD !== '1') throw new Error('Indexing artifacts require the gated public build.');
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const gate = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/content-gate.mjs'], { cwd, stdio: 'inherit', env: process.env });
  if (gate.status !== 0) process.exit(gate.status ?? 1);
  // This command runs under Node, whose TS loader does not resolve Nuxt's
  // extensionless app imports. The gate already validated this exact export.
  const articles = JSON.parse(await readFile(join(cwd, 'app/data/approved-articles.json'), 'utf8'));
  await writeIndexingArtifacts(resolve(process.argv[2] || join(cwd, '.output/public')), publicRoutes(articles));
  console.log('Public robots and sitemap prepared locally. Deployment still requires owner approval.');
}
