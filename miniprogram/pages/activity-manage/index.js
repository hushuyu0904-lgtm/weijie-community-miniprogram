const cloud = require('../../services/cloud');
Page({
  data: { status: 'loading', items: [], error: '', hasMore: false, loadingMore: false },
  onShow() { this._active = true; return this.loadActivities(); },
  onHide() { this._active = false; this._request++; this.setData({ items: [], status: 'loading' }); },
  onUnload() { this._active = false; },
  async loadActivities() {
    const request = this._request = (this._request || 0) + 1;
    this.setData({ status: 'loading', items: [], error: '', hasMore: false, loadingMore: false });
    try {
      const items = await cloud.call('listManagedActivities', { offset: 0 });
      if (this._active && request === this._request) this.setData({ items, status: 'ready', hasMore: items.length === 20 });
    } catch (error) {
      if (this._active && request === this._request) this.setData({ status: 'error', error: error.message });
    }
  },
  async loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    const request = this._request;
    this.setData({ loadingMore: true, error: '' });
    try {
      const items = await cloud.call('listManagedActivities', { offset: this.data.items.length });
      if (this._active && request === this._request) this.setData({ items: this.data.items.concat(items), hasMore: items.length === 20 });
    } catch (error) {
      if (this._active && request === this._request) {
        if (['FORBIDDEN', 'UNAUTHENTICATED'].includes(error.code)) this.setData({ status: 'error', items: [], hasMore: false });
        this.setData({ error: error.message });
      }
    } finally {
      if (this._active && request === this._request) this.setData({ loadingMore: false });
    }
  },
  openEditor(event) {
    if (this.data.status !== 'ready') return;
    const id = event.currentTarget.dataset.id;
    if (id && !this.data.items.some(item => item.id === id)) return;
    wx.navigateTo({ url: '/pages/activity-edit/index' + (id ? '?id=' + encodeURIComponent(id) : ''), fail() { wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); } });
  }
});
