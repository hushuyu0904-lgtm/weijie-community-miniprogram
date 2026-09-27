const cloud = require('../../services/cloud');
Page({
  data: { status: 'loading', items: [], error: '' },
  onLoad(options) { this._id = options && options.id; this._active = true; return this.load(); },
  onUnload() { this._active = false; },
  async load() {
    if (!this._id) { this.setData({ status: 'error', error: '活动链接无效' }); return; }
    this.setData({ status: 'loading', error: '' });
    try { const items = await cloud.call('listActivityRegistrations', { id: this._id, offset: 0 }); if (this._active) this.setData({ status: 'ready', items }); }
    catch (error) { if (this._active) this.setData({ status: 'error', error: error.message || '名单加载失败' }); }
  }
});
