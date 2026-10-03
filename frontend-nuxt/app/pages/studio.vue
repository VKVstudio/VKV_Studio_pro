<script setup lang="ts">
import { studioLink } from '~/utils/studio-links';
import { canonicalUrl } from '~/data/articles';
import { editorialProfileSchema, serializeEditorialSchema } from '~/utils/editorial-schema';
import markets from '~/data/markets.json';
const studioOrigin = useAppConfig().studioPreviewOrigin;
useSeoMeta({ title: 'About Valerii Karpov and VKV Studio — VKVstudio.pro', description: 'An independent editorial desk by Valerii Karpov, connecting first-hand engineering work to practical business decisions.', robots: useAppConfig().indexable === true ? 'index, follow' : 'noindex, nofollow', ogTitle: 'About VKVstudio.pro', ogDescription: 'A small, accountable practice. Real projects set the questions.', ogImage: canonicalUrl('/og/home.png') });
useHead({ link: [{ rel: 'canonical', href: canonicalUrl('/studio/') }], script: [{ key: 'editorial-schema', type: 'application/ld+json', textContent: serializeEditorialSchema(editorialProfileSchema) }] });
</script>
<template>
  <main id="main" tabindex="-1" class="shell inner-page studio-page">
    <div class="page-kicker">BEHIND THE DESK <span>03 / STUDIO</span></div>
    <div class="page-heading"><h1>Built by a practitioner. <em>Edited for decisions.</em></h1><p>VKVstudio.pro is the editorial side of VKV Studio. The work is written and edited by Valerii Karpov.</p></div>
    <div class="studio-grid"><div class="studio-grid__visual"><div class="theme-art theme-art--studio-desk" role="img" aria-label="A staged editorial workbench with a source book, review papers, laptop and phone"></div><span>01 / AN EDITORIAL ILLUSTRATION</span></div><div class="studio-grid__copy"><p class="eyebrow">A SMALL, ACCOUNTABLE PRACTICE</p><h2>Real projects set the questions.</h2><p>I build and review websites and applied AI systems. That work creates specific questions about performance, search, UX and trust. Here I follow those questions back to primary sources and to what the work actually showed.</p><p>This is not a claim to have tested every trend. Some briefings are first-hand field notes; others explain an official source and mark the absence of a test. I name the difference.</p><div class="studio-grid__actions"><NuxtLink class="button button--primary" to="/briefings/">Read the briefings ↗</NuxtLink><a class="button button--secondary" :href="studioLink('/en/services/', studioOrigin)">Explore studio services ↗</a></div></div></div>
    <section class="studio-paths" aria-label="Explore the practice">
      <a :href="studioLink('/en/', studioOrigin)"><span>01 / THE WORK</span><h2>See the engineering.</h2><p>The studio portfolio and working tools put the practice in view.</p><b>Explore VKV Studio ↗</b></a>
      <NuxtLink to="/method/"><span>02 / THE STANDARD</span><h2>Inspect the method.</h2><p>How sources, tests and limits become an accountable recommendation.</p><b>Read the editorial method ↗</b></NuxtLink>
      <a :href="studioLink('/en/contact/', studioOrigin)"><span>03 / YOUR PROJECT</span><h2>Bring a real question.</h2><p>Describe your project by email. Scope, questions and agreements are handled in writing.</p><b>Discuss the project by email ↗</b></a>
    </section>
    <section class="method-ethics" aria-labelledby="studio-markets-heading">
      <h2 id="studio-markets-heading">An English-language desk for B2B decisions.</h2>
      <p>The briefings are written in English for business decision-makers. Project work is remote from Armenia, with buyer questions, query language and scope agreed in writing through VKVstudio.</p>
      <p>Current focus: {{ markets.map(market => market.en).join(', ') }}.</p>
      <p><a :href="studioLink('/en/services/geo-audit/', studioOrigin)">Explore the AI Search Visibility Audit ↗</a></p>
    </section>
  </main>
</template>
