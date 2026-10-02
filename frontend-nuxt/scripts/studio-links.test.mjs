import test from 'node:test';
import assert from 'node:assert/strict';
import { studioLink, studioPreviewOrigin } from '../app/utils/studio-links.ts';

test('only the exact opt-in loopback origin is used for a review build', () => {
  const origin = 'http://127.0.0.1:4173';
  assert.equal(studioPreviewOrigin(origin, false), origin);
  for (const value of [undefined, '', 'http://localhost:4173', origin + '/', origin + '@evil.invalid', 'https://evil.invalid', 'http://127.0.0.1:4174']) {
    assert.equal(studioPreviewOrigin(value, false), '');
  }
  assert.equal(studioPreviewOrigin(origin, true), '');
});

test('review navigation preserves the service, fragment and briefing context', () => {
  assert.equal(studioLink('https://vkvstudio.com/en/services/rag-pilot/#scope', 'http://127.0.0.1:4173', 'agents-api-still-needs-a-boundary'),
    'http://127.0.0.1:4173/en/services/rag-pilot/?source=pro&briefing=agents-api-still-needs-a-boundary#scope');
  assert.equal(studioLink('/en/contact/', ''), 'https://vkvstudio.com/en/contact/');
});

test('primary sources stay intact and invalid protocols or credentials do not become links', () => {
  const source = 'https://developers.google.com/search/docs/appearance/ai-features';
  assert.equal(studioLink(source, 'http://127.0.0.1:4173'), source);
  for (const destination of ['javascript:alert(1)', 'data:text/html,example', 'https://user:pass@vkvstudio.com/en/']) {
    assert.equal(studioLink(destination), '#');
  }
  assert.equal(studioLink('/en/', 'https://evil.invalid', '../../private'), 'https://vkvstudio.com/en/');
  assert.equal(studioLink('https://vkvstudio.com//evil.invalid/path', 'http://127.0.0.1:4173'),
    'http://127.0.0.1:4173//evil.invalid/path');
});
