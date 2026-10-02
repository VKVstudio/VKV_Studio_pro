const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),readline=require('node:readline');
const {chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='https://vkv-private-ui.invalid',root=__dirname;
(async()=>{
const bridge=spawn('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['-B',path.join(root,'fixture_bridge.py'),'--offline-fixture-only'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
const pending=[];let bridgeErrors='';bridge.stderr.on('data',data=>bridgeErrors+=data.toString());
readline.createInterface({input:bridge.stdout}).on('line',line=>{const next=pending.shift();if(next)next.resolve(JSON.parse(line));});
bridge.on('exit',code=>{for(const next of pending.splice(0))next.reject(Error('Fixture bridge exit '+code+' '+bridgeErrors));});
const invoke=data=>new Promise((resolve,reject)=>{pending.push({resolve,reject});bridge.stdin.write(JSON.stringify(data)+'\n');});
let browser;
try{
browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu']});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const unexpected=[],errors=[],transitions=[];
await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin){unexpected.push(url.href);return route.abort();}
if(url.pathname==='/fixture-pack.json'||url.pathname.startsWith('/v1/')){const response=await invoke({method:request.method(),path:url.pathname,...(url.pathname==='/fixture-pack.json'?{}:{body:request.postDataJSON()})});transitions.push({path:url.pathname,status:response.status,state:response.body.status,revision:response.body.revision});return route.fulfill({status:response.status,body:JSON.stringify(response.body),headers:{'content-type':'application/json','X-Offline-Fixture':'true','cache-control':'no-store'}});}
if(!['/index.html','/review.js','/review.css'].includes(url.pathname)){unexpected.push(url.href);return route.abort();}
return route.fulfill({body:fs.readFileSync(path.join(root,url.pathname)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(url.pathname)]});});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/index.html?fixtureTransport=1');await page.getByRole('button',{name:'Load offline fixture'}).click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('facts_pending'));
await page.getByLabel('Review notes and unresolved questions').fill('Synthetic fixture review only; no public approval.');
async function step(label,state){await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:'Apply request to offline test fixture',exact:true}).click();await page.waitForFunction(expected=>document.getElementById('status').textContent.includes('State: '+expected+'.'),state);}
await step('Prepare facts-review request','evidence_checked');await step('Prepare draft stage','drafted');await step('Prepare skeptic stage','skeptic_passed');await step('Prepare revised-draft request','edited');await step('Prepare image stage','visual_pending');await page.getByLabel('Selected image candidate').selectOption('image-two');await page.locator('#rights').check();await step('Prepare visual-review request','visual_approved');await step('Prepare social draft stage','social_ready');await step('Prepare pack approval','approved');
await page.getByRole('button',{name:'Prepare export check',exact:true}).click();await page.getByRole('button',{name:'Apply request to offline test fixture'}).click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('rejected request'));
if(transitions.at(-1).status!==409||unexpected.length||errors.length||await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(JSON.stringify({transitions,unexpected,errors}));
console.log(JSON.stringify({browser:browser.version(),environment:'Windows, headless, GPU disabled, synthetic origin, no listener/network',transitions,unexpected,errors,publicExport:'denied'}));
await context.close();
}finally{if(browser)await browser.close();bridge.stdin.end();}
})().catch(error=>{console.error(error);process.exitCode=1});
