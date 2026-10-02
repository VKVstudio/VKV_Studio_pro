<script setup lang="ts">
const publicRelease = useAppConfig().publicRelease === true;
const studioOrigin = useAppConfig().studioPreviewOrigin;
const motionPaused = useState('editorial-motion-paused', () => false);
</script>

<template>
  <div class="site-page">
    <a class="skip-link" href="#main">Skip to content</a>
    <div v-if="!publicRelease" class="preview-banner" role="status"><span class="preview-banner__marker" aria-hidden="true"></span>Editorial review · not published</div>
    <header class="site-header shell">
      <NuxtLink class="brand" to="/" aria-label="VKVstudio.pro home">
        <img src="/vkv-logo-compact.webp" width="60" height="35" alt="" decoding="async" />
        <span class="brand__name">VKVstudio<span>.pro</span></span>
      </NuxtLink>
      <nav class="primary-nav" aria-label="Primary">
        <NuxtLink to="/briefings/">Briefings</NuxtLink>
        <NuxtLink to="/method/">The method</NuxtLink>
        <NuxtLink to="/studio/">Studio</NuxtLink>
        <a :href="studioLink('/en/services/', studioOrigin)">Services ↗</a>
      </nav>
      <div class="site-header__controls">
        <label class="motion-control"><input v-model="motionPaused" type="checkbox" />Pause motion</label>
        <ThemeSelect />
      </div>
    </header>
    <slot />
    <footer class="site-footer">
      <div class="shell site-footer__inner">
        <div class="site-footer__brand">
          <img src="/vkv-logo-compact.webp" width="48" height="28" alt="" loading="lazy" decoding="async" />
          <div><strong>VKVstudio.pro</strong><span>Edited by Valerii Karpov</span></div>
        </div>
        <div class="site-footer__links">
          <NuxtLink to="/method/">Editorial method</NuxtLink>
          <NuxtLink to="/studio/">About the studio</NuxtLink>
          <NuxtLink to="/privacy/">Privacy and browser storage</NuxtLink>
          <a :href="studioLink('/en/services/', studioOrigin)">Services on vkvstudio.com ↗</a>
        </div>
      </div>
    </footer>
  </div>
</template>
