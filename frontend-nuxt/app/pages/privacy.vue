<script setup lang="ts">
import { canonicalUrl } from '~/data/articles';
const studioOrigin = useAppConfig().studioPreviewOrigin;
useSeoMeta({ title: 'Privacy and browser storage — VKVstudio.pro', description: 'What the VKVstudio.pro editorial frontend stores in your browser and what happens when you follow external links.', robots: useAppConfig().indexable === true ? 'index, follow' : 'noindex, nofollow', ogTitle: 'Privacy and browser storage — VKVstudio.pro', ogDescription: 'Theme preference, external links and the limits of the current review build.', ogImage: canonicalUrl('/og/home.png') });
useHead({ link: [{ rel: 'canonical', href: canonicalUrl('/privacy/') }] });
</script>
<template>
  <main id="main" tabindex="-1" class="shell inner-page method-page">
    <div class="page-kicker">PRIVACY <span>VKVSTUDIO.PRO</span></div>
    <div class="page-heading"><h1>What this site <em>stores.</em></h1><p>This notice covers the VKVstudio.pro editorial frontend. Last reviewed: 1 October 2026.</p></div>
    <div class="method-ledger">
      <div><span>01 / YOUR BROWSER</span><h2>A saved theme choice.</h2><p>If you choose light or dark, the site saves that preference in your browser’s localStorage under <code>vkv-pro-theme</code>. It is read on later visits. Choosing System removes the saved choice and follows your device setting. The preference is not sent to an analytics service by this frontend; you can also remove it through your browser’s site-data controls.</p></div>
      <div><span>02 / REQUESTS</span><h2>Pages and hosting.</h2><p>Loading a hosted page requires requests for its HTML, scripts, fonts and images. A hosting service can receive request metadata such as an IP address, browser information and requested URL. The current review build has no analytics script, advertising tracker, reader account or enquiry form. Actual production hosting, log retention and processor details are not yet confirmed; they must be documented before a public release. This notice does not claim that hosting collects no data.</p></div>
      <div><span>03 / EXTERNAL LINKS</span><h2>Other sites have their own policies.</h2><p>Source links, service links and sharing links take you to separate services. Their data practices apply when you open them. VKVstudio.com is the studio’s separate service website; its privacy notice covers that domain. The editorial frontend does not submit an enquiry, send an email or publish a social post for you. A native sharing or clipboard action runs only when you choose it.</p><a :href="studioLink('/en/privacy/', studioOrigin)">VKVstudio.com privacy notice ↗</a></div>
      <div><span>04 / QUESTIONS</span><h2>Contact the editor.</h2><p>Valerii Karpov edits this publication. Use the studio’s contact page for a question about this notice or an editorial correction. Opening that page is a visit to VKVstudio.com; sending a message is a separate action under its notice.</p><a :href="studioLink('/en/contact/', studioOrigin)">Studio contact options ↗</a></div>
    </div>
  </main>
</template>
