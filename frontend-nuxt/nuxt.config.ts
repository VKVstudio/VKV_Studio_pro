import { publicRelease, indexable, studioPreviewOrigin, editorialCollectionPath, approvedArticleSlugs, webmcpTrial } from './scripts/release-config.mjs';
import { articles as previewArticles } from './app/data/preview-articles';
import { articlePath } from './app/data/article-links';
import { routeTypesPlugin } from './scripts/route-types.mjs';

const articleSlugs = publicRelease ? approvedArticleSlugs : previewArticles.map(article => article.slug);

export default defineNuxtConfig({
  compatibilityDate: '2026-09-27',
  alias: {
    '#editorial-collection': editorialCollectionPath,
  },
  hooks: { ready: (nuxt) => {
    // Register after modules so the router's generated plugin is resolved under pnpm isolation.
    nuxt.hook('prepare:types', ({ tsConfig }) => {
      const options = tsConfig.vueCompilerOptions ?? {};
      options.plugins = (options.plugins ?? []).map((plugin) => {
        if (plugin === 'vue-router/volar/sfc-route-blocks') return routeTypesPlugin;
        if (typeof plugin !== 'string' && plugin.name === 'vue-router/volar/sfc-route-blocks')
          return { ...plugin, name: routeTypesPlugin };
        return plugin;
      });
      tsConfig.vueCompilerOptions = options;
    });
  } },
  devtools: { enabled: false },
  features: { inlineStyles: false },
  appConfig: { publicRelease, indexable, studioPreviewOrigin },
  css: ['~/assets/styles/global.css', '~/assets/styles/site.css'],
  nitro: {
    prerender: {
      crawlLinks: false,
      concurrency: 1,
      routes: ['/', '/briefings/', '/method/', '/studio/', '/privacy/', ...articleSlugs.map(articlePath)],
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [
        ...(indexable === true ? [] : [{ name: 'robots', content: 'noindex, nofollow' }]),
        ...(publicRelease && webmcpTrial ? [{ 'http-equiv': 'origin-trial', content: webmcpTrial }] : []),
        { name: 'color-scheme', content: 'dark light' },
        { name: 'theme-color', content: '#0d1011', tagPriority: 45 },
      ],
      script: [{ src: '/theme-init.js' }],
      link: [
        { rel: 'icon', type: 'image/webp', href: '/vkv-logo-compact.webp' },
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/jetbrains-mono-latin.woff2', crossorigin: 'anonymous', tagPriority: 40 },
      ],
    },
  },
});
