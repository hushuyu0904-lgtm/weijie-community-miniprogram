const cloud = require('../../services/cloud');
Page({
  data: { status: 'loading', identity: null, error: '' },
  onShow() { this._active = true; return this.loadIdentity(); },
  onHide() { this._active = false; this._request++; this.setData({ identity: null }); },
  onUnload() { this._active = false; },
  async loadIdentity() {
    const request = this._request = (this._request || 0) + 1;
    this.setData({ status: 'loading', identity: null, error: '' });
    try {
      const identity = await cloud.call('identity');
      if (this._active && request === this._request) this.setData({ identity, status: 'ready' });
    } catch (error) {
      if (this._active && request === this._request) this.setData({ status: 'error', error: error.message });
    }
  },
  copyIdentity() {
    if (!this.data.identity) return;
    wx.setClipboardData({ data: this.data.identity.memberKey, fail() { wx.showToast({ title: '复制失败，请重试', icon: 'none' }); } });
  },
  openManage() {
    if (!this.data.identity || this.data.identity.role !== 'admin') return;
    wx.navigateTo({ url: '/pages/activity-manage/index', fail() { wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); } });
  }
});
