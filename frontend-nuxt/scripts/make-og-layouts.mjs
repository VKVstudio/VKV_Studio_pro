import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { articles as previewArticles } from '../app/data/preview-articles.ts';
const approvedArticles = JSON.parse(await readFile(new URL('../app/data/approved-articles.json', import.meta.url), 'utf8'));
const articles = approvedArticles.length ? approvedArticles : previewArticles;

const art = { feature: 'editorial-graphite.webp', ai: 'article-ai-search-lens.webp', performance: 'article-performance-path.webp', 'performance-cache': 'performance-cache-night.webp', 'phone-mobile': 'phone-mobile-night.webp', 'ai-search-fundamentals': 'ai-search-fundamentals-night.webp', 'google-ai-search': 'google-ai-search-night.webp', 'agents-api': 'agents-api-night.webp', 'sponsored-agents': 'sponsored-agents-night.webp', shieldstral: 'shieldstral-night.webp', nemotron: 'nemotron-night.webp' };
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await mkdir('artifacts', { recursive: true });
const layouts = [{ slug: 'home', category: 'AI / SEARCH / WEB', title: 'When the story changes, what should you do?', art: 'feature' }, ...articles];
for (const article of layouts) {
  const bitmap = await readFile(resolve('public/images', art[article.art]));
  const logo = await readFile(resolve('public/vkv-logo-compact.webp'));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1200, initial-scale=1"><style>
    *{box-sizing:border-box}html,body{width:1200px;height:627px;margin:0}body{overflow:hidden;background:#0d1011;color:#f1f1eb;font-family:'Avenir Next','Segoe UI',sans-serif}
    .art{position:absolute;inset:0 0 0 auto;width:62%;background:url(data:image/webp;base64,${bitmap.toString('base64')}) center/cover no-repeat;filter:saturate(.85)}
    .wash{position:absolute;inset:0;background:linear-gradient(90deg,#0d1011 0%,#0d1011 33%,#0d1011ed 46%,#0d101185 70%,#0d10111f 100%)}
    .line{position:absolute;top:40px;left:44px;right:44px;height:1px;background:#8adbd1a3}
    .kicker{position:absolute;top:65px;left:48px;color:#8adbd1;text-transform:uppercase;font:16px/1.3 Consolas,monospace;letter-spacing:.1em}
    h1{position:absolute;top:147px;left:44px;max-width:735px;margin:0;font-size:64px;line-height:1.04;letter-spacing:-.065em;font-weight:760;text-wrap:balance;text-shadow:0 2px 28px #0d1011}
    .brand{position:absolute;bottom:54px;left:48px;display:flex;align-items:center;gap:17px;font-size:25px;font-weight:800;letter-spacing:-.05em}.brand img{width:65px;height:auto}.brand b{color:#8adbd1}.foot{position:absolute;right:48px;bottom:64px;color:#d6e9e5;font:15px/1 Consolas,monospace;letter-spacing:.08em;text-shadow:0 2px 20px #0d1011}
    </style></head><body><div class="art"></div><div class="wash"></div><div class="line"></div><div class="kicker">${escape(article.category)}</div><h1>${escape(article.title)}</h1><div class="brand"><img src="data:image/webp;base64,${logo.toString('base64')}" alt=""><span>VKVstudio<b>.pro</b></span></div><div class="foot">SIGNAL / EVIDENCE / DECISION</div></body></html>`;
  await writeFile(resolve('artifacts', `og-${article.slug}.html`), html);
}
console.log(`Prepared ${layouts.length} 1200×627 OG layouts for browser rendering.`);
