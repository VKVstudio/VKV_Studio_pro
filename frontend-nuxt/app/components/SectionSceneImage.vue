<script setup lang="ts">
const props = defineProps<{
  sceneId: string;
  alt: string;
  mode: 'deck' | 'inline';
  active?: boolean;
}>();

const stage = ref<HTMLElement | null>(null);
const theme = ref<'day' | 'night' | null>(null);
const isDesktop = ref(false);
const reached = ref(false);
const imageUrl = computed(() => {
  if (!theme.value || !reached.value) return undefined;
  if (props.mode === 'deck' ? !isDesktop.value : isDesktop.value) return undefined;
  return `/images/${props.sceneId}-${theme.value}.webp`;
});

let themeObserver: MutationObserver | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let desktopQuery: MediaQueryList | undefined;
const syncViewport = () => { isDesktop.value = desktopQuery?.matches ?? false; };

onMounted(() => {
  const syncTheme = () => {
    const selected = document.documentElement.dataset.theme;
    theme.value = selected === 'light' || (selected !== 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches)
      ? 'day'
      : 'night';
  };
  syncTheme();
  themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  desktopQuery = window.matchMedia('(min-width: 1101px) and (min-height: 600px)');
  syncViewport();
  desktopQuery.addEventListener('change', syncViewport);

  if (props.mode === 'inline' && stage.value) {
    intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        reached.value = true;
        intersectionObserver?.disconnect();
      }
    }, { rootMargin: '200px 0px' });
    intersectionObserver.observe(stage.value);
  }
});

watch(() => props.active, (active) => {
  if (props.mode === 'deck' && active) reached.value = true;
}, { immediate: true });

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  intersectionObserver?.disconnect();
  desktopQuery?.removeEventListener('change', syncViewport);
});
</script>

<template>
  <div ref="stage" class="article-scene__image">
    <img v-if="imageUrl" :src="imageUrl" :alt="alt" width="960" height="960" decoding="async" />
  </div>
</template>
