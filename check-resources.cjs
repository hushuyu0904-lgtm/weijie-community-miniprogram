const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function load(name){let def;const calls=[];vm.runInNewContext(fs.readFileSync('miniprogram/pages/'+name+'/index.js','utf8'),{Page:p=>def=p,wx:{previewImage:o=>calls.push(o),setClipboardData:o=>calls.push(o),showToast:o=>calls.push(o)}});return {p:{...def,data:JSON.parse(JSON.stringify(def.data)),setData(v){Object.assign(this.data,v)}},calls};}
const event=(id,value)=>({currentTarget:{dataset:{id}},detail:{value}});
const {p:jobs,calls}=load('jobs');
for(const id of ['opportunity','news','knowledge','recap']){jobs.selectCategory(event(id));assert.equal(jobs.data.category,id);}
jobs.selectCategory(event('invalid'));assert.equal(jobs.data.category,'recap');
for(const id of ['invalid','__proto__','constructor'])jobs.copySource(event(id));assert.equal(calls.length,0);
jobs.copySource(event('pfizer'));assert.match(calls[0].data,/^https:\/\/www\.pfizer\.com\.cn\//);calls[0].fail();assert.match(calls[1].title,/复制失败/);
jobs.previewKnowledge();assert(fs.existsSync('miniprogram'+calls[2].urls[0]));jobs.onCoverError();assert(jobs.data.coverFailed);
const {p}=load('community');p.toggleForm();assert(p.data.formOpen);p.checkForm();assert.match(p.data.result,/请填写/);
for(const f of p.data.fields)p.updateField(event(f.id,f.id==='phone'?'bad':'演示输入'));
p.checkForm();assert.match(p.data.result,/手机号格式/);p.updateField(event('phone','00000000000'));p.checkForm();assert.match(p.data.result,/没有提交/);
p.updateField(event('nickname',' '.repeat(8)));p.checkForm();assert.match(p.data.result,/个人称呼/);
p.updateField(event('nickname','测'.repeat(60)));assert.equal(p.data.values.nickname.length,30);
p.updateField(event('admin','yes'));assert.equal(p.data.values.admin,undefined);
p.toggleForm();p.toggleForm();assert.equal(p.data.values.nickname.length,30);p.onUnload();assert.equal(Object.keys(p.data.values).length,0);
assert(!/wx\.(request|uploadFile|setStorage|cloud)/.test(fs.readFileSync('miniprogram/pages/community/index.js','utf8')));
console.log('PASS resource categories, allowlisted links and failure; local form validation, no submission, unload clearing. Page substitutes only.');
