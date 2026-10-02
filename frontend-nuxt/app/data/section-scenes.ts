/** Art direction for section-specific editorial scenes. Images are reconstructions, not screenshots. */
export interface SectionScene {
  id: string;
  label: string;
  alt: string;
  caption: string;
}

export const sectionScenesBySlug: Record<string, SectionScene[]> = {
  'agents-api-still-needs-a-boundary': [
    {
      id: 'agents-api-01',
      label: 'TOOLS / AUTHORITY',
      alt: 'A staged modular workbench connects tools to a central box while an authorisation latch remains separate',
      caption: 'An editorial illustration: connecting a tool does not grant authority to use it.',
    },
    {
      id: 'agents-api-02',
      label: 'THE NARROW PILOT',
      alt: 'A bounded reading desk holds a source book and answer sheet, with covered tools outside the working area',
      caption: 'A staged pilot boundary: one answerable task, explicit sources and human review.',
    },
    {
      id: 'agents-api-03',
      label: 'THE DATA BOUNDARY',
      alt: 'A glass partition separates a private document drawer from a remote computer, with a controlled pass-through tray',
      caption: 'A conceptual data boundary, not an implemented security architecture or API interface.',
    },
  ],
  'sponsored-agents-are-still-ads': [
    {
      id: 'sponsored-agents-01',
      label: 'PLACEMENT / ANSWER',
      alt: 'A copper-framed advertising card and folded reply card sit separately from an open reference book',
      caption: 'A staged distinction between paid placement and an independent answer; not a ChatGPT screenshot.',
    },
    {
      id: 'sponsored-agents-02',
      label: 'KEEP THE LABEL',
      alt: 'An advertising proof, receipt and budget envelope are separated by glass from reference material and an answer sheet',
      caption: 'An editorial illustration of disclosure and evidence, not campaign results or a live ad report.',
    },
    {
      id: 'sponsored-agents-03',
      label: 'TEST / HANDOFF',
      alt: 'A product, three specification cards, a finite budget envelope and a telephone form a small reviewable campaign setup',
      caption: 'A staged buying test: clear product facts, a bounded budget and an accountable human handoff.',
    },
  ],
  'shieldstral-is-a-guardrail-candidate': [
    {
      id: 'shieldstral-01',
      label: 'POLICY / EXAMPLE',
      alt: 'A text sample and picture are examined beneath an adjustable lens between document input and output trays',
      caption: 'A staged policy review, not a measured Shieldstral classification or product interface.',
    },
    {
      id: 'shieldstral-02',
      label: 'THE DEPLOYMENT TEST',
      alt: 'An opened laptop, separate memory module, unmarked dial and blank notebook illustrate a hardware capacity review',
      caption: 'An editorial illustration: memory, latency and the intended workload still need a local test.',
    },
    {
      id: 'shieldstral-03',
      label: 'TEST / ENFORCE',
      alt: 'Green, amber and red example trays sit beside a blank review notebook, separate from a locked access door and key cabinet',
      caption: 'A staged distinction: review classifier outcomes, then enforce permissions in a separate control.',
    },
  ],
  'google-ai-search-controls-and-insights': [
    {
      id: 'google-ai-search-01',
      label: 'PAGES / MARKETS',
      alt: 'A staged wall of page proofs arranged beneath geographic panels, with a lens examining one page',
      caption: 'An editorial illustration of pages and markets, not a Search Console report or measured coverage.',
    },
    {
      id: 'google-ai-search-02',
      label: 'APPEARANCE / ENQUIRY',
      alt: 'An information card at a shop window is separated by open space from a closed enquiry ledger on the counter',
      caption: 'A conceptual separation: appearing in view does not establish that a customer made an enquiry.',
    },
    {
      id: 'google-ai-search-03',
      label: 'TWO INVESTIGATIONS',
      alt: 'A staged service-page review separates content inspection with a lens from the contact path and an envelope',
      caption: 'A blank review method: investigate crawlable content and the offer-to-contact path separately.',
    },
  ],
  'ai-search-no-magic-file': [
    {
      id: 'ai-search-fundamentals-01',
      label: 'THE USEFUL PAGE',
      alt: 'A staged service page appears on a tablet and in print beneath a reading lens, while a glossy folder sits unused',
      caption: 'A staged content review: clear, reachable pages matter more than a secret shortcut.',
    },
    {
      id: 'ai-search-fundamentals-02',
      label: 'CAPTURE THE BASELINE',
      alt: 'Four illustrative page cards are connected to unfilled status, question and geography fields on a review board',
      caption: 'A blank review method, not live Search Console data: map pages, index status, questions and markets before changing copy.',
    },
    {
      id: 'ai-search-fundamentals-03',
      label: 'BUY THE TEST',
      alt: 'A plain open audit worksheet is selected beside a glossy closed proposal pack',
      caption: 'An editorial illustration of the buying decision: ask for an accountable baseline and test.',
    },
  ],
  'the-hundred-and-the-cache': [
    {
      id: 'performance-cache-01',
      label: 'THE LATE HEADLINE',
      alt: 'Three staged contact prints show the same video-led first screen before its headline appears in the final frame',
      caption: 'An editorial reconstruction of the first screen and its delayed headline, not a browser capture.',
    },
    {
      id: 'performance-cache-02',
      label: 'SOURCE / EDGE',
      alt: 'A compact edited video timeline on a laptop contrasts with a longer older timeline still shown in the delivery window',
      caption: 'A staged source-versus-delivery comparison: a smaller local file did not replace the cached copy.',
    },
    {
      id: 'performance-cache-03',
      label: 'VERIFY THE RESPONSE',
      alt: 'Laptop and phone show the same staged homepage beside an unfilled review checklist and response sheet',
      caption: 'A staged review setup: check the delivered page and network response on the devices that matter.',
    },
  ],
  'the-phone-saw-a-different-site': [
    {
      id: 'phone-mobile-01',
      label: 'THE THREE FAULTS',
      alt: 'Three printed mobile page studies show an oversized video, an empty circular mark and excessive blank space',
      caption: 'An editorial reconstruction of the three faults found on the phone.',
    },
    {
      id: 'phone-mobile-02',
      label: 'THE REPAIR',
      alt: 'A phone displays a complete mobile page beside a calm headline panel and a separate architectural image',
      caption: 'An editorial reconstruction of the repair: image, message and action share the first screen.',
    },
    {
      id: 'phone-mobile-03',
      label: 'THE FIELD CHECK',
      alt: 'A hand holds a phone with a readable page beside a printed desktop layout for comparison',
      caption: 'A staged phone view illustrates the reading path to verify on a real device.',
    },
  ],
  'nemotron-active-parameters-are-not-memory': [
    {
      id: 'nemotron-01',
      label: 'ACTIVE / TOTAL',
      alt: 'A thick archive of stored sheets sits behind three selected sheets arranged in a narrow working lane',
      caption: 'An active-expert metaphor: the full set of weights still occupies storage.',
    },
    {
      id: 'nemotron-02',
      label: 'THE FIT CHECK',
      alt: 'A compact closed laptop sits beside a much thicker stack of storage cards, two review cards and a sealed folder',
      caption: 'Hardware capacity, language evaluation and licence are separate deployment checks.',
    },
    {
      id: 'nemotron-03',
      label: 'THE TEST PLAN',
      alt: 'A source document and answer card sit beside a timing instrument and a latched tool-access gate',
      caption: 'Compare grounded answers, latency and tool permissions on the same workload.',
    },
  ],
};
