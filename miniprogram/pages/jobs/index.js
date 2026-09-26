Page({
  data: { coverFailed: false },
  onCoverError() { this.setData({ coverFailed: true }); },
  onShow() { if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: 1 }); } });
