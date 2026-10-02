// Test helper: evaluates ONLY checked-in Code node snippets in a restricted
// context; no network, environment, provider or n8n service is accessed.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const workflow = JSON.parse(readFileSync(new URL('./editorial-offline.json', import.meta.url),'utf8'));
const input = JSON.parse(readFileSync(0,'utf8'));
const node = workflow.nodes.find(node => node.id === input.node);
if (!node || node.type !== 'n8n-nodes-base.code') throw new Error('Unknown Code node');
const result = runInNewContext('(function(){' + node.parameters.jsCode + '})()', {
  $input:{first:()=>({json:input.data})},
}, {timeout:1000});
process.stdout.write(JSON.stringify(result));
