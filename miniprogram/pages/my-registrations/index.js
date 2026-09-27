const cloud = require('../../services/cloud');
function timeText(value) { return new Date(value + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ') + '（北京时间）'; }
Page({
  data: { status: 'loading', items: [], error: '' },
  onShow() { this._active = true; return this.load(); },
  onHide() { this._active = false; },
  onUnload() { this._active = false; },
  async load() {
    this.setData({ status: 'loading', error: '' });
    try {
      const items = await cloud.call('listMyRegistrations', { offset: 0 });
      if (this._active) this.setData({ status: 'ready', items: items.map(item => Object.assign({}, item, { timeText: timeText(item.activityStartAt) })) });
    } catch (error) { if (this._active) this.setData({ status: 'error', error: error.message || '报名记录加载失败' }); }
  }
});
