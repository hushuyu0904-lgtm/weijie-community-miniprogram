const config = require('../config');
let initialized = false;

async function call(action, payload = {}) {
  if (config.mode !== 'cloud') throw new Error('演示模式不提供真实身份或管理功能');
  if (!config.envId) throw new Error('尚未配置 CloudBase 环境，请联系项目负责人');
  if (typeof wx === 'undefined' || !wx.cloud) throw new Error('当前环境不支持微信云开发');
  if (!initialized) {
    wx.cloud.init({ env: config.envId, traceUser: false });
    initialized = true;
  }
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

module.exports = { call };
