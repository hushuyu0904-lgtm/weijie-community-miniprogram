const cloud = require('../../services/cloud');
const media = require('../../services/resource-media');
const categoryLabels = { opportunity: '机会', news: '行业资讯', knowledge: '知识库', recap: '活动回顾' };

function legacyBlocks(content) { return content ? [{ type: 'paragraph', text: content }] : []; }

Page({
  data: { status: 'loading', item: null, error: '' },
  onLoad(options) { this._active = true; this._id = options && options.id; return this.load(); },
  onUnload() { this._active = false; },
  async load() {
    if (typeof this._id !== 'string') { this.setData({ status: 'error', error: '资源链接无效' }); return; }
    this.setData({ status: 'loading', error: '' });
    try {
      const item = await cloud.call('getResource', { id: this._id });
      if (!item) throw new Error('资源不存在或尚未发布');
      const blocks = Array.isArray(item.blocks) && item.blocks.length ? item.blocks : legacyBlocks(item.content);
      const urls = await media.getTempFileUrls([item.coverFileId].concat(blocks.filter(block => block.type === 'image').map(block => block.fileId)));
      if (!this._active) return;
      this.setData({ status: 'ready', item: Object.assign({}, item, { categoryLabel: categoryLabels[item.category] || '资源', coverUrl: urls[item.coverFileId] || '', blocks: blocks.map(block => block.type === 'image' ? Object.assign({}, block, { previewUrl: urls[block.fileId] || '' }) : block) }) });
    } catch (error) { if (this._active) this.setData({ status: 'error', error: error.message || '资源加载失败' }); }
  },
  copySource() { const url = this.data.item && this.data.item.sourceUrl; if (!url) return; wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '已复制，请在浏览器打开', icon: 'none' }), fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }) }); }
});
