const cloud = require('../../services/cloud');
const profileOptions = require('../../data/profile-options');

const stageOptions = [
  { value: 'student', label: '医学生 / 在读' }, { value: 'graduate', label: '毕业后探索 / 过渡期' },
  { value: 'resident', label: '规培 / 临床早期' }, { value: 'clinician', label: '临床 / 医疗从业者' },
  { value: 'industry', label: '已在产业工作' }, { value: 'other', label: '其他' }
];
const directionOptions = profileOptions.directions.map(item => [item.id, item.label]);
const needOptions = [
  ['explore', '了解不同职业方向'], ['opportunities', '寻找实习或工作机会'], ['network', '寻找同行或前辈交流'], ['resume', '完善简历与求职准备']
].map(([value, label]) => ({ value, label }));

Page({
  data: {
    stageOptions, stageIndex: 0, needOptions: needOptions.map(item => Object.assign({}, item, { checked: false })),
    directionOptions: directionOptions.map(([value, label]) => ({ value, label, checked: false })),
    needValues: [],
    form: { displayName: '', organization: '', specialty: '', city: '', experience: '', shareExperience: false },
    consents: { privacyAccepted: false, opportunityOptIn: false }, submitting: false, error: ''
  },
  inputField(event) {
    const field = event.currentTarget.dataset.field;
    if (!['displayName', 'organization', 'specialty', 'city', 'experience'].includes(field)) return;
    this.setData({ ['form.' + field]: event.detail.value, error: '' });
  },
  selectStage(event) { this.setData({ stageIndex: Number(event.detail.value), error: '' }); },
  onLoad() { this._active = true; return this.loadExisting(); },
  onUnload() { this._active = false; },
  async loadExisting() {
    try {
      const identity = await cloud.call('identity');
      if (!this._active || !identity.profile) return;
      const profile = identity.profile;
      const stageIndex = Math.max(0, stageOptions.findIndex(item => item.value === profile.stage));
      const selectedDirections = Array.isArray(profile.directions) ? profile.directions : [];
      const needValues = Array.isArray(profile.currentNeeds) ? profile.currentNeeds : [];
      this.setData({
        stageIndex,
        directionOptions: directionOptions.map(([value, label]) => ({ value, label, checked: selectedDirections.includes(value) })),
        needValues,
        needOptions: needOptions.map(item => Object.assign({}, item, { checked: needValues.includes(item.value) })),
        form: Object.assign({}, this.data.form, {
          displayName: profile.displayName || '', organization: profile.organization || '', specialty: profile.specialty || '',
          city: profile.city || '', experience: profile.experience || '', shareExperience: profile.shareExperience === true
        }),
        consents: { privacyAccepted: true, opportunityOptIn: identity.opportunityOptIn === true }
      });
    } catch (error) { /* 新用户未建档时不阻塞填写；提交时由云函数完成注册。 */ }
  },
  selectDirections(event) {
    const values = event.detail.value || [];
    if (values.length > 5) { wx.showToast({ title: '最多选择 5 个方向', icon: 'none' }); return; }
    this.setData({ directionOptions: directionOptions.map(([value, label]) => ({ value, label, checked: values.includes(value) })), error: '' });
  },
  selectNeeds(event) {
    const values = event.detail.value || [];
    this.setData({ needValues: values, needOptions: needOptions.map(item => Object.assign({}, item, { checked: values.includes(item.value) })), error: '' });
  },
  toggleShare(event) { this.setData({ 'form.shareExperience': !!event.detail.value }); },
  changeConsent(event) {
    const values = event.detail.value || [];
    this.setData({ consents: { privacyAccepted: values.includes('privacy'), opportunityOptIn: values.includes('opportunity') }, error: '' });
  },
  showPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/index' });
  },
  openHelp() { wx.navigateTo({ url: '/pages/help/index' }); },
  async submit() {
    const directions = this.data.directionOptions.filter(item => item.checked).map(item => item.value);
    const currentNeeds = this.data.needOptions.filter(item => item.checked).map(item => item.value);
    const profile = Object.assign({}, this.data.form, { stage: stageOptions[this.data.stageIndex].value, directions, currentNeeds });
    if (!profile.displayName.trim() || !profile.organization.trim() || !profile.specialty.trim() || !profile.city.trim() || !directions.length || !profile.currentNeeds.length || !this.data.consents.privacyAccepted) {
      this.setData({ error: '请完成必填项，并确认隐私与数据说明。' }); return;
    }
    this.setData({ submitting: true, error: '' });
    try {
      await cloud.call('completeOnboarding', { profile, consents: this.data.consents });
      wx.showToast({ title: '职业档案已保存', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/activities/index' }), 400);
    } catch (error) {
      this.setData({ error: error.message || '保存失败，请稍后重试' });
    } finally { this.setData({ submitting: false }); }
  }
});
