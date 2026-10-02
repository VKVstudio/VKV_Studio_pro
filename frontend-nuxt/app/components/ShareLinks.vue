<script setup lang="ts">
const props = defineProps<{ title: string; url: string }>();
const feedback = ref('');
const canShare = ref(false);
onMounted(() => { canShare.value = typeof navigator.share === 'function'; });

async function share() {
  if (!navigator.share) return;
  try { await navigator.share({ title: props.title, url: props.url }); }
  catch { /* Cancelled native share is not an error for the reader. */ }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url);
    feedback.value = 'Link copied';
  } catch { feedback.value = 'Select the link below to copy it'; }
}
</script>

<template>
  <div class="share-panel" role="region" aria-label="Share this article">
    <span class="share-panel__label">SHARE THIS BRIEFING</span>
    <div class="share-panel__actions">
      <button v-if="canShare" type="button" @click="share">Share ↗</button>
      <a :href="`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>
      <button type="button" @click="copy">Copy link</button>
    </div>
    <span class="share-panel__feedback" role="status">{{ feedback }}</span>
    <a class="share-panel__url" :href="url">{{ url }}</a>
  </div>
</template>
