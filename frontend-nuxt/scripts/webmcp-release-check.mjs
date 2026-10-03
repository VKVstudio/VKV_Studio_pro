import assert from 'node:assert/strict';

/** Checks public metadata only. Chrome remains the authority for the signature. */
export function validateWebMcpTrial(token, origin, { required = false, now = Date.now() } = {}) {
  assert.equal(typeof token, 'string', 'WebMCP trial must be a public token string.');
  const value = token.trim();
  if (!required && !value) return null;
  assert(value && value.length <= 4096 && /^[A-Za-z0-9+/]+={0,2}$/.test(value), 'WebMCP trial is missing or malformed.');
  const raw = Buffer.from(value, 'base64');
  assert.equal(raw.toString('base64'), value, 'WebMCP trial must use canonical base64.');
  assert(raw.length >= 69 && [2, 3].includes(raw[0]), 'Unsupported WebMCP token envelope.');
  assert.equal(raw.readUInt32BE(65), raw.length - 69, 'Invalid WebMCP payload length.');
  const payload = JSON.parse(raw.subarray(69).toString('utf8'));
  assert(payload && typeof payload === 'object' && !Array.isArray(payload), 'Invalid WebMCP payload.');
  const expected = new URL(origin);
  const actual = new URL(payload.origin);
  assert.equal(actual.protocol, 'https:', 'WebMCP release requires HTTPS.');
  assert.equal(actual.origin, expected.origin, 'WebMCP token belongs to another origin.');
  assert(!actual.username && !actual.password && actual.pathname === '/' && !actual.search && !actual.hash, 'Invalid WebMCP origin.');
  assert.equal(payload.feature, 'WebMCP', 'WebMCP token belongs to another feature.');
  assert(payload.isThirdParty !== true, 'Use a first-party WebMCP token.');
  assert(Number.isSafeInteger(payload.expiry) && payload.expiry * 1000 > now + 14 * 86400000, 'WebMCP token has less than fourteen days remaining.');
  return { token: value, origin: actual.origin, expiry: payload.expiry, includesSubdomains: payload.isSubdomain === true };
}

/** Validate emitted HTML, rather than assuming build-time configuration survived. */
export function assertWebMcpTrialHtml(html, expectedToken) {
  // This guard consumes Nuxt-generated HTML. Inert examples and script text
  // must not stand in for the early metadata needed by the browser.
  const activeMarkup = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|textarea|title|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const head = activeMarkup.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head\s*>/i)?.[1] ?? '';
  const metas = head.match(/<meta\s[^>]*>/gi) ?? [];
  const trials = metas.filter(tag => /\shttp-equiv\s*=\s*(["'])origin-trial\1/i.test(tag));
  assert.equal(trials.length, 1, 'Each WebMCP release page must contain exactly one Origin Trial meta tag.');
  const content = trials[0].match(/\scontent\s*=\s*(["'])(.*?)\1/i)?.[2];
  assert.equal(content, expectedToken, 'Emitted WebMCP token differs from the reviewed public token.');
}
