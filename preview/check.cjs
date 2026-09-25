const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const elements = Object.fromEntries(['screen','tabs','scenario','title'].map(id => [id,{style:{},value:'normal',addEventListener(type,fn){this[type]=fn;}}]));
const events = {};
let hash='';
const location={get hash(){return hash;},set hash(value){hash=value.startsWith('#')?value:'#'+value;}};
const context = vm.createContext({location,document:{getElementById:id=>elements[id],addEventListener:(name,fn)=>events[name]=fn},window:{addEventListener:(name,fn)=>events[name]=fn}});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
assert.match(elements.screen.innerHTML,/医学背景，如何走近/);
function route(hash){context.location.hash=hash;events.hashchange();}
route('#detail/demo-medical-ai'); assert.match(elements.screen.innerHTML,/报名功能尚未开放/); assert.equal(elements.tabs.hidden,true);
route('#detail/demo-career-sharing'); assert.match(elements.screen.innerHTML,/医学职业探索交流会/);
route('#detail/unknown'); assert.match(elements.screen.innerHTML,/活动不存在/);
route('#'+encodeURIComponent('机会')); assert.match(elements.screen.innerHTML,/机会与资源/);
route('#'+encodeURIComponent('连接')); assert.match(elements.screen.innerHTML,/连接申请/);
route('#'+encodeURIComponent('我的')); assert.match(elements.screen.innerHTML,/不提供模拟管理员/);
for(const [scenario,text] of [['loading','加载中'],['empty','暂无活动'],['error','演示加载失败'],['forbidden','无浏览权限'],['detail-error','演示加载失败'],['missing','活动不存在']]){
 elements.scenario.value=scenario; elements.scenario.change(); assert(elements.screen.innerHTML.includes(text));
}
elements.scenario.value='error';elements.scenario.change();
events.click({target:{closest:()=>({dataset:{action:'retry'}})}});
assert.equal(elements.scenario.value,'normal');assert.match(elements.screen.innerHTML,/查看详情/);
console.log('PASS preview routes, states and simulated retry (DOM substitutes; not browser rendering).');
