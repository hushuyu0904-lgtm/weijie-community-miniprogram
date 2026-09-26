// Browser inspection of the actual native markup/styles. Supports only tags used here;
// it is not a WeChat runtime and makes no real identity or backend calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../miniprogram');fs.mkdirSync(__dirname,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const evaluate=(expr,data)=>vm.runInNewContext(expr,data,{timeout:100});
const interpolate=(text,data)=>text.replace(/{{([\s\S]*?)}}/g,(_,e)=>esc(evaluate(e,data)));
function parse(source){
 const tree={children:[]},stack=[tree];
 for(const token of source.match(/<\/?[\w-]+(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g)||[]){
  if(token.startsWith('</')){stack.pop();continue;}
  if(!token.startsWith('<')){stack.at(-1).children.push({text:token});continue;}
  const tag=token.match(/^<([\w-]+)/)[1],attrs={};for(const a of token.matchAll(/([\w:-]+)="([^"]*)"/g))attrs[a[1]]=a[2];
  if(/\swx:else(?:\s|>)/.test(token))attrs['wx:else']='';
  const node={tag,attrs,children:[]};stack.at(-1).children.push(node);if(!token.endsWith('/>'))stack.push(node);
 }
 return tree.children;
}
const raw=(v,d)=>evaluate(v.slice(2,-2),d);
function render(nodes,data){let output='',chain=false;
 for(const n of nodes){
  if(n.text!==undefined){output+=interpolate(n.text,data);continue;}
  const a=n.attrs;
  if('wx:if' in a){chain=!!raw(a['wx:if'],data);if(!chain)continue;}
  else if('wx:elif' in a){if(chain)continue;chain=!!raw(a['wx:elif'],data);if(!chain)continue;}
  else if('wx:else' in a){if(chain)continue;chain=true;}
  else chain=false;
  if(a['wx:for']){for(const [index,item] of raw(a['wx:for'],data).entries()){const copy={...n,attrs:{...a}};delete copy.attrs['wx:for'];output+=render([copy],{...data,index,item});}continue;}
  if(n.tag==='block'){output+=render(n.children,data);continue;}
  let tag={view:'div',text:'span',image:'img','scroll-view':'div'}[n.tag]||n.tag;
  const attrs=[];
  for(const [k,v] of Object.entries(a)){
   if(k.startsWith('wx:')||k.startsWith('bind')||k==='mode')continue;
   if(['disabled','loading'].includes(k)){if(v.startsWith('{{')&&raw(v,data))attrs.push(k);continue;}
   attrs.push(k+'="'+interpolate(v,data).replace(/^\/assets\//,'../../miniprogram/assets/')+'"');
  }
  if(n.tag==='image')attrs.push('onerror="this.style.visibility=\'hidden\'"');
  if(a.bindtap==='switchTab'){tag='a';attrs.push('href="'+['activities','jobs','community','mine'][data.index]+'.html"');}
  if(a.bindtap==='openActivity'){tag='a';attrs.push('href="'+(data.item.id==='demo-medical-ai'?'detail-ai':'detail-coffee')+'.html"');}
  if(a.bindtap==='goBack'){tag='a';attrs.push('href="activities.html"');}
  if(a.bindtap==='loadActivities')attrs.push('onclick="location.href=\'activities.html\'"');
  if(a.bindtap==='loadActivity')attrs.push('onclick="location.href=\'detail-ai.html\'"');
  output+='<'+tag+' '+attrs.join(' ')+'>'+render(n.children,data)+(tag==='img'||tag==='input'?'':'</'+tag+'>');
 }
 return output;
}
const categories=[{id:'coffee',label:'线下 Coffee Chat'},{id:'outing',label:'出去玩'},{id:'lecture',label:'线上讲座'},{id:'chat',label:'线上聊天室'}];
const items=require('../../miniprogram/data/demo-activities').map(a=>({...a,isDemo:true,dateLabel:'待定',category:a.id==='demo-medical-ai'?'lecture':'coffee',priceText:'免费'}));
const tabs=JSON.parse(read('app.json')).tabBar.list.map(t=>({...t,pagePath:'/'+t.pagePath,icon:t.iconPath.split('/').pop().replace('.png','')}));
const common={status:'ready',sourceLabel:'本地演示数据 · 未连接真实后端',category:'all',categories,items,heroFailed:false,llmFailed:false,failedCovers:{},hasMore:false,moreError:'',loadingMore:false,error:'',activity:items[0],coverFailed:false};
function pageData(name){let data;vm.runInNewContext(read('pages/'+name+'/index.js'),{Page:p=>data=p.data});return data;}
const jobsData=pageData('jobs'),communityData=pageData('community');
const pages=[['activities','activities',common,0],['jobs','jobs',jobsData,1],['community','community',communityData,2],['mine','mine',{status:'error',error:'尚未配置云环境，无法验证身份',identity:null},3],['detail-ai','activity-detail',common],['detail-coffee','activity-detail',{...common,activity:items[1]}],['activity-manage','activity-manage',{status:'error',error:'未完成身份与权限验证'}],['activity-edit','activity-edit',{status:'error',error:'未完成身份与权限验证'}]];
for(const category of ['news','knowledge','recap'])pages.push(['jobs-'+category,'jobs',{...jobsData,category},1]);
pages.push(['community-form','community',{...communityData,formOpen:true},2]);
for(const status of ['loading','empty','error'])pages.push(['activities-'+status,'activities',{...common,status,error:'活动加载失败，请重试'},0]);
pages.push(['activities-long','activities',{...common,items:items.map(i=>({...i,title:'医学背景的职业探索：从临床问题到医疗人工智能产品，与不同领域的朋友一起交流'}))},0]);
pages.push(['activities-broken','activities',{...common,heroFailed:true,llmFailed:true,failedCovers:Object.fromEntries(items.map(i=>[i.id,true]))},0]);
pages.push(['jobs-broken','jobs',{...jobsData,category:'knowledge',coverFailed:true},1],['detail-ai-broken','activity-detail',{...common,coverFailed:true}]);
pages.push(['detail-missing','activity-detail',{...common,status:'missing'}]);
for(const [name,page,data,selected] of pages){
 const localStyle='pages/'+page+'/index.wxss';let css=read('app.wxss')+'\n'+(fs.existsSync(path.join(root,localStyle))?read(localStyle):'');if(selected!==undefined)css+='\n'+read('custom-tab-bar/index.wxss');
 css=css.replace(/(^|[}\n])page\s*\{/g,'$1body{').replace(/\bimage\b/g,'img').replace(/\btext(?=\s*\{)/g,'span').replace(/([\d.]+)rpx/g,(_,n)=>`calc(${n} * 100vw / 750)`);css+='\n.category-scroll,.resource-scroll{overflow-x:auto}';
 let body=render(parse(read('pages/'+page+'/index.wxml')),data);if(selected!==undefined)body+=render(parse(read('custom-tab-bar/index.wxml')),{selected,tabs});body=body.replace(/[ \t]+$/gm,'');
 fs.writeFileSync(path.join(__dirname,name+'.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>未界 / ${name} / 浏览器对照</title><style>*{box-sizing:border-box}body{margin:0}button{border:0}img{object-fit:cover}a{color:inherit;text-decoration:none}a[data-id]{display:block;padding:16px 0;min-height:44px;font-size:12px}.tab-item{border:0}input,textarea{font:inherit}${css}</style>${body}</html>`);
}
fs.writeFileSync(path.join(__dirname,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>未界 · 多页面重新设计</title><style>body{margin:0;padding:24px;background:#eaf0eb;color:#233b2c;font:15px/1.6 system-ui}h1{font-size:24px}button,select{font:inherit;padding:10px;margin:5px}main{display:flex;gap:20px;overflow:auto;padding:15px 0}section{flex:none;width:390px}iframe{width:100%;height:844px;border:1px solid #bccfc0;border-radius:12px;background:white}small{display:block}a{color:#146442}</style><h1>未界 · 全页面视觉对照</h1><p>由修改后的原生 WXML / WXSS 生成；这是浏览器对照，不是微信真机截图。演示数据与未开放状态保留。</p><button onclick="resize(390)">390px</button><button onclick="resize(320)">320px</button><label>活动状态 <select onchange="document.getElementById('activities').src=this.value+'.html'"><option value="activities">正常</option><option value="activities-loading">加载</option><option value="activities-empty">空数据</option><option value="activities-error">失败</option><option value="activities-long">长标题</option><option value="activities-broken">图片失败</option></select></label><main>${[['activities','活动'],['jobs','资源'],['community','连接'],['mine','我的'],['detail-ai','医疗 AI 详情'],['detail-coffee','Coffee Chat 详情']].map(([p,label])=>`<section><b>${label}</b><small><a href="${p}.html" target="_blank">单独打开</a></small><iframe id="${p}" title="${label}" src="${p}.html"></iframe></section>`).join('')}</main><script>function resize(w){document.querySelectorAll('section').forEach(e=>e.style.width=w+'px')}</script></html>`);
// Source SVGs with color only; licensed geometry is preserved, rendered at 84px for 28px navigation.
const map={coffee:['tea','#936031'],outing:['location','#26764b'],lecture:['desktop','#336c9d'],chat:['chat-bubble','#78589a'],calendar:['calendar','#367952'],pin:['location','#8b6741'],person:['user','#426d88'],book:['book-open','#8c682e']};
const icons=[];for(const [name,[source,color]] of Object.entries(map)){const svg=fs.readFileSync(path.join(__dirname,'../refine/icons/'+source+'.svg'),'utf8');for(const active of [false,true])icons.push({name:name+(active?'-selected':''),svg:svg.replace(/width="24" height="24"/,'width="84" height="84"').replace(/"black"/g,'"'+(active?'#087649':color)+'"')});}
fs.writeFileSync(path.join(__dirname,'icons.html'),`<!doctype html><html><style>*{box-sizing:border-box}body{margin:0;display:flex;flex-wrap:wrap;width:672px;background:transparent}div{width:84px;height:84px}svg{display:block}</style>${icons.map(i=>'<div>'+i.svg+'</div>').join('')}</html>`);
fs.writeFileSync(path.join(__dirname,'icon-names.json'),JSON.stringify(icons.map(i=>i.name)));
console.log('Built '+pages.length+' native-source browser pages and licensed icon sheet.');
