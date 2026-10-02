<script setup lang="ts">
import { canonicalUrl } from '~/data/articles';
useSeoMeta({ title: 'The editorial method — VKVstudio.pro', description: 'How VKVstudio.pro separates original sources, first-hand tests, business analysis and limits.', robots: useAppConfig().indexable === true ? 'index, follow' : 'noindex, nofollow', ogTitle: 'The editorial method — VKVstudio.pro', ogDescription: 'Original sources, named evidence, visible limits and useful decisions.', ogImage: canonicalUrl('/og/home.png') });
useHead({ link: [{ rel: 'canonical', href: canonicalUrl('/method/') }] });
</script>
<template>
  <main id="main" tabindex="-1" class="shell inner-page method-page">
    <div class="page-kicker">EDITORIAL STANDARD <span>02 / METHOD</span></div>
    <div class="page-heading"><h1>Trust the trail, <em>not the tone.</em></h1><p>A good briefing tells you what happened, what I checked and what is still an inference. The commercial recommendation must earn its place.</p></div>
    <div class="method-ledger"><div><span>01 / SOURCE</span><h2>Find the original.</h2><p>Prefer primary announcements, documentation, reports or the work itself. Cite the document beside the claim. A summary from another publication is a lead, not the final proof.</p></div><div><span>02 / STATUS</span><h2>Name the level of evidence.</h2><p>Announced, planned, tested, deployed and rejected are different states. If no first-hand test exists, the article says so. If a number comes from a lab run, it stays attached to its URL, date and conditions.</p></div><div><span>03 / LIMIT</span><h2>Show what it cannot prove.</h2><p>A speed score is not field performance. A citation is not a sale. A single successful device is not a usability study. Missing data remains missing; it does not become a guarantee.</p></div><div><span>04 / ACTION</span><h2>Make the decision useful.</h2><p>The reader gets the implication before the sales link. A related VKV Studio service appears only where the briefing identifies a real next step. Service scope and current pricing live on VKVstudio.com.</p></div></div>
    <div class="method-ethics"><p class="eyebrow">WHO IS BEHIND THE DESK</p><h2>One editor, accountable by name.</h2><p>Valerii Karpov is responsible for this editorial desk. The current pilot uses human review. Any future automatic news workflow needs evidence, quality and rights checks, an exception queue and a way to stop publication. Client work appears only with permission.</p><NuxtLink to="/studio/">Meet the studio ↗</NuxtLink></div>
  </main>
</template>
