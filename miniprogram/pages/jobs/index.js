const cloud = require('../../services/cloud');
const media = require('../../services/resource-media');
const categories = [{id:'all',label:'全部',icon:'book'},{id:'opportunity',label:'机会',icon:'book'},{id:'news',label:'资讯',icon:'lecture'},{id:'knowledge',label:'知识库',icon:'outing'},{id:'recap',label:'回顾',icon:'calendar'}];
Page({
  data:{ category:'all', categories, status:'loading', items:[], error:'', loadingMore:false, hasMore:false, moreError:'' },
  onLoad(){ this._active=true; return this.loadResources(); },
  onShow(){ if(typeof this.getTabBar==='function'&&this.getTabBar()) this.getTabBar().setData({selected:1}); if(!this._loaded){this._loaded=true; return;} this._active=true; return this.loadResources(); },
  onHide(){this._active=false;this._request++;}, onUnload(){this._active=false;},
  async decorate(items){const urls=await media.getTempFileUrls(items.map(item=>item.coverFileId));return items.map(item=>{const source=(item.sourceLabel||item.title||'未').trim();return Object.assign({},item,{coverUrl:urls[item.coverFileId]||'',sourceInitial:Array.from(source)[0]||'未'});});},
  async loadResources(){ const request=this._request=(this._request||0)+1; this.setData({status:'loading',items:[],error:'',hasMore:false,moreError:'',loadingMore:false}); try { const payload={offset:0};if(this.data.category!=='all')payload.category=this.data.category; const raw=await cloud.call('listResources',payload); const items=await this.decorate(raw); if(this._active&&request===this._request)this.setData({items,status:items.length?'ready':'empty',hasMore:items.length===20}); } catch(error){if(this._active&&request===this._request)this.setData({status:'error',error:error.message||'资源加载失败，请重试'});} },
  selectCategory(e){const category=e.currentTarget.dataset.id;if(!categories.some(item=>item.id===category)||category===this.data.category)return;this.setData({category});this.loadResources();},
  async loadMore(){if(this.data.loadingMore||!this.data.hasMore)return;const request=this._request;this.setData({loadingMore:true,moreError:''});try{const payload={offset:this.data.items.length};if(this.data.category!=='all')payload.category=this.data.category;const raw=await cloud.call('listResources',payload);const items=await this.decorate(raw);if(this._active&&request===this._request)this.setData({items:this.data.items.concat(items),hasMore:items.length===20});}catch(error){if(this._active&&request===this._request)this.setData({moreError:error.message||'加载失败，请重试'});}finally{if(this._active&&request===this._request)this.setData({loadingMore:false});}},
  openResource(e){const id=e.currentTarget.dataset.id;if(!this.data.items.some(item=>item.id===id))return;wx.navigateTo({url:'/pages/resource-detail/index?id='+encodeURIComponent(id)});}
});
