<script setup lang="ts">
const choice = ref<'system' | 'light' | 'dark'>('system');
const themeColor = ref('#0d1011');
let systemQuery: MediaQueryList | undefined;
useHead({ meta: [{ name: 'theme-color', content: () => themeColor.value, tagPriority: 45 }] });

function applyTheme() {
  const effective = choice.value === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : choice.value;
  document.documentElement.dataset.theme = effective;
  themeColor.value = effective === 'light' ? '#f4f1e9' : '#0d1011';
  try {
    if (choice.value === 'system') localStorage.removeItem('vkv-pro-theme');
    else localStorage.setItem('vkv-pro-theme', choice.value);
  } catch { /* Storage is optional. */ }
}

function applySystemTheme() {
  if (choice.value === 'system') applyTheme();
}

onMounted(() => {
  systemQuery = window.matchMedia('(prefers-color-scheme: light)');
  systemQuery.addEventListener('change', applySystemTheme);
  try {
    const stored = localStorage.getItem('vkv-pro-theme');
    if (stored === 'light' || stored === 'dark') choice.value = stored;
  } catch { /* Keep the system setting. */ }
  watch(choice, applyTheme, { immediate: true });
});
onBeforeUnmount(() => systemQuery?.removeEventListener('change', applySystemTheme));
</script>

<template>
  <label class="theme-control">
    <span class="theme-control__label">Theme</span>
    <select v-model="choice" aria-label="Color theme">
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>
</template>
