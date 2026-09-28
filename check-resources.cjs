const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function load(name,api={call:async()=>[]}){let def;const calls=[];vm.runInNewContext(fs.readFileSync('miniprogram/pages/'+name+'/index.js','utf8'),{Page:p=>def=p,require:()=>api,wx:{setClipboardData:o=>calls.push(o),showToast:o=>calls.push(o),navigateTo:o=>calls.push(o),switchTab:o=>calls.push(o),showModal:o=>calls.push(o)}});return {p:{...def,data:JSON.parse(JSON.stringify(def.data)),setData(v){Object.assign(this.data,v)}},calls};}
const event=(id,value)=>({currentTarget:{dataset:{id}},detail:{value}});
(async()=>{
  const queries=[];const {p:jobs}=load('jobs',{call:async(action,payload)=>{queries.push({action,payload});return[];}});
  jobs._active=true; await jobs.loadResources(); assert.equal(jobs.data.status,'empty');
  for(const id of ['news','knowledge','recap'])jobs.selectCategory(event(id));assert.equal(jobs.data.category,'recap');assert(queries.some(x=>x.action==='listResources'&&x.payload.category==='recap'));
  const identity={hasProfile:true,role:'member'};const requests=[];const {p:community}=load('community',{call:async(action,payload)=>{requests.push({action,payload});return action==='identity'?identity:{id:'c-test'};}});
  community._active=true;await community.load();community.toggleForm();assert(community.data.formOpen);
  community.selectIntent(event('share'));community.toggleDirection(event('medical-ai'));community.input({currentTarget:{dataset:{field:'introduction'}},detail:{value:'测试背景'}});community.input({currentTarget:{dataset:{field:'question'}},detail:{value:'测试问题'}});await community.submit();
  assert.equal(requests.at(-1).action,'createConnectionRequest');assert.equal(requests.at(-1).payload.request.intent,'share');assert(!('phone' in requests.at(-1).payload.request));
  const detail=load('resource-detail',{call:async()=>({title:'资源',summary:'简介',content:'正文',sourceUrl:'https://example.com',sourceLabel:'来源'})});detail.p._active=true;await detail.p.load.call(Object.assign(detail.p,{_id:'s-test-resource-001'}));
  assert(!/wx\.(request|uploadFile|setStorage|cloud)/.test(fs.readFileSync('miniprogram/pages/community/index.js','utf8')));
  console.log('PASS resource categories and connection submission call approved cloud actions only. Page substitutes only.');
})().catch(error=>{console.error(error);process.exitCode=1});
