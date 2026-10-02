<script setup lang="ts">
import { canonicalUrl } from '~/data/articles';

const route = useRoute();
useSeoMeta({
  ogSiteName: 'VKVstudio.pro',
  ogType: 'website',
  ogLocale: 'en_GB',
  ogUrl: () => canonicalUrl(route.path),
  ogImageWidth: 1200,
  ogImageHeight: 627,
  twitterCard: 'summary_large_image',
});
</script>

<template>
  <NuxtLayout><NuxtPage /></NuxtLayout>
</template>
