const config = require('../config');
const cloud = require('./cloud');
const demo = require('./demo-activities');
const isDemo = config.mode === 'demo';
const sourceLabel = isDemo ? demo.sourceLabel : '云端模式 · 未使用演示数据';

function dateText(timestamp) {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

function forDisplay(activity) {
  if (isDemo) return Object.assign({}, activity, { isDemo: true, priceText: activity.priceFen === 0 ? '免费' : activity.priceText });
  return Object.assign({}, activity, {
    isDemo: false,
    priceText: activity.priceFen === 0 ? '免费' : '¥' + (activity.priceFen / 100).toFixed(2),
    timeText: dateText(activity.startAt) + ' 至 ' + dateText(activity.endAt) + '（北京时间）',
    deadlineText: dateText(activity.deadlineAt) + '（北京时间）'
  });
}

async function listActivities(offset = 0) {
  const items = isDemo ? (await demo.listActivities()).slice(offset, offset + 20) : await cloud.call('listActivities', { offset });
  return items.map(forDisplay);
}

async function getActivity(id) {
  if (typeof id !== 'string' || !(isDemo ? /^[a-z0-9-]{1,64}$/ : /^a-[a-z0-9-]{8,60}$/).test(id)) return null;
  const item = isDemo ? await demo.getActivity(id) : await cloud.call('getActivity', { id });
  return item ? forDisplay(item) : null;
}

module.exports = { sourceLabel, listActivities, getActivity };
