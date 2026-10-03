import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWebMcpTrial, assertWebMcpTrialHtml } from './webmcp-release-check.mjs';

const now = Date.UTC(2026, 9, 3);
const origin = 'https://vkvstudio.pro';
const payload = { origin: `${origin}:443`, feature: 'WebMCP', expiry: now / 1000 + 30 * 86400, isSubdomain: true };
// A synthetic envelope tests validation only; it is never served as a signed token.
function envelope(changes = {}) {
  const body = Buffer.from(JSON.stringify({ ...payload, ...changes }));
  const header = Buffer.alloc(69);
  header[0] = 3;
  header.writeUInt32BE(body.length, 65);
  return Buffer.concat([header, body]).toString('base64');
}
const options = { required: true, now };
test('ordinary builds may leave the optional feature dormant', () => {
  assert.equal(validateWebMcpTrial('', origin), null);
});
test('an explicit feature release fails closed on absent or malformed metadata', () => {
  for (const token of ['', ' ', 'invalid!', Buffer.from('short').toString('base64')])
    assert.throws(() => validateWebMcpTrial(token, origin, options));
});
test('origin, feature, expiry and first-party scope are enforced', () => {
  for (const change of [
    { origin: 'https://vkvstudio.pro.attacker.example' },
    { origin: 'https://vkvstudio.com:443' },
    { origin: `${origin}/path` },
    { feature: 'OtherFeature' },
    { expiry: now / 1000 - 1 },
    { expiry: now / 1000 + 13 * 86400 },
    { expiry: '1800000000' },
    { isThirdParty: true },
  ]) assert.throws(() => validateWebMcpTrial(envelope(change), origin, options));
  assert.equal(validateWebMcpTrial(envelope(), origin, options).origin, origin);
});
test('the selected token must occur once in actual emitted HTML', () => {
  const token = envelope();
  const meta = `<meta http-equiv="origin-trial" content="${token}">`;
  assert.doesNotThrow(() => assertWebMcpTrialHtml(`<head>${meta}</head>`, token));
  for (const html of ['<head></head>', `<head>${meta}${meta}</head>`, `<head>${meta.replace(token, 'another-token')}</head>`])
    assert.throws(() => assertWebMcpTrialHtml(html, token));
});
test('inert examples, data attributes and late body metadata do not satisfy the release gate', () => {
  const token = envelope();
  const meta = `<meta http-equiv="origin-trial" content="${token}">`;
  for (const html of [
    `<head><!--${meta}--></head>`,
    `<head>${meta.replace('http-equiv=', 'data-http-equiv=').replace('content=', 'data-content=')}</head>`,
    `<head>${meta.replace('content=', 'data-content=')}</head>`,
    `<head><script>const example = '${meta}'</script></head>`,
    `<head><noscript>${meta}</noscript></head>`,
    `<head></head><body>${meta}</body>`,
  ]) assert.throws(() => assertWebMcpTrialHtml(html, token));
});
