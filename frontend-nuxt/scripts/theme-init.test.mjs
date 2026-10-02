import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const code = await readFile(new URL('../public/theme-init.js', import.meta.url), 'utf8');
function initialize({ stored = null, systemLight = false, art = null, storageThrows = false } = {}) {
  const links = [];
  const document = {
    documentElement: { dataset: {} },
    querySelector(selector) {
      if (selector === 'meta[name="vkv-pro-preload-art"]' && art !== null) return { getAttribute: () => art };
      return null;
    },
    createElement(tag) { assert.equal(tag, 'link'); return {}; },
    head: { appendChild(link) { links.push(link); } },
  };
  vm.runInNewContext(code, {
    document,
    localStorage: { getItem() { if (storageThrows) throw new Error('Storage unavailable'); return stored; } },
    window: { matchMedia: () => ({ matches: systemLight, addEventListener() {} }) },
  });
  return { theme: document.documentElement.dataset.theme, links };
}

test('preload respects an explicit theme even when the system differs', () => {
  for (const [stored, systemLight, variant] of [['light', false, 'day'], ['dark', true, 'night']]) {
    const result = initialize({ stored, systemLight, art: 'performance-cache' });
    assert.equal(result.theme, stored);
    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].href, `/images/performance-cache-${variant}.webp`);
    assert.equal(result.links[0].rel, 'preload');
    assert.equal(result.links[0].as, 'image');
    assert.equal(result.links[0].fetchPriority, 'high');
  }
});

test('system theme works without stored preferences or available storage', () => {
  for (const systemLight of [false, true]) {
    const result = initialize({ systemLight, storageThrows: true, art: 'phone-mobile' });
    assert.equal(result.theme, systemLight ? 'light' : 'dark');
    assert.equal(result.links[0].href, `/images/phone-mobile-${systemLight ? 'day' : 'night'}.webp`);
  }
});

test('only fixed same-origin art names can start an image preload', () => {
  for (const art of [null, '', '../private', '//outside.example/image', 'https://outside.example/image', 'performance-cache?x=1', 'performance-cache/../private', '<script>', '__proto__']) {
    assert.equal(initialize({ art }).links.length, 0);
  }
});

test('ordinary pages add no archive image request and invalid preferences fall back', () => {
  const result = initialize({ stored: 'unexpected', systemLight: true });
  assert.equal(result.theme, 'light');
  assert.equal(result.links.length, 0);
});
