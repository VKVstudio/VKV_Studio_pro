<script setup lang="ts">
import type { Article } from '~/data/articles';

defineProps<{ art: Article['art']; caption: string }>();
</script>

<template>
  <figure class="reading-visual">
    <div class="reading-visual__stage" :class="`reading-visual__stage--${art}`">
      <template v-if="art === 'performance-cache'">
        <span class="reading-visual__eyebrow">THE DELIVERED FILE</span>
        <div class="reading-visual__bar reading-visual__bar--long"><span>OLD ENCODE</span><strong>25.7 MB</strong></div>
        <div class="reading-visual__bar reading-visual__bar--short"><span>NEW ENCODE</span><strong>6.6 MB</strong></div>
        <div class="reading-visual__stamp">VERIFY THE EDGE ↗</div>
      </template>
      <template v-else-if="art === 'phone-mobile'">
        <span class="reading-visual__eyebrow">SAME PAGE / TWO WINDOWS</span>
        <div class="reading-visual__viewport"><div class="reading-visual__viewport-wide"><i></i><i></i><i></i></div><div class="reading-visual__viewport-phone"><i></i><i></i><i></i></div></div>
        <div class="reading-visual__stamp">CHECK THE REAL PHONE ↗</div>
      </template>
      <template v-else-if="art === 'ai-search-fundamentals'">
        <span class="reading-visual__eyebrow">START WITH THE PAGE</span>
        <div class="reading-visual__check"><span>01</span> Reachable content <b>✓</b></div>
        <div class="reading-visual__check"><span>02</span> Clear answer <b>✓</b></div>
        <div class="reading-visual__check"><span>03</span> Useful evidence <b>✓</b></div>
      </template>
      <template v-else-if="art === 'google-ai-search'">
        <span class="reading-visual__eyebrow">THE MEASUREMENT CHAIN</span>
        <div class="reading-visual__chain"><span>IMPRESSION</span><span>PAGE</span><span>ENQUIRY <b>?</b></span></div>
        <div class="reading-visual__stamp">VISIBILITY ≠ BUSINESS RESULT</div>
      </template>
      <template v-else-if="art === 'agents-api'">
        <span class="reading-visual__eyebrow">TOOL BOUNDARY</span>
        <div class="reading-visual__flow"><span>AGENT</span><b>→</b><span class="reading-visual__gate">PERMISSION</span><b>→</b><span>TOOL</span></div>
        <div class="reading-visual__stamp">LOG EACH ACTION</div>
      </template>
      <template v-else-if="art === 'sponsored-agents'">
        <span class="reading-visual__eyebrow">TWO DIFFERENT SURFACES</span>
        <div class="reading-visual__split"><span><b>PAID</b>Sponsored placement</span><span><b>OWNED</b>Your useful page</span></div>
        <div class="reading-visual__stamp">MEASURE THEM SEPARATELY</div>
      </template>
      <template v-else-if="art === 'shieldstral'">
        <span class="reading-visual__eyebrow">A GUARDRAIL IS A TEST</span>
        <div class="reading-visual__filter"><span>INPUT</span><b>FILTER</b><span>ALLOW<br />OR REVIEW</span></div>
        <div class="reading-visual__stamp">CHECK FALSE BLOCKS TOO</div>
      </template>
      <template v-else-if="art === 'nemotron'">
        <span class="reading-visual__eyebrow">ACTIVE ≠ RESIDENT</span>
        <div class="reading-visual__meter"><span>ACTIVE</span><strong>3B</strong><i></i></div>
        <div class="reading-visual__meter reading-visual__meter--full"><span>TOTAL</span><strong>30B</strong><i></i></div>
        <div class="reading-visual__stamp">MEMORY HOLDS THE MODEL</div>
      </template>
    </div>
    <figcaption>{{ caption }}</figcaption>
  </figure>
</template>
