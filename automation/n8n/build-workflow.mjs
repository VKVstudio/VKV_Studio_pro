import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const code = (file) => fs.readFileSync(path.join(dir, file), 'utf8');
const workflow = {
  name: 'VKV editorial draft - manual review only',
  active: false,
  settings: { executionOrder: 'v1', saveExecutionProgress: false },
  nodes: [
    {
      id: 'manual-trigger', name: 'Manual trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1,
      position: [240, 300], parameters: {},
    },
    {
      id: 'candidate-input', name: 'Input candidate (replace fixture locally)', type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [470, 300], parameters: { mode: 'runOnceForAllItems', jsCode: `return [{ json: {\n  candidate: {\n    id: 'sample-story',\n    slug: 'sample-story',\n    sourceUrl: 'https://openai.com/index/sample-story',\n    sourceDate: '2026-09-27',\n    topic: 'Sample announcement',\n    reason: 'Assess whether the announced change requires business action.',\n    sourceLicence: 'Quote-only review; verify rights before use.',\n    sourceExcerpt: 'The sample service was announced on September 27. Availability and performance have not been independently tested.'\n  },\n  attestation: { publicPrimarySource: false, cloudUseApproved: false, candidateSha256: '' }\n} }];` },
    },
    {
      id: 'candidate-validator', name: 'Validate candidate and build request', type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [700, 300], parameters: { mode: 'runOnceForAllItems', jsCode: code('validate-candidate.js') },
    },
    {
      id: 'model-request', name: 'OpenRouter draft request', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
      position: [930, 300], parameters: {
        method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.request) }}',
        options: { timeout: 20000, redirect: { redirect: { followRedirects: false } }, response: { response: { responseFormat: 'json' } } },
      },
    },
    {
      id: 'draft-validator', name: 'Validate draft and prepare review artifact', type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [1160, 300], parameters: { mode: 'runOnceForAllItems', jsCode: code('validate-draft.js') },
    },
  ],
  connections: {
    'Manual trigger': { main: [[{ node: 'Input candidate (replace fixture locally)', type: 'main', index: 0 }]] },
    'Input candidate (replace fixture locally)': { main: [[{ node: 'Validate candidate and build request', type: 'main', index: 0 }]] },
    'Validate candidate and build request': { main: [[{ node: 'OpenRouter draft request', type: 'main', index: 0 }]] },
    'OpenRouter draft request': { main: [[{ node: 'Validate draft and prepare review artifact', type: 'main', index: 0 }]] },
  },
  pinData: {},
};

fs.writeFileSync(path.join(dir, 'editorial-draft.workflow.json'), JSON.stringify(workflow, null, 2) + '\n');
