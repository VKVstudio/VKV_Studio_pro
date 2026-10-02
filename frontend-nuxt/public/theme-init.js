(() => {
  const key = 'vkv-pro-theme';
  const system = window.matchMedia('(prefers-color-scheme: light)');
  const stored = () => {
    try {
      const value = localStorage.getItem(key);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  };
  const apply = () => {
    const effective = stored() || (system.matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = effective;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effective === 'light' ? '#f4f1e9' : '#0d1011');
  };
  apply();
  // Start the archive's CSS hero image before the stylesheet is parsed.
  // A fixed art allowlist preserves same-origin paths and the stored theme.
  const art = document.querySelector('meta[name="vkv-pro-preload-art"]')?.getAttribute('content');
  const allowedArt = ['performance-cache', 'phone-mobile', 'ai-search-fundamentals', 'google-ai-search', 'agents-api', 'sponsored-agents', 'shieldstral', 'nemotron'];
  if (art && allowedArt.includes(art)) {
    const variant = document.documentElement.dataset.theme === 'light' ? 'day' : 'night';
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = `/images/${art}-${variant}.webp`;
    preload.fetchPriority = 'high';
    document.head.appendChild(preload);
  }
  system.addEventListener('change', apply);
})();
