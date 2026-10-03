<script setup lang="ts">
import { ref } from 'vue';
import { briefingSearchParams } from '~/utils/briefing-search';

const searchError = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

function onSearchSubmit(event: Event): void {
  try {
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) throw new Error('Invalid search form');
    const input = form.elements.namedItem('q');
    if (!(input instanceof HTMLInputElement)) throw new Error('Invalid search field');
    // Read native agent prefill and human input from the same DOM field. Keep
    // valid submission native: the browser encodes q and completes navigation.
    const params = briefingSearchParams(new FormData(form).get('q'));
    input.value = params.q ?? '';
    searchError.value = '';
  } catch {
    event.preventDefault();
    searchError.value = 'Use a search phrase of at most 160 characters without control characters.';
    searchInput.value?.focus();
    const submission = event as SubmitEvent & {
      agentInvoked?: boolean;
      respondWith?: (value: Promise<unknown>) => void;
    };
    if (submission.agentInvoked === true && typeof submission.respondWith === 'function') {
      try {
        submission.respondWith(Promise.resolve({
          content: [{ type: 'text', text: JSON.stringify({ error: searchError.value }) }],
          isError: true,
        }));
      } catch { /* Visible validation remains available without agent completion. */ }
    }
  }
}
</script>

<template>
  <form class="home-search" action="/briefings/" method="get" role="search" toolname="search_briefings" tooldescription="Search briefing titles, introductions and topics by a literal phrase. Opens the briefing archive with matching results; an empty search shows all briefings." toolautosubmit @submit="onSearchSubmit">
    <label for="home-briefings-query">Search briefings</label>
    <div class="home-search__controls">
      <input id="home-briefings-query" ref="searchInput" name="q" type="search" maxlength="160" autocomplete="off" aria-describedby="home-briefings-help home-briefings-error" :aria-invalid="searchError ? true : undefined" toolparamdescription="Literal phrase for briefing titles, introductions or topics; an empty search returns the complete archive." @input="searchError = ''" />
      <button type="submit">Search</button>
    </div>
    <p id="home-briefings-help" class="home-search__help">Search titles, introductions and topics. An empty search shows all briefings.</p>
    <p id="home-briefings-error" class="home-search__error" role="status" aria-live="polite">{{ searchError }}</p>
  </form>
</template>

<style scoped>
.home-search { display: grid; gap: .6rem; max-width: 40rem; margin-bottom: 1.5rem; }
.home-search label { color: var(--paper); font: .75rem/1.4 var(--mono); }
.home-search__controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .6rem; }
.home-search input { width: 100%; min-width: 0; min-height: 44px; border: 1px solid var(--muted); border-radius: 0; padding: .65rem .8rem; background: var(--panel); color: var(--paper); font: 1rem/1.4 var(--display); }
.home-search button { min-height: 44px; border: 1px solid var(--mint); border-radius: 0; padding: .65rem 1rem; background: var(--mint); color: var(--ink); font: .75rem/1.4 var(--mono); cursor: pointer; touch-action: manipulation; }
.home-search button:hover { background: var(--mint-bright); }
.home-search input:focus-visible, .home-search button:focus-visible { outline: 3px solid var(--mint-bright); outline-offset: 3px; }
.home-search__help, .home-search__error { margin: 0; color: var(--muted); font: .75rem/1.6 var(--mono); }
.home-search__error { min-height: 1.2rem; }
@media (max-width: 480px) { .home-search__controls { grid-template-columns: minmax(0, 1fr); } }
</style>
