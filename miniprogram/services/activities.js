const config = require('../config');
const cloud = require('./cloud');
const demo = require('./demo-activities');
const media = require('./resource-media');
const isDemo = config.mode === 'demo';
const sourceLabel = isDemo ? demo.sourceLabel : '云端模式 · 未使用演示数据';

function dateText(timestamp) {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

function forDisplay(activity) {
  if (isDemo) return Object.assign({}, activity, { isDemo: true, dateLabel: '待定', category: activity.id === 'demo-medical-ai' ? 'lecture' : 'coffee', cover: activity.id === 'demo-medical-ai' ? 'ai' : 'scene', priceText: activity.priceFen === 0 ? '免费' : activity.priceText });
  return Object.assign({}, activity, {
    isDemo: false, dateLabel: dateText(activity.startAt).slice(5,10).replace('-', '/'), cover: 'scene',
    priceText: activity.priceFen === 0 ? '免费' : '¥' + (activity.priceFen / 100).toFixed(2),
    timeText: dateText(activity.startAt) + ' 至 ' + dateText(activity.endAt) + '（北京时间）',
    deadlineText: dateText(activity.deadlineAt) + '（北京时间）',
    canRegister: activity.priceFen === 0 && activity.deadlineAt > Date.now()
  });
}

async function listActivities(offset = 0, category) {
  const payload = { offset };
  if (category && category !== 'all') payload.category = category;
  const items = isDemo ? (await demo.listActivities()).filter(item => !category || category === 'all' || (item.id === 'demo-medical-ai' ? 'lecture' : 'coffee') === category).slice(offset, offset + 20) : await cloud.call('listActivities', payload);
  const displayed = items.map(forDisplay);
  if (isDemo) return displayed;
  const urls = await media.getTempFileUrls(displayed.map(item => item.coverFileId));
  return displayed.map(item => Object.assign({}, item, { coverUrl: urls[item.coverFileId] || '' }));
}

async function getActivity(id) {
  if (typeof id !== 'string' || !(isDemo ? /^[a-z0-9-]{1,64}$/ : /^a-[a-z0-9-]{8,60}$/).test(id)) return null;
  const item = isDemo ? await demo.getActivity(id) : await cloud.call('getActivity', { id });
  if (!item) return null;
  const displayed = forDisplay(item);
  if (isDemo) return displayed;
  const urls = await media.getTempFileUrls([displayed.coverFileId]);
  return Object.assign({}, displayed, { coverUrl: urls[displayed.coverFileId] || '' });
}

async function registerActivity(id) {
  if (isDemo) throw new Error('演示模式不支持真实报名');
  if (typeof id !== 'string' || !/^a-[a-z0-9-]{8,60}$/.test(id)) throw new Error('活动链接无效');
  return cloud.call('registerActivity', { id });
}

module.exports = { sourceLabel, listActivities, getActivity, registerActivity };
