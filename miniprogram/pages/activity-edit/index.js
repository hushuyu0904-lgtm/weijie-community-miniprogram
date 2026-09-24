const cloud = require('../../services/cloud');
const emptyForm = { title: '', description: '', location: '', priceYuan: '', capacity: '', startAt: '', endAt: '', deadlineAt: '', refundPolicy: '' };
function timeText(value) { return new Date(value + 28800000).toISOString().slice(0, 16).replace('T', ' '); }
function parseTime(value) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) throw new Error('时间请填写 YYYY-MM-DD HH:mm（北京时间）');
  const result = Date.parse(value.replace(' ', 'T') + ':00+08:00');
  if (!Number.isFinite(result) || timeText(result) !== value) throw new Error('请填写真实有效的日期和时间');
  return result;
}
Page({
  data: { status: 'loading', form: emptyForm, version: 0, activityStatus: 'draft', busy: false, dirty: false, error: '', message: '' },
  onLoad(options) {
    this._active = true;
    this._existing = !!(options && options.id);
    this._id = this._existing ? options.id : 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    return this.loadEditor();
  },
  onUnload() { this._active = false; },
  async loadEditor() {
    this.setData({ status: 'loading', error: '' });
    try {
      const identity = await cloud.call('identity');
      if (identity.role !== 'admin') throw new Error('无管理权限');
      const activity = this._existing ? await cloud.call('getManagedActivity', { id: this._id }) : null;
      if (this._existing && !activity) throw new Error('活动不存在');
      if (!this._active) return;
      if (activity) this.applyActivity(activity);
      this.setData({ status: 'ready' });
    } catch (error) {
      if (this._active) this.setData({ status: 'error', error: error.message });
    }
  },
  applyActivity(activity) {
    const form = {
      title: activity.title, description: activity.description, location: activity.location,
      priceYuan: (activity.priceFen / 100).toFixed(2), capacity: String(activity.capacity),
      startAt: timeText(activity.startAt), endAt: timeText(activity.endAt), deadlineAt: timeText(activity.deadlineAt), refundPolicy: activity.refundPolicy
    };
    this.setData({ form, version: activity.version, activityStatus: activity.status, dirty: false });
    if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload();
  },
  inputField(event) {
    const field = event.currentTarget.dataset.field;
    if (!Object.prototype.hasOwnProperty.call(emptyForm, field) || this.data.busy || this.data.activityStatus !== 'draft') return;
    this.setData({ form: Object.assign({}, this.data.form, { [field]: event.detail.value }), dirty: true, message: '' });
    if (wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '活动尚未保存，离开将丢失修改' });
  },
  collectActivity() {
    const form = this.data.form;
    if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(form.priceYuan)) throw new Error('费用请填写非负金额，最多两位小数');
    if (!/^[1-9]\d*$/.test(form.capacity)) throw new Error('人数上限必须为正整数');
    const parts = form.priceYuan.split('.');
    const priceFen = Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0, 2));
    const capacity = Number(form.capacity);
    if (!Number.isSafeInteger(priceFen) || !Number.isSafeInteger(capacity)) throw new Error('金额或人数超过可处理范围');
    return { title: form.title, description: form.description, location: form.location, refundPolicy: form.refundPolicy,
      priceFen, capacity, startAt: parseTime(form.startAt), endAt: parseTime(form.endAt), deadlineAt: parseTime(form.deadlineAt) };
  },
  async saveDraft() {
    if (this.data.busy || this.data.status !== 'ready' || this.data.activityStatus !== 'draft') return;
    this.setData({ busy: true, error: '', message: '' });
    try {
      const activity = this.collectActivity();
      const saved = await cloud.call('saveDraft', { id: this._id, version: this.data.version, activity });
      if (this._active) { this.applyActivity(saved); this.setData({ message: '草稿已保存，成员暂不可见' }); }
    } catch (error) {
      if (this._active) this.setData({ error: error.message });
    } finally {
      if (this._active) this.setData({ busy: false });
    }
  },
  publish() {
    if (this.data.busy || this.data.dirty || !this.data.version || this.data.activityStatus !== 'draft') return;
    this.setData({ busy: true });
    wx.showModal({ title: '发布活动', content: '发布后已获准成员可见，本阶段已发布活动只读。是否继续？',
      success: result => {
        if (!this._active) return;
        if (result.confirm) this.publishConfirmed();
        else this.setData({ busy: false });
      },
      fail: () => { if (this._active) this.setData({ busy: false, error: '确认未完成，请重试' }); }
    });
  },
  async publishConfirmed() {
    this.setData({ error: '', message: '' });
    try {
      const activity = await cloud.call('publishActivity', { id: this._id, version: this.data.version });
      if (this._active) { this.applyActivity(activity); this.setData({ message: '活动已发布，已获准成员可在活动列表查看' }); }
    } catch (error) {
      if (this._active) this.setData({ error: error.message + '；结果不确定时请返回活动管理核实' });
    } finally {
      if (this._active) this.setData({ busy: false });
    }
  }
});
