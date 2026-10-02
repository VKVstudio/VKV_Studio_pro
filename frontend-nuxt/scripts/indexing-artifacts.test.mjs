import test from 'node:test';
import assert from 'node:assert/strict';
import { robotsText, publicRoutes, sitemapXml } from './indexing-artifacts.mjs';

test('preview blocks crawling and never advertises a sitemap', () => {
  assert.equal(robotsText(false), 'User-agent: *\nDisallow: /\n');
});
test('public sitemap contains real canonical routes only', () => {
  const routes = publicRoutes([{ slug: 'an-approved-briefing' }]);
  const xml = sitemapXml(routes);
  assert.equal(routes.length, 6);
  assert.ok(xml.includes('<loc>https://vkvstudio.pro/privacy/</loc>'));
  assert.ok(xml.includes('<loc>https://vkvstudio.pro/briefings/an-approved-briefing/</loc>'));
  assert.ok(!xml.includes('404.html'));
  assert.ok(robotsText(true).includes('Sitemap: https://vkvstudio.pro/sitemap.xml'));
});
test('sitemap paths reject markup and path traversal', () => {
  assert.throws(() => publicRoutes([{ slug: '../private' }]));
  assert.throws(() => sitemapXml(['/briefings/<script>/']));
  assert.throws(() => sitemapXml(['https://other.example/']));
});
