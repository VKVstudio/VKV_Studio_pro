import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The request builder is intentionally worker-only. Owner decisions are made
// through the separate authenticated API, never from a model/n8n payload.
const builder = `const input = $input.first().json;
if (input.mode !== 'fixture') throw new Error('Only offline fixture mode is prepared');
const stages = ['discover', 'extract', 'draft', 'skeptic', 'repair', 'images', 'social'];
if (!stages.includes(input.operation)) throw new Error('Worker operation denied');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id) || input.id.length > 100) throw new Error('Invalid story ID');
let path = '/v1/packs', body;
if (input.operation === 'discover') {
  if (!input.candidate || input.candidate.id !== input.id || typeof input.sourceText !== 'string') throw new Error('Missing imported fixture source');
  body = {candidate: input.candidate, sourceText: input.sourceText};
  if (input.newsRecord) body.newsRecord=input.newsRecord;
} else {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw new Error('Invalid revision');
  path += '/' + input.id + '/' + input.operation;
  body = {expectedRevision: input.expectedRevision};
}
// No source URL, role, model ID, key, or user-supplied host enters routing.
return [{json: {request: {method: 'POST', url: 'https://editorial.invalid' + path, body}}}];`;
const guard = `const result = $input.first().json;
const states = ['sourced','facts_pending','drafted','edited','skeptic_passed','repair_pending','quarantined','visual_pending','social_ready'];
if (!result || !states.includes(result.status) || !Number.isSafeInteger(result.revision)) throw new Error('Unexpected API response');
if (result.pack?.fixture !== true && result.status !== 'sourced') throw new Error('Offline fixture boundary violated');
return [{json: {id: result.id, revision: result.revision, status: result.status, fixture: result.pack?.fixture === true,
  next: result.status === 'facts_pending' ? 'Owner semantic fact review via private API' :
        result.status === 'drafted' ? 'Run separate source-grounded skeptic, then owner text edit/review in pilot' :
        result.status === 'repair_pending' ? 'At most one repair stage, then separate skeptic recheck' :
        result.status === 'quarantined' ? 'Human exception queue; no automatic repair loop or publication' :
        result.status === 'skeptic_passed' ? 'Pilot owner text review; future auto requires independent policy gates' :
        result.status === 'edited' ? 'Prepare image candidates, then owner image and rights review via private API' :
        result.status === 'visual_pending' ? 'Owner image and rights selection via private API' :
        result.status === 'social_ready' ? 'Owner exact-pack review via private API; fixture export remains denied' : 'Run extraction separately'}}];`;
const workflow = {
  name: 'VKV pro private editorial — offline worker stages', active: false,
  nodes: [
    {id: 'manual', name: 'Manual fixture only', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0,0], parameters: {}},
    {id: 'fixture', name: 'Fixture input — change operation manually', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220,0], parameters: {jsCode: `return [{json: ${JSON.stringify({mode:'fixture', operation:'discover', id:'story-one', expectedRevision:1,
      candidate:{id:'story-one',slug:'story-one',sourceUrl:'https://example.org/announcement',sourceDate:'2026-09-26',topic:'Local AI',reason:'Offline acceptance fixture',sourceLicence:'Synthetic fixture only',sourceExcerpt:'The vendor announced a tool.'},sourceText:'The vendor announced a tool.'})}}];`}},
    {id: 'request', name: 'Build worker-only request', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440,0], parameters: {jsCode:builder}},
    {id:'api',name:'Private API — configure worker credential separately',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[660,0],parameters:{method:'POST',url:'={{ $json.request.url }}',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.request.body) }}',options:{timeout:10000,redirect:{redirect:{followRedirects:false}},response:{response:{responseFormat:'json'}}}},retryOnFail:false,onError:'stopWorkflow'},
    {id:'review',name:'Stop at human boundary',type:'n8n-nodes-base.code',typeVersion:2,position:[880,0],parameters:{jsCode:guard}},
  ],
  connections:{
    'Manual fixture only':{main:[[{node:'Fixture input — change operation manually',type:'main',index:0}]]},
    'Fixture input — change operation manually':{main:[[{node:'Build worker-only request',type:'main',index:0}]]},
    'Build worker-only request':{main:[[{node:'Private API — configure worker credential separately',type:'main',index:0}]]},
    'Private API — configure worker credential separately':{main:[[{node:'Stop at human boundary',type:'main',index:0}]]},
  },
  settings:{executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},
  tags:[],pinData:{},
};
writeFileSync(fileURLToPath(new URL('./editorial-offline.json', import.meta.url)), JSON.stringify(workflow,null,2)+'\n');
const skepticWorkflow=structuredClone(workflow);
skepticWorkflow.name='VKV pro source-grounded skeptic — offline separate stage';
skepticWorkflow.nodes.find(node=>node.id==='fixture').parameters.jsCode=`return [{json: {mode:'fixture',operation:'skeptic',id:'story-one',expectedRevision:4}}];`;
writeFileSync(fileURLToPath(new URL('./skeptic-offline.json', import.meta.url)),JSON.stringify(skepticWorkflow,null,2)+'\n');
