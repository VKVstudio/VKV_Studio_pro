<script setup lang="ts">
import { studioLink } from '~/utils/studio-links';
import ArticleTeaser from '~/components/ArticleTeaser.vue';
import { articles, articlePath, canonicalUrl } from '~/data/articles';
const studioOrigin = useAppConfig().studioPreviewOrigin;
const recentUpdates = articles.filter((article) => article.eventDate).sort((a, b) => b.eventDate!.localeCompare(a.eventDate!)).slice(0, 3);

useSeoMeta({
  title: 'VKVstudio.pro — Better decisions about AI, search and the web',
  description: 'Source-led briefings from real engineering work. See the evidence, the limits, and the decision before the pitch.',
  robots: useAppConfig().indexable === true ? 'index, follow' : 'noindex, nofollow',
  ogTitle: 'VKVstudio.pro — Signal, evidence, decision',
  ogDescription: 'Practical briefings on AI, search and web engineering by Valerii Karpov.',
  ogImage: canonicalUrl('/og/home.png'),
  ogType: 'website',
});
useHead({ link: [{ rel: 'canonical', href: canonicalUrl('/') }] });
</script>

<template>
  <main id="main" tabindex="-1" class="shell">
    <section class="lead" aria-labelledby="page-title">
      <div class="lead__signal" aria-hidden="true"><span class="lead__signal-ring lead__signal-ring--one"></span><span class="lead__signal-ring lead__signal-ring--two"></span><span class="lead__signal-core"></span></div>
      <div class="lead__intro">
        <p class="eyebrow"><span class="eyebrow__rule" aria-hidden="true"></span> EU & UK · AI / SEARCH / WEB</p>
        <h1 id="page-title">When the story changes, <em>what should you do?</em></h1>
        <p class="lead__summary">A small editorial desk for consequential digital decisions. I read the source, show what was tested, and say what remains uncertain.</p>
        <div class="lead__actions">
          <NuxtLink class="button button--primary" :to="articlePath(articles[0]!.slug)">Read the lead briefing <span aria-hidden="true">↗</span></NuxtLink>
          <NuxtLink class="button button--secondary" to="/method/">How the work is checked <span aria-hidden="true">↗</span></NuxtLink>
        </div>
        <p class="lead__byline">Written and edited by <strong>Valerii Karpov</strong> · VKV Studio</p>
      </div>
      <aside class="lead__aside" aria-labelledby="audit-title">
        <div class="audit-card">
          <span class="audit-card__scan" aria-hidden="true"></span>
          <div class="audit-card__topline"><span class="status-dot" aria-hidden="true"></span><span>FOR A REAL BUSINESS DECISION</span><span class="audit-card__number">01 / 01</span></div>
          <h2 id="audit-title">What can your own site prove?</h2>
          <p>A briefing explains the issue. A scoped VKV Studio audit applies the same discipline to your business and gives you a plan.</p>
          <div class="audit-card__bottom"><span>Start with a baseline</span><a :href="studioLink('/en/services/geo-audit/', studioOrigin)">View audit scope <span aria-hidden="true">↗</span></a></div>
        </div>
        <p class="aside-note">Commercial services live on <span>vkvstudio.com</span>.</p>
      </aside>
    </section>

    <section class="editorial-grid" aria-labelledby="briefings-title">
      <div class="feature-column">
        <div class="section-heading"><h2 id="briefings-title">The briefing desk</h2><span>01 / LEAD STORY</span></div>
        <ArticleTeaser :article="articles[0]!" featured />
      </div>
      <aside class="upcoming" aria-label="More briefings">
        <div class="section-heading section-heading--aside"><h2>Read next</h2><NuxtLink to="/briefings/">ALL BRIEFINGS ↗</NuxtLink></div>
        <div class="upcoming__list"><ArticleTeaser v-for="article in recentUpdates" :key="article.slug" :article="article" /></div>
        <p class="upcoming__note">Each briefing names its sources, the status of our own checks and what the evidence cannot establish.</p>
      </aside>
    </section>

    <section class="method" aria-labelledby="method-title">
      <div class="method__intro"><p class="eyebrow">THE EDITORIAL RULE</p><h2 id="method-title">Show the work.<br /><em>Then make it useful.</em></h2><p>The conclusion comes early. The underlying evidence stays in reach.</p><NuxtLink class="text-link" to="/method/">Read the complete method ↗</NuxtLink></div>
      <ol class="method__steps">
        <li><span>01</span><strong>Original source</strong><p>A primary document or a link to the work itself.</p></li>
        <li><span>02</span><strong>Our check</strong><p>A test with conditions, or a clear “not tested”.</p></li>
        <li><span>03</span><strong>Decision</strong><p>What matters now, what can wait, and for whom.</p></li>
      </ol>
    </section>
  </main>
</template>
