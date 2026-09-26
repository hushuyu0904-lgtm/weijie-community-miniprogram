Component({
 data: { selected:0, tabs:[{text:'活动',pagePath:'/pages/activities/index',icon:'calendar'},{text:'资源',pagePath:'/pages/jobs/index',icon:'book'},{text:'连接',pagePath:'/pages/community/index',icon:'chat'},{text:'我的',pagePath:'/pages/mine/index',icon:'person'}] },
 lifetimes:{ attached(){this.syncRoute();} },
 pageLifetimes:{ show(){this.syncRoute();} },
 methods:{
  syncRoute(){const pages=getCurrentPages();const current=pages[pages.length-1];if(!current)return;const index=this.data.tabs.findIndex(t=>t.pagePath==='/'+current.route);if(index>=0)this.setData({selected:index});},
  switchTab(event){const index=Number(event.currentTarget.dataset.index);if(!Number.isInteger(index)||index<0||index>=this.data.tabs.length||index===this.data.selected)return;wx.switchTab({url:this.data.tabs[index].pagePath,success:()=>this.setData({selected:index}),fail:()=>wx.showToast({title:'页面打开失败，请重试',icon:'none'})});}
 }
});
