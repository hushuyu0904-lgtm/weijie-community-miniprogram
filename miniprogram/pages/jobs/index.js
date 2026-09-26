const sources={pfizer:'https://www.pfizer.com.cn/zh-hans/careers-cn',insilico:'https://www.prnewswire.com/news-releases/insilico-medicine-secures-110-million-series-e-financing-to-advance-ai-driven-drug-discovery-innovation-302401040.html'};
Page({
 data:{category:'opportunity',coverFailed:false,categories:[{id:'opportunity',label:'机会',icon:'book'},{id:'news',label:'资讯',icon:'lecture'},{id:'knowledge',label:'知识库',icon:'outing'},{id:'recap',label:'活动回顾',icon:'calendar'}]},
 selectCategory(e){const id=e.currentTarget.dataset.id;if(this.data.categories.some(c=>c.id===id))this.setData({category:id});},
 onCoverError(){this.setData({coverFailed:true});},
 previewKnowledge(){wx.previewImage({urls:['/assets/editorial/knowledge.png'],fail:()=>wx.showToast({title:'图片打开失败，请重试',icon:'none'})});},
 copySource(e){const url=sources[e.currentTarget.dataset.id];if(typeof url!=='string'||!Object.prototype.hasOwnProperty.call(sources,e.currentTarget.dataset.id))return;wx.setClipboardData({data:url,success:()=>wx.showToast({title:'已复制，请在浏览器打开',icon:'none'}),fail:()=>wx.showToast({title:'复制失败，请重试',icon:'none'})});},
 onShow(){if(typeof this.getTabBar==='function'&&this.getTabBar())this.getTabBar().setData({selected:1});}
});
