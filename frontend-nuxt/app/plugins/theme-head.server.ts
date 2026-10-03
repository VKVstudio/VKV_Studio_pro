import { defineNuxtPlugin } from '#app';
import { useHead } from '#imports';

export default defineNuxtPlugin({
  name: 'theme-initialization-head',
  dependsOn: ['nuxt:head'],
  setup() {
    // Run before first paint in generated HTML. Client head updates must not
    // reassign a plain script URL under the enforced Trusted Types policy.
    useHead({ script: [{ key: 'vkv-pro-theme-init', src: '/theme-init.js' }] });
  },
});
