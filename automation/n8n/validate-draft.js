const response = $input.first().json;
const candidate = $('Validate candidate and build request').first().json.candidate;
const own = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => own(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
const text = (v, max) => typeof v === 'string' && !!v.trim() && v.length <= max && !/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v);
if (!own(response) || !Array.isArray(response.choices) || response.choices.length !== 1 || response.choices[0].finish_reason !== 'stop') throw new Error('Incomplete model response');
if (!own(response.usage) || !Number.isInteger(response.usage.prompt_tokens) || !Number.isInteger(response.usage.completion_tokens) || response.usage.prompt_tokens > 3000 || response.usage.completion_tokens > 900) throw new Error('Token budget exceeded or usage missing');
const raw = response.choices[0].message?.content;
if (typeof raw !== 'string' || raw.length > 12000) throw new Error('Invalid model content');
let draft;
try { draft = JSON.parse(raw); } catch { throw new Error('Model did not return JSON'); }
if (!exact(draft, ['claims', 'draftSections']) || !Array.isArray(draft.claims) || draft.claims.length < 1 || draft.claims.length > 4 || !Array.isArray(draft.draftSections) || draft.draftSections.length < 2 || draft.draftSections.length > 4) throw new Error('Invalid draft shape');
const ids = new Set();
for (const claim of draft.claims) {
  if (!exact(claim, ['id', 'kind', 'claim', 'sourceUrl', 'support', 'limit']) || typeof claim.id !== 'string' || claim.id.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(claim.id) || ids.has(claim.id) || claim.kind !== 'source' || claim.sourceUrl !== candidate.sourceUrl || !text(claim.claim, 600) || !text(claim.support, 800) || !candidate.sourceExcerpt.includes(claim.support) || !text(claim.limit, 400)) throw new Error('Invalid source claim');
  ids.add(claim.id);
}
for (const section of draft.draftSections) {
  if (!exact(section, ['heading', 'paragraphs']) || !text(section.heading, 120) || !Array.isArray(section.paragraphs) || section.paragraphs.length < 1 || section.paragraphs.length > 3 || !section.paragraphs.every((p) => text(p, 700))) throw new Error('Invalid draft section');
}
return [{ json: { storyId: candidate.id, candidate, unverifiedClaimSuggestions: draft.claims.map((claim) => ({ ...claim, verification: 'unverified-quote-presence-only' })), unverifiedDraftSections: draft.draftSections, usage: response.usage, reviewState: 'unverified-manual-review-required', nextAction: 'Human must re-open the primary source, verify quote context and claim entailment, create a separate reviewed ledger and article, validate them in backend/editorial.py, and obtain separate exact owner digest approval.' } }];
