const cloud = require('../../services/cloud');

const stageOptions = [
  { value: 'student', label: '医学生 / 在读' }, { value: 'graduate', label: '毕业后探索中' },
  { value: 'resident', label: '规培 / 临床早期' }, { value: 'clinician', label: '临床 / 医疗从业者' },
  { value: 'industry', label: '已在产业工作' }, { value: 'other', label: '其他' }
];
const directionOptions = [
  ['medical-ai', '医疗 AI'], ['pharma', '药企 / Biotech'], ['consulting', '咨询'], ['internet', '互联网 / 产品'], ['startup', '创业'], ['investment', '投资'], ['other', '其他方向']
];
const needOptions = [
  ['explore', '了解不同职业方向'], ['opportunities', '寻找实习或工作机会'], ['network', '认识相似背景的同行或前辈'], ['resume', '完善简历与求职准备']
].map(([value, label]) => ({ value, label }));

Page({
  data: {
    stageOptions, stageIndex: 0, needOptions, needIndex: 0,
    directionOptions: directionOptions.map(([value, label]) => ({ value, label, checked: false })),
    form: { displayName: '', organization: '', specialty: '', city: '', experience: '', shareExperience: false },
    consents: { privacyAccepted: false, opportunityOptIn: false }, submitting: false, error: ''
  },
  inputField(event) {
    const field = event.currentTarget.dataset.field;
    if (!['displayName', 'organization', 'specialty', 'city', 'experience'].includes(field)) return;
    this.setData({ ['form.' + field]: event.detail.value, error: '' });
  },
  selectStage(event) { this.setData({ stageIndex: Number(event.detail.value), error: '' }); },
  selectNeed(event) { this.setData({ needIndex: Number(event.detail.value), error: '' }); },
  selectDirections(event) {
    const values = event.detail.value || [];
    if (values.length > 5) { wx.showToast({ title: '最多选择 5 个方向', icon: 'none' }); return; }
    this.setData({ directionOptions: directionOptions.map(([value, label]) => ({ value, label, checked: values.includes(value) })), error: '' });
  },
  toggleShare(event) { this.setData({ 'form.shareExperience': !!event.detail.value }); },
  changeConsent(event) {
    const values = event.detail.value || [];
    this.setData({ consents: { privacyAccepted: values.includes('privacy'), opportunityOptIn: values.includes('opportunity') }, error: '' });
  },
  showPrivacy() {
    wx.showModal({ title: '内测数据说明', content: '未界仅将你填写的职业背景、兴趣方向与授权偏好用于活动推荐、资源推荐和人工连接撮合。资料不会对其他用户公开，也不会在未经你同意的情况下提供给企业。正式上线前将补充完整隐私政策与个人信息处理规则。', showCancel: false });
  },
  async submit() {
    const directions = this.data.directionOptions.filter(item => item.checked).map(item => item.value);
    const profile = Object.assign({}, this.data.form, { stage: stageOptions[this.data.stageIndex].value, directions, currentNeed: needOptions[this.data.needIndex].value });
    if (!profile.displayName.trim() || !profile.organization.trim() || !profile.specialty.trim() || !profile.city.trim() || !directions.length || !this.data.consents.privacyAccepted) {
      this.setData({ error: '请完成必填项，并确认内测隐私说明。' }); return;
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
