<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { articles, canonicalUrl } from '~/data/articles';
import type { Article } from '~/data/articles';
import { briefingSearchParams, briefingTopicParams, filterBriefings, readBriefingArchiveState, readBriefingQuery } from '~/utils/briefing-search';
import type { BriefingArchiveState, BriefingTopic } from '~/utils/briefing-search';

type Topic = BriefingTopic;

const topics: { value: Topic; label: string }[] = [
  { value: 'all', label: 'All briefings' },
  { value: 'ai-search', label: 'AI search' },
  { value: 'agents-commerce', label: 'Agents & commerce' },
  { value: 'local-ai', label: 'Local AI' },
  { value: 'field-notes', label: 'Field notes' },
];

const route = useRoute();
const hydrated = ref(false);
const searchQuery = ref('');
const searchError = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const publicRelease = useAppConfig().publicRelease === true;
onMounted((): void => { hydrated.value = true; });
const archiveState = computed((): BriefingArchiveState => {
  // Generated HTML starts with the full archive; hydration restores the URL state.
  return hydrated.value ? readBriefingArchiveState(route.query) : { query: '', topic: 'all' };
});
const submittedQuery = computed((): string => archiveState.value.query);
const selectedTopic = computed((): Topic => archiveState.value.topic);
watch(archiveState, (state): void => {
  searchQuery.value = state.query;
  searchError.value = '';
}, { immediate: true });

function selectTopic(topic: Topic): void {
  // Topic navigation clears the search phrase and carries only known filter keys.
  void Promise.resolve(navigateTo({ path: route.path, query: briefingTopicParams(topic), hash: route.hash }))
    .catch((): void => { searchError.value = 'The topic could not update this page. Try again.'; });
}
const leadArticle = computed((): Article | undefined => articles[0]);
const archiveArticles = [...articles.slice(1)].sort((a, b) => (b.eventDate ?? b.checkedAt).localeCompare(a.eventDate ?? a.checkedAt));
const orderedArticles = computed((): Article[] => leadArticle.value ? [leadArticle.value, ...archiveArticles] : archiveArticles);
const filteredArticles = computed((): Article[] => filterBriefings(orderedArticles.value, submittedQuery.value).filter((article) => {
  const category = article.category.toLowerCase();
  switch (selectedTopic.value) {
    case 'ai-search': return category.includes('ai search');
    case 'agents-commerce': return category.includes('ai agents') || category.includes('ai commerce');
    case 'local-ai': return category.includes('local ai');
    case 'field-notes': return category.startsWith('field note');
    default: return true;
  }
}));
const resultCount = computed((): number => filteredArticles.value.length);

function onSearchSubmit(event: Event): void {
  event.preventDefault();
  const submission = event as SubmitEvent & {
    agentInvoked?: boolean;
    respondWith?: (value: Promise<unknown>) => void;
  };
  const errorResult = (): { content: { type: 'text'; text: string }[]; isError: true } => ({
    content: [{ type: 'text', text: JSON.stringify({ error: searchError.value }) }],
    isError: true,
  });
  let completion: Promise<unknown>;
  try {
    if (!(event.currentTarget instanceof HTMLFormElement)) throw new Error('Invalid search form');
    // Read the DOM value so native agent prefill and human input share validation.
    const query = readBriefingQuery(new FormData(event.currentTarget).get('query'));
    searchQuery.value = query;
    searchError.value = '';
    // An empty query restores the original featured composition; search removes topic.
    completion = Promise.resolve(navigateTo({ path: route.path, query: briefingSearchParams(query), hash: route.hash }))
      .then(async (): Promise<unknown> => {
        await nextTick();
        const state = readBriefingArchiveState(route.query);
        if (state.query !== query || state.topic !== 'all') throw new Error('Search navigation did not complete');
        return {
          content: [{ type: 'text', text: JSON.stringify({
            matched: filteredArticles.value.length,
            status: publicRelease ? 'published' : 'review',
            archive: canonicalUrl('/briefings/'),
          }) }],
        };
      })
      .catch((): unknown => {
        searchError.value = 'Search could not update this page. Try again.';
        searchInput.value?.focus();
        return errorResult();
      });
  } catch {
    searchError.value = 'Use a search phrase of at most 160 characters without control characters.';
    searchInput.value?.focus();
    completion = Promise.resolve(errorResult());
  }
  if (submission.agentInvoked === true && typeof submission.respondWith === 'function') {
    try {
      // Native respondWith must run during dispatch, before navigation awaits.
      submission.respondWith(completion);
    } catch {
      // The visible search still works when native agent completion is unavailable.
    }
  }
}
useSeoMeta({
  title: 'Briefings — VKVstudio.pro',
  description: 'A reading desk for source-led decisions on AI search, mobile experience and web performance.',
  robots: useAppConfig().indexable === true ? 'index, follow' : 'noindex, nofollow',
  ogTitle: 'Briefings — VKVstudio.pro',
  ogDescription: 'Evidence first. Decisions second. The pitch comes last.',
  ogImage: canonicalUrl('/og/home.png'),
});
useHead({
  link: [{ rel: 'canonical', href: canonicalUrl('/briefings/') }],
  // Unhead's normal meta weight is 100; the theme script is 50.
  meta: leadArticle.value ? [{ name: 'vkv-pro-preload-art', content: leadArticle.value.art, tagPriority: 45 }] : [],
});
</script>

<template>
  <main id="main" tabindex="-1" class="shell inner-page">
    <div class="page-kicker">THE BRIEFING DESK <span>01 / ARCHIVE</span></div>
    <div class="page-heading"><h1>Ideas worth <em>checking.</em></h1><p>Each article begins with a conclusion, then shows where the claim came from, what was actually checked and what remains unknown.</p></div>
    <form class="archive-search" method="dialog" role="search" :aria-busy="!hydrated" toolname="search_briefings" tooldescription="Search the active briefing archive by a literal phrase in titles, introductions or topics. Filters the visible list and returns the result count and editorial status." toolautosubmit @submit="onSearchSubmit">
      <label for="briefings-search-query">Search briefings</label>
      <div class="archive-search__controls">
        <input id="briefings-search-query" ref="searchInput" v-model="searchQuery" :disabled="!hydrated" name="query" type="search" maxlength="160" autocomplete="off" aria-describedby="briefings-search-help briefings-search-error" :aria-invalid="searchError ? true : undefined" toolparamdescription="Literal phrase for briefing titles, introductions or topics; an empty search returns the complete archive." />
        <button type="submit" :disabled="!hydrated">Search</button>
      </div>
      <p id="briefings-search-help" class="archive-search__help">Search titles, introductions and topics. An empty search shows all briefings.</p>
      <p id="briefings-search-error" class="archive-search__error" role="status" aria-live="polite">{{ searchError }}</p>
    </form>
    <section class="archive-topics" aria-label="Filter briefings by topic">
      <div class="archive-topics__heading"><span>EXPLORE THE DESK</span><p role="status" aria-live="polite">{{ resultCount }} {{ resultCount === 1 ? 'briefing' : 'briefings' }} shown</p></div>
      <div class="archive-topics__choices">
        <button v-for="topic in topics" :key="topic.value" type="button" :disabled="!hydrated" :aria-pressed="selectedTopic === topic.value" @click="selectTopic(topic.value)">{{ topic.label }}</button>
      </div>
    </section>
    <template v-if="selectedTopic === 'all' && !submittedQuery">
      <div v-if="leadArticle" class="archive-feature"><ArticleTeaser :article="leadArticle" :heading-level="2" featured /></div>
      <div v-if="archiveArticles.length" class="archive-grid"><ArticleTeaser v-for="article in archiveArticles" :key="article.slug" :article="article" :heading-level="2" /></div>
      <p v-if="!orderedArticles.length" class="archive-empty">No briefings are available yet.</p>
    </template>
    <div v-else-if="filteredArticles.length" class="archive-grid"><ArticleTeaser v-for="article in filteredArticles" :key="article.slug" :article="article" :heading-level="2" /></div>
    <p v-else class="archive-empty">{{ submittedQuery ? 'No briefings match this search. Try another phrase or submit an empty search.' : 'No briefings in this topic yet.' }}</p>
    <div class="archive-end"><span>END OF THE CURRENT DESK</span><p>New material enters this archive only after source, claim and editorial review.</p><NuxtLink to="/method/">Read the method ↗</NuxtLink></div>
  </main>
</template>

<style scoped>
.archive-topics { border-top: 1px solid var(--line); margin-bottom: clamp(2rem, 4vw, 3rem); padding-top: 1rem; }
.archive-topics__heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .5rem 2rem; margin-bottom: 1rem; }
.archive-topics__heading span { color: var(--mint); font: .75rem/1.4 var(--mono); letter-spacing: .06em; }
.archive-topics__heading p { margin: 0; color: var(--muted); font: .75rem/1.4 var(--mono); }
.archive-topics__choices { display: flex; flex-wrap: wrap; gap: .5rem; }
.archive-topics__choices button { min-height: 44px; border: 1px solid var(--line); border-radius: 0; background: transparent; color: var(--muted); padding: .65rem 1rem; font: .75rem/1.4 var(--mono); cursor: pointer; }
.archive-topics__choices button:hover { border-color: var(--mint); color: var(--paper); }
.archive-topics__choices button[aria-pressed='true'] { border-color: var(--mint); background: var(--mint); color: var(--ink); }
.archive-topics__choices button:focus-visible { outline: 3px solid var(--mint-bright); outline-offset: 3px; }
.archive-empty { margin: 0; padding-block: 3rem; color: var(--muted); }
.archive-search { display: grid; gap: .6rem; max-width: 40rem; margin-bottom: 1.5rem; }
.archive-search label { color: var(--paper); font: .75rem/1.4 var(--mono); }
.archive-search__controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .6rem; }
.archive-search input { width: 100%; min-width: 0; min-height: 44px; border: 1px solid var(--muted); border-radius: 0; padding: .65rem .8rem; background: var(--panel); color: var(--paper); font: 1rem/1.4 var(--display); }
.archive-search button { min-height: 44px; border: 1px solid var(--mint); border-radius: 0; padding: .65rem 1rem; background: var(--mint); color: var(--ink); font: .75rem/1.4 var(--mono); cursor: pointer; touch-action: manipulation; }
.archive-search button:hover { background: var(--mint-bright); }
.archive-search input:focus-visible, .archive-search button:focus-visible { outline: 3px solid var(--mint-bright); outline-offset: 3px; }
.archive-search__help, .archive-search__error { margin: 0; color: var(--muted); font: .75rem/1.6 var(--mono); }
.archive-search__error { min-height: 1.2rem; }
@media (max-width: 480px) { .archive-search__controls { grid-template-columns: minmax(0, 1fr); } }
</style>
