import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const root = resolve('.output/public');
const port = 4323;
const compress = promisify(gzip);
const insideRoot = (file, boundary) => file === boundary || file.startsWith(boundary + sep);
const realRoot = await realpath(root);

async function loadHeaderRules() {
  const headerFile = await realpath(resolve(root, '_headers'));
  if (!insideRoot(headerFile, realRoot)) throw new Error('Preview header file is outside the output.');
  const headerText = await readFile(headerFile, 'utf8');
  const rules = [];
  let current;
  for (const line of headerText.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = value.startsWith('/') ? { pattern: value, headers: {} } : undefined;
      if (current) rules.push(current);
      continue;
    }
    if (!current) continue;
    const separator = value.indexOf(':');
    if (separator <= 0) continue;
    const name = value.slice(0, separator).trim().toLowerCase();
    if (!/^[!#$%&'*+.^_`|~\w-]+$/.test(name)) continue;
    current.headers[name] = value.slice(separator + 1).trim();
  }
  return rules.map(({ pattern, headers }) => ({
    pattern: new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`),
    headers,
  }));
}

const headersFor = (pathname, rules) => {
  const headers = {};
  for (const rule of rules) {
    if (rule.pattern.test(pathname)) Object.assign(headers, rule.headers);
  }
  return { ...headers, 'x-content-type-options': 'nosniff' };
};

function validateHeaderRules(rules) {
  const policy = headersFor('/', rules)['content-security-policy'] ?? '';
  const directives = new Map();
  for (const directive of policy.split(';').map((value) => value.trim()).filter(Boolean)) {
    const [name, ...sources] = directive.split(/\s+/);
    if (directives.has(name)) throw new Error('Preview security policy is invalid.');
    directives.set(name, sources);
  }
  const scripts = directives.get('script-src') ?? [];
  if (directives.get('default-src')?.join(' ') !== "'none'"
    || !scripts.includes("'self'")
    || !scripts.every((source) => source === "'self'" || /^'sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}'$/.test(source))
    || directives.get('require-trusted-types-for')?.join(' ') !== "'script'") {
    throw new Error('Preview security policy is missing or invalid.');
  }
}

// Check at startup, then reread per request so a local rebuild cannot leave stale hashes.
validateHeaderRules(await loadHeaderRules());
const unavailableHeaders = Object.freeze({
  'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; require-trusted-types-for 'script';",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), display-capture=()',
  'cache-control': 'no-store',
});

function acceptsGzip(value = '') {
  const qualities = new Map();
  for (const entry of (Array.isArray(value) ? value.join(',') : value).split(',')) {
    const [coding, ...parameters] = entry.trim().toLowerCase().split(';');
    const encoding = coding.trim();
    if (encoding !== 'gzip' && encoding !== '*') continue;
    const qValues = parameters.map((parameter) => parameter.trim()).filter((parameter) => /^q\s*=/.test(parameter));
    const q = qValues[0]?.split('=')[1]?.trim();
    const quality = qValues.length === 0 ? 1 : qValues.length === 1 && /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(q ?? '') ? Number(q) : 0;
    // An explicit refusal wins even if an encoding appears more than once.
    qualities.set(encoding, Math.min(qualities.get(encoding) ?? 1, quality));
  }
  return (qualities.has('gzip') ? qualities.get('gzip') : qualities.get('*') ?? 0) > 0;
}

function varyByEncoding(headers) {
  const vary = (headers.vary ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!vary.some((value) => value === '*' || value.toLowerCase() === 'accept-encoding')) vary.push('Accept-Encoding');
  headers.vary = vary.join(', ');
}

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; profile="urn:air:agent-skills"; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const compressible = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.md', '.txt', '.xml']);

function finishError(request, response, status, message, pathname, rules, extraHeaders = {}) {
  const body = Buffer.from(message);
  response.writeHead(status, {
    ...(rules ? headersFor(pathname, rules) : unavailableHeaders),
    ...extraHeaders,
    'content-type': 'text/plain; charset=utf-8',
    'content-length': String(body.length),
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

createServer(async (request, response) => {
  let rules;
  try {
    rules = await loadHeaderRules();
    validateHeaderRules(rules);
  } catch {
    finishError(request, response, 503, 'Preview unavailable', '/', undefined);
    return;
  }
  let pathname = '/';
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    finishError(request, response, 405, 'Method not allowed', pathname, rules, { allow: 'GET, HEAD' });
    return;
  }
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1:4323').pathname);
    const candidate = resolve(root, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '');
    if (!insideRoot(candidate, root)) {
      finishError(request, response, 403, 'Forbidden', pathname, rules);
      return;
    }
    let file = await realpath(candidate);
    if (!insideRoot(file, realRoot)) {
      finishError(request, response, 403, 'Forbidden', pathname, rules);
      return;
    }
    if ((await stat(file)).isDirectory()) file = await realpath(resolve(file, 'index.html'));
    if (!insideRoot(file, realRoot)) {
      finishError(request, response, 403, 'Forbidden', pathname, rules);
      return;
    }
    const body = await readFile(file);
    const extension = extname(file).toLowerCase();
    const headers = { ...headersFor(pathname, rules), 'content-type': types[extension] || 'application/octet-stream' };
    const canCompress = compressible.has(extension) && body.length >= 1024;
    if (canCompress) varyByEncoding(headers);
    const useGzip = canCompress && acceptsGzip(request.headers['accept-encoding']);
    const representation = useGzip ? await compress(body) : body;
    if (useGzip) headers['content-encoding'] = 'gzip';
    headers['content-length'] = String(representation.length);
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : representation);
  } catch {
    finishError(request, response, 404, 'Not found', pathname, rules);
  }
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`Static Nuxt preview: http://127.0.0.1:${port}/\n`);
});
