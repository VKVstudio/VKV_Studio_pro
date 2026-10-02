'use strict';
let current,prepared;
const byId=id=>document.getElementById(id);
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
async function hash(value){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return [...new Uint8Array(data)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function text(id,value){byId(id).textContent=value;}
function render(value){
 if(!value.pack||value.pack.fixture!==true||!Number.isSafeInteger(value.revision))throw Error('Not an offline fixture');
 current=value;prepared=null;byId('apply').hidden=true;
 text('title',value.pack.article?.title||value.pack.candidate.reason);text('source',value.pack.sourceText);
 const record=value.pack.newsRecord||{},dates=[['Source publication',record.publishedAt||'Unknown — never inferred from update date'],['Source update',record.updatedAt||'Unknown'],['Discovered / imported',record.discoveredAt||value.pack.importedAt||'Unknown'],['Event identity',record.eventId||'Legacy fixture — event identity not established']];
 const list=byId('dates');list.replaceChildren();for(const [label,entry] of dates){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=entry;list.append(dt,dd);}
 const container=byId('claims');container.replaceChildren();for(const claim of value.pack.ledger?.claims||[]){const box=document.createElement('article');box.className='claim';for(const [label,entry] of [['Claim',claim.claim],['Evidence',claim.support],['Limit',claim.limit],['Type',claim.kind]]){const p=document.createElement('p');p.textContent=label+': '+entry;box.append(p);}container.append(box);}
 byId('draft').value=JSON.stringify(value.pack.article||{},null,2);text('skeptic',JSON.stringify(value.pack.skeptic||{status:'Not checked'},null,2));
 text('packages','Synthetic candidates only. Their provenance is shown below; no real media or rights approval is claimed.');text('visuals',JSON.stringify(value.pack.images||[],null,2));text('social',JSON.stringify(value.pack.social||{status:'No social draft'},null,2));
 const selection=byId('image');selection.replaceChildren();for(const image of value.pack.images||[]){const option=document.createElement('option');option.value=image.id;option.textContent=image.id+' — '+image.alt;selection.append(option);}byId('rights').checked=false;
 byId('story').hidden=false;text('status',`Fixture ${value.id}, revision ${value.revision}. State: ${value.status}. No public action.`);
}
byId('load').addEventListener('click',async()=>{try{const response=await fetch('./fixture-pack.json',{credentials:'omit',cache:'no-store'});if(!response.ok)throw Error('Fixture unavailable');const raw=await response.text();if(raw.length>1048576)throw Error('Fixture too large');render(JSON.parse(raw));}catch(error){text('status',error.message);}});
async function prepare(action){try{
 if(!current)throw Error('Load a fixture first');let body={expectedRevision:current.revision};const notes=byId('notes').value.trim();
 if(action==='edit')body.article=JSON.parse(byId('draft').value);
 else if(['facts-review','reject','visual-review','approve','export'].includes(action)){
  body.snapshotSha256=await hash(current.pack);
  if(['facts-review','reject','visual-review'].includes(action)){if(!notes)throw Error('Add review notes first');body.notes=notes;}
  if(action==='facts-review')body.accepted=true;
  if(action==='visual-review'){if(!byId('image').value||!byId('rights').checked)throw Error('Select a candidate and explicitly review its rights');body.imageId=byId('image').value;body.rightsAccepted=true;}
 }
 prepared={method:'POST',path:`/v1/packs/${current.id}/${action}`,body};text('request',JSON.stringify(prepared,null,2));text('status','Request prepared. No request sent; server state unchanged.');
 // This transport exists only in the controlled synthetic-origin browser test.
 byId('apply').hidden=!(location.hostname.endsWith('.invalid')&&location.search==='?fixtureTransport=1');
}catch(error){prepared=null;byId('apply').hidden=true;text('status',error.message);}}
for(const [id,action] of [['facts','facts-review'],['edit','edit'],['reject','reject'],['visual','visual-review'],['approve','approve'],['export','export']])byId(id).addEventListener('click',()=>prepare(action));
for(const button of document.querySelectorAll('[data-worker]'))button.addEventListener('click',()=>prepare(button.dataset.worker));
byId('apply').addEventListener('click',async()=>{try{
 if(!prepared||!current?.pack.fixture||!location.hostname.endsWith('.invalid')||location.search!=='?fixtureTransport=1')throw Error('Offline fixture transport unavailable');
 const response=await fetch(prepared.path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',redirect:'error',body:JSON.stringify(prepared.body)});
 if(response.headers.get('X-Offline-Fixture')!=='true')throw Error('Not the controlled fixture bridge');
 const raw=await response.text();if(raw.length>1048576)throw Error('Fixture response too large');const value=JSON.parse(raw);
 if(!response.ok)throw Error('Offline API rejected request: '+(value.error||response.status));render(value);
}catch(error){text('status',error.message);}});
