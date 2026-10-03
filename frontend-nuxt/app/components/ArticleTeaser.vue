<script setup lang="ts">
import type { Article } from '~/data/articles';
import { articlePath } from '~/data/articles';
const props = defineProps<{ article: Article; featured?: boolean; headingLevel?: 2 | 3 }>();
const artElement = ref<HTMLElement | null>(null);
const artReady = ref(props.featured === true);
let artObserver: IntersectionObserver | null = null;

onMounted(() => {
  if (props.featured || artReady.value) return;
  if (!artElement.value || typeof IntersectionObserver === 'undefined') {
    artReady.value = true;
    return;
  }
  artObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    artReady.value = true;
    artObserver?.disconnect();
    artObserver = null;
  }, { rootMargin: '400px 0px', threshold: 0 });
  artObserver.observe(artElement.value);
});

onBeforeUnmount(() => {
  artObserver?.disconnect();
  artObserver = null;
});
</script>

<template>
  <article :class="featured ? 'feature-card' : 'upcoming-card'">
    <NuxtLink :to="articlePath(article.slug)" :class="featured ? 'feature-card__visual teaser-visual' : 'upcoming-card__visual teaser-visual'" :aria-label="`${featured ? 'SIGNAL / EVIDENCE / DECISION — ' : ''}Read: ${article.title}`">
      <span ref="artElement" :class="featured || artReady ? `theme-art theme-art--${article.art}` : 'theme-art'" aria-hidden="true"></span>
      <span v-if="featured" class="feature-card__art-label" aria-hidden="true">SIGNAL / EVIDENCE / DECISION</span>
    </NuxtLink>
    <div :class="featured ? 'feature-card__body' : 'upcoming-card__body'">
      <div :class="featured ? 'feature-card__meta' : 'upcoming-card__meta'">
        <span>{{ article.category }}</span>
        <span>{{ article.eventDate ? `${article.eventLabel ?? 'EVENT'} ${article.eventDate}` : `${article.minutes} min read` }}</span>
      </div>
      <component :is="`h${headingLevel ?? 3}`" class="teaser-title"><NuxtLink class="title-link" :to="articlePath(article.slug)">{{ article.title }}</NuxtLink></component>
      <p>{{ article.dek }}</p>
      <div v-if="featured" class="feature-card__footer">
        <span>By Valerii Karpov</span>
        <NuxtLink :to="articlePath(article.slug)" :aria-label="`Read the briefing: ${article.title}`">Read the briefing <span aria-hidden="true">↗</span></NuxtLink>
      </div>
      <NuxtLink v-else class="upcoming-card__foot" :to="articlePath(article.slug)" :aria-label="`Read briefing: ${article.title}`">Read briefing <span aria-hidden="true">↗</span></NuxtLink>
    </div>
  </article>
</template>
