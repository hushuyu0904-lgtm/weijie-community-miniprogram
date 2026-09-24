const demoActivities = require('../data/demo-activities');

// 手动验收时修改并重新编译；不是用户设置，也不是后端状态。
// list: normal / empty / error；detail: normal / error。
const DEMO_SCENARIO = { list: 'normal', detail: 'normal' };
const sourceLabel = '本地演示数据 · 未连接真实后端';

function forDisplay(activity) {
  return Object.assign({}, activity, {
    priceText: '¥' + (activity.priceFen / 100).toFixed(2) + '（示例）'
  });
}

// 页面只调用这两个异步方法；后续在此接入云函数，不在页面散落数据请求。
async function listActivities() {
  if (DEMO_SCENARIO.list === 'error') throw new Error('演示加载失败');
  if (DEMO_SCENARIO.list === 'empty') return [];
  if (DEMO_SCENARIO.list !== 'normal') throw new Error('无效演示配置');
  return demoActivities.map(forDisplay);
}

async function getActivity(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) return null;
  if (DEMO_SCENARIO.detail === 'error') throw new Error('演示加载失败');
  if (DEMO_SCENARIO.detail !== 'normal') throw new Error('无效演示配置');
  const activity = demoActivities.find(item => item.id === id);
  return activity ? forDisplay(activity) : null;
}

module.exports = { sourceLabel, listActivities, getActivity };
