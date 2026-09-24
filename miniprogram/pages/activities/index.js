const activities = require('../../services/activities');

Page({
  data: { sourceLabel: activities.sourceLabel, status: 'loading', items: [], error: '', hasMore: false, loadingMore: false, moreError: '' },
  onLoad() {
    this._active = true;
    this._firstShow = true;
    return this.loadActivities();
  },
  onShow() {
    if (this._firstShow) { this._firstShow = false; return; }
    this._active = true;
    return this.loadActivities();
  },
  onHide() {
    this._active = false;
    this._request++;
    this.setData({ items: [], status: 'loading', hasMore: false });
  },
  onUnload() { this._active = false; },
  async loadActivities() {
    const request = this._request = (this._request || 0) + 1;
    this.setData({ status: 'loading', items: [], error: '', moreError: '', loadingMore: false, hasMore: false });
    try {
      const items = await activities.listActivities();
      if (this._active && request === this._request) {
        this.setData({ items, status: items.length ? 'ready' : 'empty', hasMore: items.length === 20 });
      }
    } catch (error) {
      if (this._active && request === this._request) this.setData({ status: 'error', error: error.message || '活动加载失败，请重试' });
    }
  },
  async loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    const request = this._request;
    this.setData({ loadingMore: true, moreError: '' });
    try {
      const items = await activities.listActivities(this.data.items.length);
      if (this._active && request === this._request) this.setData({ items: this.data.items.concat(items), hasMore: items.length === 20 });
    } catch (error) {
      if (this._active && request === this._request) {
        if (['FORBIDDEN', 'UNAUTHENTICATED'].includes(error.code)) this.setData({ items: [], status: 'error', error: error.message, hasMore: false });
        else this.setData({ moreError: error.message || '加载失败，请重试' });
      }
    } finally {
      if (this._active && request === this._request) this.setData({ loadingMore: false });
    }
  },
  openActivity(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.items.some(item => item.id === id)) return;
    wx.navigateTo({
      url: '/pages/activity-detail/index?id=' + encodeURIComponent(id),
      fail() { wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); }
    });
  }
});
