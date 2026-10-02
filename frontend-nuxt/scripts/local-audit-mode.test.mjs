import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';

// Only public build switches are touched; the test never invokes the real gate.
const ENV_KEYS = ['PUBLICATION_MODE', 'VKV_PUBLIC_RELEASE_BUILD', 'VKV_COM_PREVIEW_ORIGIN', 'VKV_LOCAL_AUDIT_ORIGIN', 'PUBLIC_WEBMCP_ORIGIN_TRIAL'];
const VALID_AUDIT = {
  PUBLICATION_MODE: 'review',
  VKV_COM_PREVIEW_ORIGIN: 'http://127.0.0.1:4173',
  VKV_LOCAL_AUDIT_ORIGIN: 'http://127.0.0.1:4323',
};
const gateStub = 'data:text/javascript,' + encodeURIComponent(
  'export function spawnSync(command, args, options) {' +
  'const probe = globalThis.__vkvLocalAuditGateProbe;' +
  'probe.calls.push({command, args, mode: options.env.PUBLICATION_MODE, release: options.env.VKV_PUBLIC_RELEASE_BUILD});' +
  'return {status: probe.status};' +
  '}',
);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'node:child_process' && context.parentURL?.includes('/scripts/release-config.mjs')) {
      return { url: gateStub, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
after(() => hooks.deregister());

let attempt = 0;
async function readConfig(environment = {}, gateStatus = 0) {
  const previous = new Map(ENV_KEYS.map(key => [key, process.env[key]]));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__vkvLocalAuditGateProbe');
  const probe = { status: gateStatus, calls: [] };
  let config;
  let error;
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(environment)) {
      assert.ok(ENV_KEYS.includes(key), 'Only declared public build switches may be set');
      if (value !== undefined) process.env[key] = value;
    }
    Object.defineProperty(globalThis, '__vkvLocalAuditGateProbe', { value: probe, configurable: true });
    const url = new URL('./release-config.mjs', import.meta.url);
    url.searchParams.set('local-audit-case', String(++attempt));
    try {
      config = await import(url.href);
    } catch (failure) {
      error = failure;
    }
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (descriptor) Object.defineProperty(globalThis, '__vkvLocalAuditGateProbe', descriptor);
    else Reflect.deleteProperty(globalThis, '__vkvLocalAuditGateProbe');
  }
  return { config, error, gateCalls: probe.calls };
}

function expectLocalRejection(result) {
  assert.equal(result.config, undefined);
  assert.ok(result.error instanceof Error);
  assert.match(result.error.message, /Local audit requires/);
  assert.deepEqual(result.gateCalls, [], 'Invalid local mode must fail before the public gate');
}

test('the exact local audit is indexable while retaining review collection and studio preview', async () => {
  const { config, error, gateCalls } = await readConfig(VALID_AUDIT);
  assert.equal(error, undefined);
  assert.equal(config.localAudit, true);
  assert.equal(config.indexable, true);
  assert.equal(config.publicRelease, false);
  assert.equal(config.studioPreviewOrigin, 'http://127.0.0.1:4173');
  assert.ok(config.editorialCollectionPath.endsWith('preview-articles.ts'));
  assert.deepEqual(config.approvedArticleSlugs, []);
  assert.deepEqual(gateCalls, []);
});

test('absent or empty audit opt-in preserves ordinary non-indexable review behavior', async () => {
  for (const environment of [
    {},
    { PUBLICATION_MODE: 'review' },
    { PUBLICATION_MODE: 'review', VKV_PUBLIC_RELEASE_BUILD: '1' },
    { PUBLICATION_MODE: 'public' },
    { ...VALID_AUDIT, VKV_LOCAL_AUDIT_ORIGIN: undefined },
    { ...VALID_AUDIT, VKV_LOCAL_AUDIT_ORIGIN: '' },
  ]) {
    const { config, error, gateCalls } = await readConfig(environment);
    assert.equal(error, undefined);
    assert.equal(config.localAudit, false);
    assert.equal(config.indexable, false);
    assert.equal(config.publicRelease, false);
    assert.ok(config.editorialCollectionPath.endsWith('preview-articles.ts'));
    assert.deepEqual(gateCalls, []);
  }
});

test('audit mode requires explicit review and rejects public, unknown or missing modes before the gate', async () => {
  for (const mode of [undefined, '', 'public', 'preview', 'Review', 'review ', ' review']) {
    expectLocalRejection(await readConfig({ ...VALID_AUDIT, PUBLICATION_MODE: mode }));
  }
  expectLocalRejection(await readConfig({ ...VALID_AUDIT, PUBLICATION_MODE: 'public', VKV_PUBLIC_RELEASE_BUILD: '1' }));
});

test('audit cannot coexist with the public release flag, even in review', async () => {
  expectLocalRejection(await readConfig({ ...VALID_AUDIT, VKV_PUBLIC_RELEASE_BUILD: '1' }));
  for (const flag of [undefined, '', '0']) {
    const { config, error, gateCalls } = await readConfig({ ...VALID_AUDIT, VKV_PUBLIC_RELEASE_BUILD: flag });
    assert.equal(error, undefined);
    assert.equal(config.publicRelease, false);
    assert.equal(config.indexable, true);
    assert.deepEqual(gateCalls, []);
  }
});

test('nonempty malformed or nonexact audit origins fail closed', async () => {
  for (const origin of [
    ' ', '0', 'http://localhost:4323', 'http://127.0.0.1:4323/', 'http://127.0.0.1:4324',
    'https://127.0.0.1:4323', 'http://127.0.0.1:4323/path', 'http://127.0.0.1:4323?audit=1',
    'http://127.0.0.1:4323#fragment', 'http://127.0.0.1:4323@evil.example',
    'http://127.0.0.1.:4323', 'http://[::1]:4323', 'http://127.0.0.1:4323\n',
    'http://user:pass@127.0.0.1:4323', 'https://vkvstudio.pro',
  ]) {
    expectLocalRejection(await readConfig({ ...VALID_AUDIT, VKV_LOCAL_AUDIT_ORIGIN: origin }));
  }
});

test('the commercial preview origin is mandatory and must also match byte-for-byte', async () => {
  for (const origin of [
    undefined, '', 'http://localhost:4173', 'http://127.0.0.1:4173/', 'http://127.0.0.1:4174',
    'https://127.0.0.1:4173', 'http://127.0.0.1:4173/path', 'http://127.0.0.1:4173?audit=1',
    'http://127.0.0.1:4173#fragment', 'http://127.0.0.1:4173@evil.example',
    ' http://127.0.0.1:4173', 'https://vkvstudio.com',
  ]) {
    expectLocalRejection(await readConfig({ ...VALID_AUDIT, VKV_COM_PREVIEW_ORIGIN: origin }));
  }
});

test('canonical public mode remains gated and uses the approved collection without a preview bridge', async () => {
  const publicEnvironment = { PUBLICATION_MODE: 'public', VKV_PUBLIC_RELEASE_BUILD: '1', VKV_COM_PREVIEW_ORIGIN: VALID_AUDIT.VKV_COM_PREVIEW_ORIGIN };
  const { config, error, gateCalls } = await readConfig(publicEnvironment);
  assert.equal(error, undefined);
  assert.equal(config.publicRelease, true);
  assert.equal(config.localAudit, false);
  assert.equal(config.indexable, true);
  assert.equal(config.studioPreviewOrigin, '');
  assert.ok(config.editorialCollectionPath.endsWith('approved-collection.ts'));
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0].command, process.execPath);
  assert.equal(gateCalls[0].args[0], '--experimental-strip-types');
  assert.ok(gateCalls[0].args[1].endsWith('content-gate.mjs'));
  assert.equal(gateCalls[0].mode, 'public');
  assert.equal(gateCalls[0].release, '1');
  for (const status of [1, null]) {
    const denied = await readConfig(publicEnvironment, status);
    assert.equal(denied.config, undefined);
    assert.match(denied.error.message, /matching editorial approval/);
    assert.equal(denied.gateCalls.length, 1);
  }
});

test('configuration imports isolate environment and cache state; audit never changes the Origin Trial token policy', async () => {
  const original = ENV_KEYS.map(key => [key, process.env[key]]);
  const audit = await readConfig({ ...VALID_AUDIT, PUBLIC_WEBMCP_ORIGIN_TRIAL: ' AQ== ' });
  assert.equal(audit.error, undefined);
  assert.equal(audit.config.webmcpTrial, 'AQ==');
  const ordinary = await readConfig({ PUBLICATION_MODE: 'review' });
  assert.equal(ordinary.config.localAudit, false);
  assert.equal(ordinary.config.indexable, false);
  assert.equal(ordinary.config.webmcpTrial, '');
  const invalidToken = await readConfig({ ...VALID_AUDIT, PUBLIC_WEBMCP_ORIGIN_TRIAL: 'invalid token' });
  assert.match(invalidToken.error.message, /single base64-encoded public token/);
  assert.deepEqual(invalidToken.gateCalls, []);
  assert.deepEqual(ENV_KEYS.map(key => [key, process.env[key]]), original);
});
