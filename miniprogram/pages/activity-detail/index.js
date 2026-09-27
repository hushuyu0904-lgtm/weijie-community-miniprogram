const activities = require('../../services/activities');

Page({
  data: { sourceLabel: activities.sourceLabel, status: 'loading', activity: null, error: '', registering: false },
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
  },
  async register() {
    const activity = this.data.activity;
    if (!activity || !activity.canRegister || this.data.registering || activity.myRegistration) return;
    this.setData({ registering: true, error: '' });
    try {
      const registration = await activities.registerActivity(activity.id);
      this.setData({ 'activity.myRegistration': registration, 'activity.registrationCount': registration.status === 'confirmed' ? activity.registrationCount + 1 : activity.registrationCount });
      wx.showModal({ title: registration.status === 'confirmed' ? '报名成功' : '已进入候补', content: registration.status === 'confirmed' ? '你已获得活动名额。活动安排如有变化，将由未界另行通知。' : '当前名额已满，你已进入候补名单。若有空位，未界将按候补顺序联系你。', showCancel: false });
    } catch (error) {
      this.setData({ error: error.message || '报名失败，请稍后重试' });
    } finally { this.setData({ registering: false }); }
  }
});
