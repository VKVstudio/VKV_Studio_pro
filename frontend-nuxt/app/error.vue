<script setup lang="ts">
import type { NuxtError } from '#app';

const props = defineProps<{ error: NuxtError }>();
const notFound = computed(() => props.error.statusCode === 404);
useSeoMeta({
  title: () => `${notFound.value ? 'Page not found' : 'Page unavailable'} — VKVstudio.pro`,
  description: 'Return to the briefing desk for source-led decisions on AI, search and web engineering.',
  robots: 'noindex, nofollow',
});
</script>

<template>
  <NuxtLayout>
    <main id="main" class="shell inner-page error-page">
      <div class="page-kicker">A BREAK IN THE TRAIL <span>{{ notFound ? '404 / NOT FOUND' : 'PAGE UNAVAILABLE' }}</span></div>
      <div class="page-heading">
        <h1>{{ notFound ? 'This page is off the desk.' : 'The desk needs a moment.' }} <em>The trail continues.</em></h1>
        <div><p>{{ notFound ? 'The address may have changed, or the page may not exist. Start again with the current briefings.' : 'This page could not be opened. Return to the desk and try again.' }}</p><button class="button button--primary" type="button" @click="clearError({ redirect: '/' })">Back to the briefing desk <span aria-hidden="true">↗</span></button></div>
      </div>
    </main>
  </NuxtLayout>
</template>
