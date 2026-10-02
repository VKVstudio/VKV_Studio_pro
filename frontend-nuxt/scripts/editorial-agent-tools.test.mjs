import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createEditorialAgentTools } from '../app/utils/editorial-agent-tools.ts';
import { briefingSearchParams, briefingTopicParams, filterBriefings, readBriefingArchiveState, readBriefingQuery } from '../app/utils/briefing-search.ts';

// Read review fixtures in the test runner; production imports only the selected alias.
const reviewText = fs.readFileSync(new URL('../app/data/preview-articles.ts', import.meta.url), 'utf8');
const marker = 'export const articles: Article[] = ';
const start = reviewText.indexOf(marker) + marker.length;
const end = reviewText.indexOf('\n];', start) + 3;
assert.ok(start >= marker.length && end > start);
const reviewArticles = JSON.parse(reviewText.slice(start, end).trim().replace(/;$/, ''));
const options = { articles: reviewArticles, publicRelease: false };
const tools = createEditorialAgentTools(options);
const getTool = (name, collection = tools) => {
  const found = collection.find(tool => tool.name === name);
  assert.ok(found, 'Expected declared tool');
  return found;
};
const readResult = async (name, args, collection = tools) => {
  const result = await getTool(name, collection).execute(args);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.content[0].text.length <= 1500);
  assert.ok(JSON.stringify(result).length <= 1500);
  return { result, data: JSON.parse(result.content[0].text) };
};

test('four tools declare bounded strict schemas and read-only untrusted output', () => {
  assert.deepEqual(tools.map(tool => tool.name), ['list_briefings', 'get_briefing_reference', 'get_editorial_routes', 'get_studio_services']);
  for (const tool of tools) {
    assert.ok(tool.name.length <= 30);
    assert.ok(tool.description.length <= 500);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(tool.annotations, { readOnlyHint: true, untrustedContentHint: true });
    for (const [name, property] of Object.entries(tool.inputSchema.properties)) {
      assert.ok(name.length <= 30);
      assert.ok(property.description.length <= 150);
    }
  }
});

test('literal search handles empty, whitespace, case, introductions and exact quotation marks', () => {
  assert.deepEqual(filterBriefings(reviewArticles, ''), reviewArticles);
  assert.deepEqual(filterBriefings(reviewArticles, '  '), reviewArticles);
  assert.equal(readBriefingQuery('  Query "kept"  '), 'Query "kept"');
  assert.equal(readBriefingQuery('💡'), '💡');
  const quoted = { title: 'A "full claim" stays intact.', dek: 'An introduction.', category: 'A topic' };
  assert.deepEqual(filterBriefings([quoted], '"FULL CLAIM"'), [quoted]);
  assert.equal(filterBriefings([quoted], 'INTRODUCTION').length, 1);
  assert.equal(filterBriefings([quoted], 'topic').length, 1);
  assert.equal(filterBriefings([quoted], 'full claim stays').length, 0);
  assert.deepEqual(filterBriefings(reviewArticles, 'GOOGLE'), filterBriefings(reviewArticles, 'google'));
  assert.equal(readBriefingQuery('x'.repeat(160)).length, 160);
  for (const query of [undefined, null, {}, 5, true, 'x'.repeat(161), 'a\nb', '\u0000', '\ud800']) {
    assert.throws(() => readBriefingQuery(query));
    assert.throws(() => filterBriefings(reviewArticles, query));
  }
});

test('paged listings return every complete active reference exactly once', async () => {
  const seen = [];
  let page = 1;
  let iterations = 0;
  do {
    const { result, data } = await readResult('list_briefings', { page });
    assert.equal(result.isError, undefined);
    assert.equal(data.page, page);
    assert.equal(data.total, reviewArticles.length);
    assert.ok(data.items.length > 0 && data.items.length <= 2);
    for (const item of data.items) {
      const original = reviewArticles.find(article => article.slug === item.slug);
      assert.ok(original);
      assert.equal(item.title, original.title);
      assert.equal(item.checkedAt, original.checkedAt);
      assert.equal(item.status, 'review');
      assert.equal(item.url, 'https://vkvstudio.pro/briefings/' + item.slug + '/');
      seen.push(item.slug);
    }
    page = data.nextPage;
    assert.ok(++iterations <= reviewArticles.length);
  } while (page !== null);
  assert.deepEqual(seen, reviewArticles.map(article => article.slug));
});

test('search uses the same helper as the archive and unmatched queries return an empty page', async () => {
  const expected = filterBriefings(reviewArticles, 'NEMOTRON');
  const { data } = await readResult('list_briefings', { query: 'NEMOTRON' });
  assert.equal(data.total, expected.length);
  assert.deepEqual(data.items.map(item => item.slug), expected.map(item => item.slug));
  const empty = await readResult('list_briefings', { query: 'no matching literal phrase' });
  assert.equal(empty.result.isError, undefined);
  assert.deepEqual(empty.data.items, []);
  assert.equal(empty.data.total, 0);
  assert.equal(empty.data.nextPage, null);
});

test('list rejects malformed queries, page types, out of range and undeclared arguments', async () => {
  for (const args of [
    { query: null }, { query: [] }, { query: {} }, { query: 'x'.repeat(161) }, { query: '\ud800' },
    ...[0, -1, .5, NaN, Infinity, 1_000_001, '1', null, {}].map(page => ({ page })),
    { page: 999 }, { url: 'https://evil.example/' }, { query: 'google', extra: true },
  ]) {
    const { result } = await readResult('list_briefings', args);
    assert.equal(result.isError, true);
  }
});

test('all tools reject non-JSON objects, prototype keys, symbols and accessors', async () => {
  let getterReads = 0;
  const getter = Object.defineProperty({}, 'query', { get() { getterReads++; return 'google'; }, enumerable: true });
  const malformed = [null, [], false, 3, new Date(), Object.create({ query: 'google' }),
    JSON.parse('{"__proto__":{"polluted":true}}'), { constructor: 'bad' }, { [Symbol('query')]: 'bad' }, getter];
  for (const tool of tools) {
    for (const args of malformed) assert.equal((await tool.execute(args)).isError, true);
  }
  assert.equal(getterReads, 0);
  assert.equal({}.polluted, undefined);
  const { result } = await readResult('list_briefings', Object.assign(Object.create(null), { query: 'google' }));
  assert.equal(result.isError, undefined);
});

test('reference lookup accepts only an exact active slug, not a foreign URL or path', async () => {
  const original = reviewArticles[0];
  const { result, data } = await readResult('get_briefing_reference', { slug: original.slug });
  assert.equal(result.isError, undefined);
  assert.equal(data.title, original.title);
  assert.equal(data.status, 'review');
  assert.equal(data.checkedAt, original.checkedAt);
  assert.equal(data.sourceCount, original.sources.length);
  assert.deepEqual(data.sources, original.sources.slice(0, 2));
  assert.match(data.note, /evidence, limitations/);
  for (const slug of ['__proto__', 'constructor', '../../private', 'https://evil.example/a', original.slug + '/', original.slug.toUpperCase(), 'unknown-slug', 'x'.repeat(97), '\ud800']) {
    assert.equal((await readResult('get_briefing_reference', { slug })).result.isError, true);
  }
  assert.equal((await readResult('get_briefing_reference', { slug: original.slug, url: 'https://evil.example' })).result.isError, true);
  assert.equal((await readResult('get_briefing_reference', {})).result.isError, true);
});

test('published status is explicit and a review collection does not claim publication', async () => {
  const published = createEditorialAgentTools({ ...options, publicRelease: true });
  for (const [collection, status] of [[tools, 'review'], [published, 'published']]) {
    assert.equal((await readResult('list_briefings', {}, collection)).data.items[0].status, status);
    assert.equal((await readResult('get_briefing_reference', { slug: reviewArticles[0].slug }, collection)).data.status, status);
    assert.equal((await readResult('get_editorial_routes', {}, collection)).data.status, status);
  }
});

test('editorial routes are canonical and no-argument tools reject unsolicited input', async () => {
  const { data } = await readResult('get_editorial_routes', {});
  assert.deepEqual(data.routes.map(route => route.url), [
    'https://vkvstudio.pro/', 'https://vkvstudio.pro/briefings/', 'https://vkvstudio.pro/method/',
    'https://vkvstudio.pro/studio/', 'https://vkvstudio.pro/privacy/',
  ]);
  for (const name of ['get_editorial_routes', 'get_studio_services']) {
    assert.equal((await readResult(name, { url: 'https://evil.example/' })).result.isError, true);
  }
});

test('studio routes use only the exact local opt-in and canonical public destinations', async () => {
  for (const [publicRelease, origin, expectedOrigin] of [
    [false, 'http://127.0.0.1:4173', 'http://127.0.0.1:4173'],
    [true, 'http://127.0.0.1:4173', 'https://vkvstudio.com'],
    ...['http://localhost:4173', 'http://127.0.0.1:4173/', 'https://evil.example', 'http://127.0.0.1:4174', 'http://127.0.0.1:4173@evil.example'].map(origin => [false, origin, 'https://vkvstudio.com']),
  ]) {
    const collection = createEditorialAgentTools({ ...options, publicRelease, studioPreviewOrigin: origin });
    const { data } = await readResult('get_studio_services', {}, collection);
    assert.deepEqual(data.routes.map(route => route.url), ['/en/services/', '/en/contact/', '/en/trust/'].map(path => expectedOrigin + path));
    assert.match(data.communication, /English.*writing/);
  }
});

test('bad canonical URLs, private or executable source URLs, dates, duplicates and oversize metadata fail closed', () => {
  for (const canonicalUrl of ['https://evil.example/briefings/a/', 'https://vkvstudio.pro@evil.example/a/', 'javascript:alert(1)']) {
    assert.throws(() => createEditorialAgentTools({ ...options, articles: [{ ...reviewArticles[0], canonicalUrl }] }));
  }
  for (const url of ['javascript:alert(1)', 'data:text/plain,source', '/relative-source', 'http://example.org/a', 'https://user:pass@example.org/a', 'https://localhost/private', 'https://localhost./private', 'https://sub.localhost./private', 'https://example.local./private', 'https://example.internal./private', 'https://local./private', 'https://internal./private', 'https://127.0.0.1/private']) {
    assert.throws(() => createEditorialAgentTools({ ...options, articles: [{ ...reviewArticles[0], sources: [{ label: 'Source', url }] }] }));
  }
  for (const override of [{ title: 'x'.repeat(241) }, { checkedAt: '2026-02-30' }, { sources: null }, { slug: '../private' }]) {
    assert.throws(() => createEditorialAgentTools({ ...options, articles: [{ ...reviewArticles[0], ...override }] }));
  }
  assert.throws(() => createEditorialAgentTools({ ...options, articles: [reviewArticles[0], reviewArticles[0]] }));
  assert.throws(() => createEditorialAgentTools({ ...options, publicRelease: 'false' }));
});

test('budgeted pagination retains full quoted titles and source references', async () => {
  const title = 'Quote " '.repeat(24) + 'a complete claim.';
  const articles = Array.from({ length: 6 }, (_, index) => ({
    ...reviewArticles[0], slug: 'quote-' + index, title,
    sources: [{ label: 'a'.repeat(160), url: 'https://example.org/' + 'a'.repeat(550) },
      { label: 'b'.repeat(160), url: 'https://example.org/' + 'b'.repeat(550) }],
  }));
  const collection = createEditorialAgentTools({ ...options, articles });
  let page = 1;
  const returned = [];
  do {
    const { data } = await readResult('list_briefings', { page }, collection);
    returned.push(...data.items);
    page = data.nextPage;
  } while (page !== null);
  assert.equal(returned.length, articles.length);
  assert.ok(returned.every(item => item.title === title));
  const { data } = await readResult('get_briefing_reference', { slug: articles[0].slug }, collection);
  assert.equal(data.title, title);
  assert.equal(data.sourceCount, 2);
  assert.equal(data.sources.length, 1);
  assert.deepEqual(data.sources[0], articles[0].sources[0]);
});

test('definitions snapshot their selected metadata without mutating the source collection', async () => {
  const input = structuredClone(reviewArticles);
  const original = structuredClone(input);
  const collection = createEditorialAgentTools({ ...options, articles: input });
  assert.deepEqual(input, original);
  input[0].title = 'Changed after registration';
  input[0].sources[0].url = 'https://evil.example/new';
  const { data } = await readResult('get_briefing_reference', { slug: original[0].slug }, collection);
  assert.equal(data.title, original[0].title);
  assert.equal(data.sources[0].url, original[0].sources[0].url);
});

test('an empty selected collection exposes only stable reading and studio routes', async () => {
  const collection = createEditorialAgentTools({ ...options, articles: [] });
  const { data } = await readResult('list_briefings', {}, collection);
  assert.deepEqual(data.items, []);
  assert.equal(data.total, 0);
  assert.equal((await readResult('get_briefing_reference', { slug: reviewArticles[0].slug }, collection)).result.isError, true);
});

test('archive URL state survives reload and history while search and topic navigation clear each other', () => {
  const topic = briefingTopicParams('ai-search');
  const searched = briefingSearchParams('  NEMOTRON  ');
  const selectedAgain = briefingTopicParams('local-ai');
  const emptySearch = briefingSearchParams(' ');
  assert.deepEqual(topic, { topic: 'ai-search' });
  assert.deepEqual(searched, { q: 'NEMOTRON' });
  assert.deepEqual(selectedAgain, { topic: 'local-ai' });
  assert.deepEqual(emptySearch, {});
  assert.deepEqual(readBriefingArchiveState(searched), { query: 'NEMOTRON', topic: 'all' });
  assert.deepEqual(readBriefingArchiveState(selectedAgain), { query: '', topic: 'local-ai' });
  assert.deepEqual(readBriefingArchiveState(emptySearch), { query: '', topic: 'all' });

  const history = [topic, searched, selectedAgain, emptySearch];
  const queryMatches = params => filterBriefings(reviewArticles, readBriefingArchiveState(params).query).map(article => article.slug);
  const reload = params => Object.fromEntries(new URLSearchParams(params));
  for (const params of history) {
    assert.deepEqual(readBriefingArchiveState(reload(params)), readBriefingArchiveState(params));
    assert.deepEqual(queryMatches(reload(params)), queryMatches(params));
  }
  // Going back to the search restores its phrase and the same complete references.
  assert.deepEqual(queryMatches(reload(history[1])), filterBriefings(reviewArticles, 'NEMOTRON').map(article => article.slug));
  assert.deepEqual(queryMatches(reload(history[3])), reviewArticles.map(article => article.slug));
  assert.deepEqual(briefingTopicParams('all'), {});
});

test('URL filter validation ignores arrays, malformed values and getters without forwarding other parameters', () => {
  for (const q of [null, ['google'], ['google', 'agents'], {}, 1, '\n', '\ud800', 'x'.repeat(161)]) {
    assert.deepEqual(readBriefingArchiveState({ q }), { query: '', topic: 'all' });
    assert.throws(() => briefingSearchParams(q));
  }
  for (const topic of [null, ['ai-search'], {}, 1, 'evil', '\n', 'ai-search\u0000']) {
    assert.deepEqual(readBriefingArchiveState({ topic }), { query: '', topic: 'all' });
    assert.throws(() => briefingTopicParams(topic));
  }
  let getterReads = 0;
  const getters = Object.defineProperties({}, {
    q: { get() { getterReads++; return 'google'; }, enumerable: true },
    topic: { get() { getterReads++; return 'ai-search'; }, enumerable: true },
  });
  assert.deepEqual(readBriefingArchiveState(getters), { query: '', topic: 'all' });
  assert.equal(getterReads, 0);
  assert.deepEqual(readBriefingArchiveState(Object.create({ q: 'google', topic: 'ai-search' })), { query: '', topic: 'all' });
  assert.deepEqual(readBriefingArchiveState({ q: ' google ', topic: ['ai-search'], redirect: 'https://evil.example/' }), { query: 'google', topic: 'all' });
  for (const malformed of [null, [], undefined, 1]) {
    assert.deepEqual(readBriefingArchiveState(malformed), { query: '', topic: 'all' });
  }
  const phrase = '"Google" & https://evil.example/#fragment';
  const params = briefingSearchParams(phrase);
  const url = new URL('/briefings/?' + new URLSearchParams(params), 'https://vkvstudio.pro');
  assert.equal(url.origin, 'https://vkvstudio.pro');
  assert.equal(url.pathname, '/briefings/');
  assert.equal(url.hash, '');
  assert.deepEqual([...url.searchParams.keys()], ['q']);
  assert.equal(readBriefingArchiveState(Object.fromEntries(url.searchParams)).query, phrase);
  assert.equal(readBriefingArchiveState({ q: '💡' }).query, '💡');
  assert.equal(readBriefingArchiveState({ q: 'x'.repeat(160) }).query.length, 160);
});

test('the human archive exposes a labelled native search form without an imperative tool dependency', () => {
  const archive = fs.readFileSync(new URL('../app/pages/briefings/index.vue', import.meta.url), 'utf8');
  assert.doesNotMatch(archive, /editorial-agent-tools/);
  assert.match(archive, /method="dialog"[^>]+toolname="search_briefings"/);
  assert.match(archive, /<label for="briefings-search-query">/);
  assert.match(archive, /name="query" type="search" maxlength="160"/);
  assert.match(archive, /toolparamdescription=/);
  assert.match(archive, /<button\b(?=[^>]*type="submit")[^>]*>Search<\/button>/);
  assert.match(archive, /role="status" aria-live="polite"/);
  assert.doesNotMatch(archive, /v-html|innerHTML|fetch\(|eval\(/);
});

let definitionLoads = 0;
let pluginNumber = 0;
const fixtureUrl = 'data:text/javascript,' + encodeURIComponent('export const articles = ' + JSON.stringify(reviewArticles) + ';');
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#editorial-collection') return { url: fixtureUrl, shortCircuit: true };
    if (specifier === '../utils/editorial-agent-tools' && context.parentURL?.includes('/app/plugins/editorial-tools.client.ts')) {
      definitionLoads++;
      return nextResolve('../utils/editorial-agent-tools.ts', context);
    }
    return nextResolve(specifier, context);
  },
});
after(() => hooks.deregister());

function createApp() {
  const cleanups = [];
  return { app: { vueApp: { onUnmount(handler) { cleanups.push(handler); } } }, cleanups };
}

async function withPlugin(document, context, callback) {
  const keys = ['document', 'defineNuxtPlugin', 'useAppConfig'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const { app, cleanups } = createApp();
  Object.defineProperties(globalThis, {
    document: { value: document, configurable: true },
    defineNuxtPlugin: { value: plugin => plugin, configurable: true },
    useAppConfig: { value: () => context, configurable: true },
  });
  try {
    const url = new URL('../app/plugins/editorial-tools.client.ts', import.meta.url);
    url.searchParams.set('test', String(++pluginNumber));
    const { default: plugin } = await import(url.href);
    await callback(plugin, app, cleanups);
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

function createNativeContext(onRegister) {
  const registrations = [];
  const active = new Set();
  const aborted = [];
  return {
    registrations, active, aborted,
    modelContext: {
      registerTool(tool, options) {
        assert.deepEqual(Object.keys(options), ['signal']);
        assert.ok(options.signal instanceof AbortSignal);
        assert.equal(options.signal.aborted, false);
        const registration = { tool, signal: options.signal };
        registrations.push(registration);
        active.add(registration);
        options.signal.addEventListener('abort', () => {
          active.delete(registration);
          aborted.push(registration);
        }, { once: true });
        return onRegister?.(registration, registrations.length);
      },
    },
  };
}

test('plugin ignores missing or unsupported native APIs without requesting definitions', async () => {
  for (const document of [{}, { modelContext: {} }, Object.defineProperty({}, 'modelContext', { get() { throw new Error('Disabled'); } })]) {
    const before = definitionLoads;
    await withPlugin(document, { publicRelease: false }, async (plugin, app, cleanups) => {
      await plugin.setup(app);
      assert.equal(cleanups.length, 0);
      assert.equal(definitionLoads, before);
    });
  }
});

test('native AbortSignals register once, dispose only owned tools and allow the same document to reinitialize', async () => {
  const native = createNativeContext();
  const foreign = { name: 'another-app-tool' };
  native.active.add(foreign);
  const document = { modelContext: native.modelContext };
  await withPlugin(document, { publicRelease: false, studioPreviewOrigin: '' }, async (plugin, app, cleanups) => {
    await plugin.setup(app);
    await plugin.setup(app);
    assert.equal(cleanups.length, 1);
    assert.deepEqual(native.registrations.map(entry => entry.tool.name), tools.map(tool => tool.name));
    assert.equal(new Set(native.registrations.map(entry => entry.signal)).size, 4);
    const firstGeneration = [...native.registrations];
    cleanups[0]();
    assert.ok(firstGeneration.every(entry => entry.signal.aborted));
    assert.deepEqual([...native.active], [foreign]);
    cleanups[0]();
    assert.equal(native.aborted.length, 4);

    const second = createApp();
    await plugin.setup(second.app);
    assert.equal(second.cleanups.length, 1);
    assert.equal(native.registrations.length, 8);
    const secondGeneration = native.registrations.slice(4);
    assert.ok(secondGeneration.every(entry => !entry.signal.aborted));
    // Repeating the old teardown cannot clear the new generation's ownership.
    cleanups[0]();
    await plugin.setup(createApp().app);
    assert.equal(native.registrations.length, 8);
    assert.ok(secondGeneration.every(entry => !entry.signal.aborted));
    second.cleanups[0]();
    assert.deepEqual([...native.active], [foreign]);
    assert.equal(native.aborted.length, 8);
  });
});

test('synchronous and asynchronous native rejections abort only the failed registration', async () => {
  for (const asynchronous of [false, true]) {
    const native = createNativeContext(({ tool }) => {
      if (tool.name !== 'get_briefing_reference') return;
      if (asynchronous) return Promise.reject(new Error('Policy rejection'));
      throw new Error('Policy rejection');
    });
    await withPlugin({ modelContext: native.modelContext }, { publicRelease: false }, async (plugin, app, cleanups) => {
      await plugin.setup(app);
      assert.equal(native.registrations.length, 4);
      assert.equal(native.active.size, 3);
      assert.deepEqual(native.aborted.map(entry => entry.tool.name), ['get_briefing_reference']);
      assert.ok([...native.active].every(entry => !entry.signal.aborted));
      cleanups[0]();
      assert.equal(native.active.size, 0);
      assert.equal(native.aborted.length, 4);
    });
  }
});

test('unmount before the lazy import resolves registers no tools and permits a fresh app setup', async () => {
  const native = createNativeContext();
  await withPlugin({ modelContext: native.modelContext }, { publicRelease: false }, async (plugin, app, cleanups) => {
    const oldPending = plugin.setup(app);
    assert.equal(cleanups.length, 1);
    cleanups[0]();
    await oldPending;
    assert.equal(native.registrations.length, 0);
    const fresh = createApp();
    await plugin.setup(fresh.app);
    assert.equal(native.registrations.length, 4);
    cleanups[0]();
    await plugin.setup(createApp().app);
    assert.equal(native.registrations.length, 4);
    assert.equal(native.active.size, 4);
    fresh.cleanups[0]();
    assert.equal(native.active.size, 0);
  });
});

test('late registration completion after unmount cannot erase a new app registration on the same document', async () => {
  let finish;
  const native = createNativeContext((_registration, count) => {
    if (count === 1) return new Promise(resolve => { finish = resolve; });
  });
  await withPlugin({ modelContext: native.modelContext }, { publicRelease: false }, async (plugin, app, cleanups) => {
    const pending = plugin.setup(app);
    for (let turn = 0; !finish && turn < 20; turn++) await nextTurn();
    assert.equal(typeof finish, 'function');
    const oldRegistration = native.registrations[0];
    cleanups[0]();
    assert.equal(oldRegistration.signal.aborted, true);
    assert.equal(native.active.size, 0);

    const fresh = createApp();
    await plugin.setup(fresh.app);
    assert.equal(native.registrations.length, 5);
    assert.equal(native.active.size, 4);
    finish();
    await pending;
    assert.equal(native.registrations.length, 5);
    cleanups[0]();
    await plugin.setup(createApp().app);
    assert.equal(native.registrations.length, 5);
    assert.ok(native.registrations.slice(1).every(entry => !entry.signal.aborted));
    fresh.cleanups[0]();
    assert.equal(native.active.size, 0);
  });
});

test('an invalid selected collection releases document ownership so corrected setup can proceed', async () => {
  const native = createNativeContext();
  const config = { publicRelease: 'false' };
  await withPlugin({ modelContext: native.modelContext }, config, async (plugin, app, cleanups) => {
    await plugin.setup(app);
    assert.equal(cleanups.length, 1);
    assert.equal(native.registrations.length, 0);
    config.publicRelease = false;
    const fresh = createApp();
    await plugin.setup(fresh.app);
    assert.equal(native.registrations.length, 4);
    cleanups[0]();
    await plugin.setup(createApp().app);
    assert.equal(native.registrations.length, 4);
    fresh.cleanups[0]();
    assert.equal(native.active.size, 0);
  });
});

test('plugin never consults legacy navigator, adds a polyfill or exposes tools across origins', () => {
  const plugin = fs.readFileSync(new URL('../app/plugins/editorial-tools.client.ts', import.meta.url), 'utf8');
  assert.match(plugin, /from '#editorial-collection'/);
  assert.match(plugin, /\.modelContext/);
  assert.doesNotMatch(plugin, /unregisterTool|preview-articles|navigator|provideContext|exposedTo|polyfill|fetch\(|storage|innerHTML|eval\(/);
});
