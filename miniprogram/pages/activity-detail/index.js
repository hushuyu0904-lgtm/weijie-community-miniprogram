const activities = require('../../services/activities');

Page({
  data: { coverFailed: false, sourceLabel: activities.sourceLabel, status: 'loading', activity: null, error: '' },
  onCoverError() { this.setData({ coverFailed: true }); },
  onLoad(options) {
    this._active = true;
    this._firstShow = true;
    this._id = options && options.id;
    return this.loadActivity();
  },
  onShow() {
    if (this._firstShow) { this._firstShow = false; return; }
    this._active = true;
    return this.loadActivity();
  },
  onHide() { this._active = false; this._request++; this.setData({ activity: null, status: 'loading' }); },
  onUnload() { this._active = false; },
  async loadActivity() {
    const request = this._request = (this._request || 0) + 1;
    this.setData({ status: 'loading', activity: null, error: '' });
    try {
      const activity = await activities.getActivity(this._id);
      if (this._active && request === this._request) {
        this.setData({ activity, status: activity ? 'ready' : 'missing' });
      }
    } catch (error) {
      if (this._active && request === this._request) this.setData({ status: 'error', error: error.message || '活动详情加载失败，请重试' });
    }
  },
  goBack() {
    const showList = () => wx.switchTab({
      url: '/pages/activities/index',
      fail() { wx.showToast({ title: '返回失败，请重试', icon: 'none' }); }
    });
    if (getCurrentPages().length > 1) wx.navigateBack({ delta: 1, fail: showList });
    else showList();
  }
});
