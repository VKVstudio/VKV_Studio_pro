import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const workflow = JSON.parse(fs.readFileSync(path.join(dir, 'editorial-draft.workflow.json'), 'utf8'));
const node = (name) => workflow.nodes.find((item) => item.name === name);
const candidateCode = node('Validate candidate and build request').parameters.jsCode;
const draftCode = node('Validate draft and prepare review artifact').parameters.jsCode;
assert.equal(candidateCode, fs.readFileSync(path.join(dir, 'validate-candidate.js'), 'utf8'));
assert.equal(draftCode, fs.readFileSync(path.join(dir, 'validate-draft.js'), 'utf8'));
const sample = { id: 'sample-story', slug: 'sample-story', sourceUrl: 'https://openai.com/index/sample-story', sourceDate: '2026-09-27', topic: 'Sample announcement', reason: 'Business relevance', sourceLicence: 'Quote only', sourceExcerpt: 'The sample service was announced. Performance is untested.' };
const digest = (candidate) => createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(candidate).sort(([a], [b]) => a.localeCompare(b))))).digest('hex');
const approved = (candidate) => ({ candidate, attestation: { publicPrimarySource: true, cloudUseApproved: true, candidateSha256: digest(candidate) } });

function run(code, input, candidate = sample) {
  const context = {
    $input: { first: () => ({ json: input }) },
    $: (name) => { assert.equal(name, 'Validate candidate and build request'); return { first: () => ({ json: { candidate } }) }; },
    URL, Date, Number, Object, Array, Set, JSON, Error,
  };
  return vm.runInNewContext(`(() => { ${code} })()`, context, { timeout: 1000 });
}

assert.equal(workflow.active, false);
assert.equal(node('Manual trigger').type, 'n8n-nodes-base.manualTrigger');
assert.equal(node('OpenRouter draft request').parameters.url, 'https://openrouter.ai/api/v1/chat/completions');
assert.equal(node('OpenRouter draft request').parameters.authentication, 'genericCredentialType');
assert.equal(workflow.nodes.filter((item) => item.type === 'n8n-nodes-base.httpRequest').length, 1);
assert.ok(!workflow.nodes.some((item) => /webhook|executeCommand|publish/i.test(item.type)));
assert.equal(run(candidateCode, approved(sample))[0].json.request.max_tokens, 900);
assert.equal(run(candidateCode, approved(sample))[0].json.request.model, 'deepseek/deepseek-v4-flash-0731');
assert.equal(run(candidateCode, approved({ ...sample, sourceExcerpt: 'Объявлен новый сервис.' }))[0].json.candidate.sourceExcerpt, 'Объявлен новый сервис.');
assert.throws(() => run(candidateCode, { candidate: sample, attestation: { publicPrimarySource: false, cloudUseApproved: false, candidateSha256: '' } }));
assert.throws(() => run(candidateCode, { candidate: sample, attestation: { publicPrimarySource: true, cloudUseApproved: true, candidateSha256: '0'.repeat(64) } }));
assert.throws(() => run(candidateCode, { ...approved(sample), candidate: { ...sample, sourceExcerpt: 'Changed after consent.' } }));
for (const patch of [
  { callbackUrl: 'https://evil.example' }, { command: 'publish' }, { model: 'expensive/model' },
  { sourceUrl: 'http://openai.com/index/story' }, { sourceUrl: 'https://localhost/' },
  { sourceUrl: 'https://openai.com.evil.example/index/story' }, { sourceUrl: 'https://example.com/research' },
  { sourceExcerpt: '<script>alert(1)</script>' },
]) assert.throws(() => run(candidateCode, approved({ ...sample, ...patch })));
assert.throws(() => run(candidateCode, approved({ ...sample, sourceExcerpt: '🙂'.repeat(450) })));

const draft = { claims: [{ id: 'claim-one', kind: 'source', claim: 'A service was announced.', sourceUrl: sample.sourceUrl, support: 'The sample service was announced.', limit: 'Performance is untested.' }], draftSections: [{ heading: 'What happened', paragraphs: ['A sample service was announced.'] }, { heading: 'Decision', paragraphs: ['Wait for testing.'] }] };
const response = (content = draft, finish_reason = 'stop') => ({ choices: [{ finish_reason, message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 120, completion_tokens: 100 } });
const artifact = run(draftCode, response());
assert.equal(artifact[0].json.reviewState, 'unverified-manual-review-required');
assert.equal(artifact[0].json.storyId, sample.id);
assert.ok(!('approval' in artifact[0].json));
assert.ok(!('proposedLedger' in artifact[0].json));
assert.equal(artifact[0].json.unverifiedClaimSuggestions[0].verification, 'unverified-quote-presence-only');
const hallucinated = response({ ...draft, claims: [{ ...draft.claims[0], claim: 'The sample service generated a billion dollars.' }] });
assert.equal(run(draftCode, hallucinated)[0].json.unverifiedClaimSuggestions[0].verification, 'unverified-quote-presence-only');
for (const bad of [
  response({ ...draft, claims: [{ ...draft.claims[0], support: 'Invented passage' }] }),
  response({ ...draft, claims: [{ ...draft.claims[0], sourceUrl: 'https://evil.example/' }] }),
  response({ ...draft, claims: [{ ...draft.claims[0], id: 123 }] }),
  response({ ...draft, draftSections: [{ ...draft.draftSections[0], paragraphs: ['<script>bad</script>'] }, draft.draftSections[1]] }),
  response({ ...draft, publish: true }), response(draft, 'length'),
  { ...response(), usage: { prompt_tokens: 3001, completion_tokens: 100 } },
]) assert.throws(() => run(draftCode, bad));
console.log('n8n editorial workflow contract: PASS');
