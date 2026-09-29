// 职业档案与 Coffee Chat 使用同一套方向词，避免用户在不同页面看到不一致的分类。
const directions = [
  { id: 'medical-ai', label: '医疗 AI' },
  { id: 'pharma', label: '药企 / Biotech' },
  { id: 'consulting', label: '咨询' },
  { id: 'internet', label: '互联网 / 产品' },
  { id: 'startup', label: '创业' },
  { id: 'investment', label: '投资' },
  { id: 'clinical', label: '临床发展 / 规培' },
  { id: 'research', label: '科研 / 学术' },
  { id: 'public-health', label: '公共卫生 / 政策' },
  { id: 'overseas', label: '海外深造 / 工作' },
  { id: 'other', label: '其他方向' }
];

module.exports = { directions };
