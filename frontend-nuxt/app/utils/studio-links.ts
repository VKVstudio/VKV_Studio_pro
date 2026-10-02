const studioOrigin = 'https://vkvstudio.com';
const localStudioOrigin = 'http://127.0.0.1:4173';

/** Keep public destinations canonical; opt in to exactly one local review origin. */
export function studioLink(destination: string, previewOrigin = '', briefing = ''): string {
  let url: URL;
  try {
    url = new URL(destination, studioOrigin);
  } catch {
    return '#';
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '#';
  if (url.origin !== studioOrigin) return destination;
  if (briefing.length <= 96 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(briefing)) {
    url.searchParams.set('source', 'pro');
    url.searchParams.set('briefing', briefing);
  }
  if (previewOrigin === localStudioOrigin) {
    const local = new URL(localStudioOrigin);
    local.pathname = url.pathname;
    local.search = url.search;
    local.hash = url.hash;
    return local.href;
  }
  return url.href;
}

export function studioPreviewOrigin(value: string | undefined, publicRelease: boolean): string {
  return !publicRelease && value === localStudioOrigin ? localStudioOrigin : '';
}
