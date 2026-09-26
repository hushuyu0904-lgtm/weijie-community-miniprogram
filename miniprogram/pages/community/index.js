const fields=[{id:'nickname',label:'个人称呼',max:30,placeholder:'如何称呼你'},{id:'phone',label:'手机号',max:20,placeholder:'填写测试号码即可'},{id:'school',label:'学校',max:80,placeholder:'学校名称'},{id:'field',label:'专业／行业',max:80,placeholder:'例如：临床医学'},{id:'experience',label:'个人背景与经历',max:1500,multiline:true,placeholder:'学习、工作或项目经历；目前处于什么阶段'},{id:'interest',label:'感兴趣的方向',max:150,placeholder:'例如：医疗 AI、医学转金融'},{id:'question',label:'这次希望解决的问题',max:1000,multiline:true,placeholder:'希望了解什么，或正在面临怎样的选择'}];
Page({data:{coverFailed:false,formOpen:false,fields,values:{},result:''},
 onShow(){if(typeof this.getTabBar==='function'&&this.getTabBar())this.getTabBar().setData({selected:2});},
 onCoverError(){this.setData({coverFailed:true});},
 toggleForm(){this.setData({formOpen:!this.data.formOpen});},
 updateField(e){const field=fields.find(f=>f.id===e.currentTarget.dataset.id);if(!field||typeof e.detail.value!=='string')return;this.setData({values:{...this.data.values,[field.id]:e.detail.value.slice(0,field.max)},result:''});},
 checkForm(){const v=this.data.values;const missing=fields.find(f=>typeof v[f.id]!=='string'||!v[f.id].trim());if(missing){this.setData({result:'请填写'+missing.label+'。'});return;}if(!/^[0-9+() -]{6,20}$/.test(v.phone.trim())){this.setData({result:'请检查手机号格式。'});return;}this.setData({result:'填写检查通过。本页没有提交、保存或匹配任何资料。'});},
 onUnload(){this.data.values={};}
});
