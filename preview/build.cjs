// 仅生成浏览器验收快照；复用演示数据和页面样式，不连接云端。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const styles = ['app.wxss', 'pages/activities/index.wxss', 'pages/activity-detail/index.wxss']
  .map(p => read('miniprogram/' + p)).join('\n').replace(/\bpage\s*\{/g, '.phone {')
  .replace(/([\d.]+)rpx/g, (_, n) => Number(n) / 2 + 'px');
const data = JSON.stringify(require('../miniprogram/data/demo-activities')).replace(/</g, '\\u003c');
const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), template.replace('/* PAGE_STYLES */', styles).replace('/* DEMO_DATA */[]', data));
console.log('Generated preview/index.html from current styles and demo data.');
