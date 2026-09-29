const cloud = require('../../services/cloud');
Page({
  data: { status: 'loading', identity: null, error: '', stageLabel: '', directionLabels: '' },
  onShow() { if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 3 }); this._active = true; return this.loadIdentity(); },
  onHide() { this._active = false; this._request++; this.setData({ identity: null }); },
  onUnload() { this._active = false; },
  async loadIdentity() {
    const request = this._request = (this._request || 0) + 1;
    this.setData({ status: 'loading', identity: null, error: '' });
    try {
      const identity = await cloud.call('identity');
      if (this._active && request === this._request) this.setData({ identity, status: 'ready', stageLabel: this.stageLabel(identity), directionLabels: this.directionLabels(identity) });
    } catch (error) {
      if (this._active && request === this._request) this.setData({ status: 'error', error: error.message });
    }
  },
  copyIdentity() {
    if (!this.data.identity) return;
    wx.setClipboardData({ data: this.data.identity.memberKey, fail() { wx.showToast({ title: '复制失败，请重试', icon: 'none' }); } });
  },
  stageLabel(identity) {
    const labels = { student: '医学生 / 在读', graduate: '毕业后探索 / 过渡期', resident: '规培 / 临床早期', clinician: '临床 / 医疗从业者', industry: '已在产业工作', other: '其他' };
    return identity && identity.profile ? labels[identity.profile.stage] || '待补充' : '';
  },
  directionLabels(identity) {
    const labels = { 'medical-ai': '医疗 AI', pharma: '药企 / Biotech', consulting: '咨询', internet: '互联网 / 产品', startup: '创业', investment: '投资', clinical: '临床发展 / 规培', research: '科研 / 学术', 'public-health': '公共卫生 / 政策', overseas: '海外深造 / 工作', other: '其他方向' };
    return identity && identity.profile ? (identity.profile.directions || []).map(item => labels[item] || item).join('、') : '';
  },
  openOnboarding() {
    wx.navigateTo({ url: '/pages/onboarding/index', fail() { wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); } });
  },
  openRegistrations() {
    wx.navigateTo({ url: '/pages/my-registrations/index', fail() { wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); } });
  },
  openConnections() {
    wx.navigateTo({ url: '/pages/my-connections/index', fail() { wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); } });
  },
  openResourceManage() {
    if (!this.data.identity || this.data.identity.role !== 'admin') return;
    wx.navigateTo({ url: '/pages/resource-manage/index', fail() { wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); } });
  },
  openConnectionManage() {
    if (!this.data.identity || this.data.identity.role !== 'admin') return;
    wx.navigateTo({ url: '/pages/connection-manage/index', fail() { wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); } });
  },
  openManage() {
    if (!this.data.identity || this.data.identity.role !== 'admin') return;
    wx.navigateTo({ url: '/pages/activity-manage/index', fail() { wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); } });
  }
});
