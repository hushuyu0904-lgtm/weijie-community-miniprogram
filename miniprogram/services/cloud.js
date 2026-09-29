const config = require('../config');
let initialized = false;

function ensureInitialized() {
  if (config.mode !== 'cloud') throw new Error('演示模式不提供真实身份或管理功能');
  if (!config.envId) throw new Error('尚未配置 CloudBase 环境，请联系项目负责人');
  if (typeof wx === 'undefined' || !wx.cloud) throw new Error('当前环境不支持微信云开发');
  if (!initialized) {
    wx.cloud.init({ env: config.envId, traceUser: false });
    initialized = true;
  }
}

async function call(action, payload = {}) {
  ensureInitialized();
  let response;
  try {
    response = await wx.cloud.callFunction({ name: 'community', data: Object.assign({}, payload, { action }) });
  } catch (error) {
    throw new Error('云函数连接失败，请检查网络、AppID、环境绑定与部署配置');
  }
  const result = response && response.result;
  if (!result || result.ok !== true) {
    const error = new Error(result && result.message || '云函数返回异常，请重试');
    error.code = result && result.code;
    throw error;
  }
  return result.data;
}

async function uploadResourceImage(filePath) {
  ensureInitialized();
  if (typeof filePath !== 'string' || !filePath) throw new Error('图片文件无效');
  const suffix = (filePath.match(/\.([a-zA-Z0-9]{1,8})(?:$|\?)/) || [])[1] || 'jpg';
  const cloudPath = 'resources/' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.' + suffix.toLowerCase();
  try {
    const result = await wx.cloud.uploadFile({ cloudPath, filePath });
    if (!result || typeof result.fileID !== 'string' || !result.fileID) throw new Error('云存储未返回图片编号');
    return result.fileID;
  } catch (error) {
    throw new Error('图片上传失败，请检查云开发存储配置和网络后重试');
  }
}

async function getTempFileUrls(fileIds) {
  ensureInitialized();
  const valid = Array.from(new Set((fileIds || []).filter(id => typeof id === 'string' && id.startsWith('cloud://'))));
  if (!valid.length) return {};
  try {
    const result = await wx.cloud.getTempFileURL({ fileList: valid });
    return (result.fileList || []).reduce((map, item) => {
      if (item.fileID && item.tempFileURL) map[item.fileID] = item.tempFileURL;
      return map;
    }, {});
  } catch (error) {
    return {};
  }
}

module.exports = { call, uploadResourceImage, getTempFileUrls };
