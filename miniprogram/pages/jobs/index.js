const cloud = require('../../services/cloud');
const categories = [{id:'opportunity',label:'机会',icon:'book'},{id:'news',label:'资讯',icon:'lecture'},{id:'knowledge',label:'知识库',icon:'outing'},{id:'recap',label:'活动回顾',icon:'calendar'}];
Page({
  data:{ category:'opportunity', categories, status:'loading', items:[], error:'', loadingMore:false, hasMore:false, moreError:'' },
  onLoad(){ this._active=true; return this.loadResources(); },
  onShow(){ if(typeof this.getTabBar==='function'&&this.getTabBar()) this.getTabBar().setData({selected:1}); if(!this._loaded){this._loaded=true; return;} this._active=true; return this.loadResources(); },
  onHide(){this._active=false;this._request++;}, onUnload(){this._active=false;},
  async loadResources(){ const request=this._request=(this._request||0)+1; this.setData({status:'loading',items:[],error:'',hasMore:false,moreError:'',loadingMore:false}); try { const items=await cloud.call('listResources',{offset:0,category:this.data.category}); if(this._active&&request===this._request)this.setData({items,status:items.length?'ready':'empty',hasMore:items.length===20}); } catch(error){if(this._active&&request===this._request)this.setData({status:'error',error:error.message||'资源加载失败，请重试'});} },
  selectCategory(e){const category=e.currentTarget.dataset.id;if(!categories.some(item=>item.id===category)||category===this.data.category)return;this.setData({category});this.loadResources();},
  async loadMore(){if(this.data.loadingMore||!this.data.hasMore)return;const request=this._request;this.setData({loadingMore:true,moreError:''});try{const items=await cloud.call('listResources',{offset:this.data.items.length,category:this.data.category});if(this._active&&request===this._request)this.setData({items:this.data.items.concat(items),hasMore:items.length===20});}catch(error){if(this._active&&request===this._request)this.setData({moreError:error.message||'加载失败，请重试'});}finally{if(this._active&&request===this._request)this.setData({loadingMore:false});}},
  openResource(e){const id=e.currentTarget.dataset.id;if(!this.data.items.some(item=>item.id===id))return;wx.navigateTo({url:'/pages/resource-detail/index?id='+encodeURIComponent(id)});}
});
