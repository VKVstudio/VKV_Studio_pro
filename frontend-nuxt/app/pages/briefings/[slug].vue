<script setup lang="ts">
import { studioLink } from '~/utils/studio-links';
import ReadingVisual from '~/components/ReadingVisual.vue';
import SectionSceneImage from '~/components/SectionSceneImage.vue';
import ShareLinks from '~/components/ShareLinks.vue';
import { articles, articlePath, canonicalUrl } from '~/data/articles';
import { sectionScenesBySlug } from '~/data/section-scenes';
import { editorialArticleSchema, serializeEditorialSchema } from '~/utils/editorial-schema';
const studioOrigin = useAppConfig().studioPreviewOrigin;

const route = useRoute();
const article = articles.find((item) => item.slug === route.params.slug);
if (!article) throw createError({ statusCode: 404, statusMessage: 'Briefing not found' });
const url = canonicalUrl(articlePath(article.slug));
const articleIndex = articles.findIndex((item) => item.slug === article.slug);
const next = articles.length > 1 ? articles[(articleIndex + 1) % articles.length] : undefined;
const readingVisuals: Record<string, { alt: string; caption: string }> = {
  'the-hundred-and-the-cache': {
    alt: 'Large and small film reels beside a glass delivery slot that still holds an older reel',
    caption: 'A smaller local file changes nothing until the delivered bytes change too.',
  },
  'the-phone-saw-a-different-site': {
    alt: 'A narrow phone-shaped glass frame crops the focal point from a wide printed composition',
    caption: 'The same page can lose its point through a narrow viewing window.',
  },
  'ai-search-no-magic-file': {
    alt: 'Open reference book in an accessible reading room with shelves behind it',
    caption: 'Clear, reachable content matters more than a supposed magic file.',
  },
  'google-ai-search-controls-and-insights': {
    alt: 'Blank paper page cards beneath a clear lens, with only some caught in the light',
    caption: 'A surfaced page is a signal. A buyer still needs a reason to act.',
  },
  'agents-api-still-needs-a-boundary': {
    alt: 'Illustrative patch panel with one cable connection behind a clear latch',
    caption: 'A connection needs a permitted route. An agent’s tools do too.',
  },
  'sponsored-agents-are-still-ads': {
    alt: 'Two blank paper stacks, with only the paid stack enclosed in a copper frame',
    caption: 'A framed paid placement is separate from the independent answer beside it.',
  },
  'shieldstral-is-a-guardrail-candidate': {
    alt: 'Paper strips at a mesh filter, with one red strip held back',
    caption: 'A filter needs a tested threshold and a plan for what happens when it fails.',
  },
  'nemotron-active-parameters-are-not-memory': {
    alt: 'Large cabinet of drawers with just three drawers open and lit',
    caption: 'Only a few drawers are active; the entire cabinet still needs space.',
  },
};
const readingVisual = readingVisuals[article.slug];
const sectionScenes = sectionScenesBySlug[article.slug] ?? [];
const hasSectionScenes = sectionScenes.length === article.sections.length;
const activeScene = ref(0);
const sceneVisible = ref(false);
const articleRail = ref<HTMLElement | null>(null);
const articleToc = ref<HTMLElement | null>(null);
const activePart = ref('takeaway');
let stopSceneTracking: (() => void) | undefined;

onMounted(() => {
  if (!hasSectionScenes) return;
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.article-prose > section'));
  const sources = document.getElementById('sources');
  const parts = ['takeaway', 'evidence', 'analysis', 'sources'].map((id) => document.getElementById(id));
  const desktopQuery = window.matchMedia('(min-width: 1101px) and (min-height: 600px)');
  if (sections.length !== sectionScenes.length) return;

  let frame = 0;
  const update = () => {
    frame = 0;
    // Align section changes with the top of the illustration below the pinned contents.
    const gap = articleRail.value ? parseFloat(getComputedStyle(articleRail.value).rowGap) || 0 : 0;
    const readingLine = (articleToc.value?.getBoundingClientRect().bottom ?? 16) + gap;
    const index = sections.findLastIndex((section) => section.getBoundingClientRect().top <= readingLine);
    const part = parts.findLast((element) => element && element.getBoundingClientRect().top <= readingLine);
    activePart.value = part?.id ?? 'takeaway';
    sceneVisible.value = desktopQuery.matches && index >= 0 && (!sources || sources.getBoundingClientRect().top > readingLine);
    if (index >= 0) activeScene.value = index;
  };
  const scheduleUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  update();
  stopSceneTracking = () => {
    window.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
    if (frame) window.cancelAnimationFrame(frame);
  };
});

onBeforeUnmount(() => stopSceneTracking?.());
const coverUrl = canonicalUrl(`/og/${article.slug}.png`);
const publishedAt = article.publishedAt;
const modifiedAt = publishedAt && (article.checkedAt > publishedAt ? article.checkedAt : publishedAt);
useSeoMeta({
  title: `${article.title} — VKVstudio.pro`,
  description: article.dek,
  robots: useAppConfig().indexable === true ? 'index, follow' : 'noindex, nofollow',
  ogTitle: article.title,
  ogDescription: article.dek,
  ogType: 'article',
  ogUrl: url,
  ogImage: coverUrl,
  ogImageWidth: 1200,
  ogImageHeight: 627,
  ogImageAlt: `Editorial cover for ${article.title}`,
  ...(publishedAt ? { articlePublishedTime: publishedAt, articleModifiedTime: modifiedAt } : {}),
  twitterCard: 'summary_large_image',
});
useHead({
  link: [{ rel: 'canonical', href: url }],
  script: [{ key: 'editorial-schema', type: 'application/ld+json', textContent: serializeEditorialSchema(editorialArticleSchema(article)) }],
});
</script>

<template>
  <main id="main" tabindex="-1" class="article-page shell">
    <nav class="breadcrumb" aria-label="Breadcrumb"><NuxtLink to="/">Home</NuxtLink><span>/</span><NuxtLink to="/briefings/">Briefings</NuxtLink><span>/</span><span aria-current="page">{{ article.title }}</span></nav>
    <article>
      <header class="article-head">
        <div class="article-head__copy"><p class="eyebrow">{{ article.category }} <span class="eyebrow__split">/</span> {{ article.minutes }} MIN READ</p><h1>{{ article.title }}</h1><p class="article-dek">{{ article.dek }}</p><div class="article-byline"><span>VALERII KARPOV</span><span v-if="article.eventDate">{{ article.eventLabel ?? 'EVENT' }} {{ article.eventDate }}</span><span v-if="publishedAt">PUBLISHED {{ publishedAt }}</span><span>REVIEWED {{ article.checkedAt }}</span></div></div>
        <div :class="`article-head__art theme-art theme-art--${article.art}`" role="img" :aria-label="readingVisual?.alt ?? `Editorial illustration for ${article.category}`"></div>
      </header>
      <div class="article-layout" :class="{ 'article-layout--with-scenes': hasSectionScenes }">
        <aside ref="articleRail" class="article-rail">
          <nav ref="articleToc" class="article-rail__toc" aria-label="In this briefing">
            <span>IN THIS BRIEFING</span>
            <a href="#takeaway" :aria-current="activePart === 'takeaway' ? 'location' : undefined">The decision</a>
            <a href="#evidence" :aria-current="activePart === 'evidence' ? 'location' : undefined">Evidence &amp; limits</a>
            <a href="#analysis" :aria-current="activePart === 'analysis' ? 'location' : undefined">The analysis</a>
            <a href="#sources" :aria-current="activePart === 'sources' ? 'location' : undefined">Sources</a>
          </nav>
          <ReadingVisual v-if="readingVisual && !hasSectionScenes" class="article-rail__visual" :art="article.art" :caption="readingVisual.caption" />
          <Transition name="scene-reveal">
            <div v-if="hasSectionScenes && sceneVisible" class="article-scene-deck" role="group" aria-label="Section illustrations">
              <figure v-for="(scene, index) in sectionScenes" :key="scene.id" class="article-scene" :class="{ 'article-scene--active': activeScene === index }" :aria-hidden="activeScene !== index">
                <SectionSceneImage :scene-id="scene.id" :alt="scene.alt" mode="deck" :active="sceneVisible && activeScene === index" />
                <figcaption><span>{{ String(index + 1).padStart(2, '0') }} / {{ scene.label }}</span>{{ scene.caption }}</figcaption>
              </figure>
            </div>
          </Transition>
        </aside>
        <div class="article-flow">
          <section id="takeaway" class="takeaway"><span>THE DECISION IN 30 SECONDS</span><p>{{ article.takeaway }}</p></section>
          <ShareLinks :title="article.title" :url="url" />
          <section id="evidence" class="evidence"><div class="evidence__top"><span>01 / EVIDENCE LEDGER</span><NuxtLink to="/method/">How I check ↗</NuxtLink></div><div class="evidence__grid"><div><h2>What is checked</h2><p>{{ article.evidence }}</p></div><div><h2>What this cannot prove</h2><p>{{ article.limits }}</p></div></div></section>
          <div id="analysis" class="article-prose">
            <section v-for="(section, index) in article.sections" :key="section.heading">
              <span class="section-num">{{ String(index + 1).padStart(2, '0') }}</span>
              <h2>{{ section.heading }}</h2>
              <figure v-if="hasSectionScenes && sectionScenes[index]" class="article-scene article-scene--inline">
                <SectionSceneImage :scene-id="sectionScenes[index].id" :alt="sectionScenes[index].alt" mode="inline" />
                <figcaption><span>{{ String(index + 1).padStart(2, '0') }} / {{ sectionScenes[index].label }}</span>{{ sectionScenes[index].caption }}</figcaption>
              </figure>
              <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
              <ReadingVisual v-if="readingVisual && !hasSectionScenes && index === 0" class="article-flow__visual" :art="article.art" :caption="readingVisual.caption" />
            </section>
          </div>
          <section id="sources" class="sources"><h2>Sources and artefacts</h2><ol><li v-for="source in article.sources" :key="source.url"><a :href="studioLink(source.url, studioOrigin)" target="_blank" rel="noopener noreferrer">{{ source.label }} <span aria-hidden="true">↗</span></a></li></ol></section>
          <div class="service-bridge"><p class="eyebrow">APPLY THE METHOD TO YOUR BUSINESS</p><h2>A useful answer starts with your own evidence.</h2><p>{{ article.service.reason }}</p><a class="button button--primary" :href="studioLink(article.service.url, studioOrigin, article.slug)">{{ article.service.label }} ↗</a><span>Service details and current pricing are on VKVstudio.com. Project scope and agreements are handled by email.</span></div>
          <ShareLinks :title="article.title" :url="url" />
        </div>
      </div>
    </article>
    <nav v-if="next" class="article-next" aria-label="Continue reading"><span>NEXT BRIEFING</span><NuxtLink :to="articlePath(next.slug)">{{ next.title }} <span aria-hidden="true">↗</span></NuxtLink></nav>
  </main>
</template>
