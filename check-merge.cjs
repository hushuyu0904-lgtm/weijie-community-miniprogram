const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');let mine,detail;const updates=[];
vm.runInNewContext(read('miniprogram/pages/mine/index.js'),{Page:p=>mine=p,require:()=>({call:async()=>({role:'member',hasProfile:true,canBrowse:true,profile:{stage:'student',directions:['medical-ai']}})})});
const page={...mine,data:{...mine.data},setData(v){Object.assign(this.data,v)},getTabBar:()=>({setData:v=>updates.push(v)})};
(async()=>{await page.onShow();assert.equal(updates[0].selected,3);assert.equal(page.data.stageLabel,'医学生 / 在读');assert.equal(page.data.directionLabels,'医疗 AI');assert.equal(typeof page.openOnboarding,'function');assert.equal(typeof page.openRegistrations,'function');
vm.runInNewContext(read('miniprogram/pages/activity-detail/index.js'),{Page:p=>detail=p,require:()=>({sourceLabel:'test'})});assert.equal(detail.data.registering,false);assert.equal(detail.data.coverFailed,false);assert.equal(typeof detail.register,'function');assert.equal(typeof detail.onCoverError,'function');
const mineMarkup=read('miniprogram/pages/mine/index.wxml');for(const method of ['openOnboarding','openRegistrations','openManage'])assert(mineMarkup.includes(method));assert(mineMarkup.includes('MY SPACE'));
console.log('PASS merged profile data and custom tab selection; registration action and cover fallback retained.');})().catch(e=>{console.error(e);process.exitCode=1});
