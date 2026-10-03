import { defineNuxtPlugin } from '#app';
import { useHead } from '#imports';
import { themeBootstrap } from '~/utils/theme-bootstrap';

export default defineNuxtPlugin({
  name: 'theme-initialization-head',
  dependsOn: ['nuxt:head'],
  setup() {
    // Parser-time, hash-authorized code avoids a blocking network roundtrip.
    // Keep this server-only: hydration must not write a TrustedScript sink.
    useHead({ script: [{ key: 'vkv-pro-theme-init', textContent: themeBootstrap, tagPriority: 46 }] });
  },
});
