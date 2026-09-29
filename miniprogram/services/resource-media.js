const cloud = require('./cloud');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function chooseOneImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success(result) {
        const file = result && result.tempFiles && result.tempFiles[0];
        if (!file || !file.tempFilePath) return reject(new Error('没有选择图片'));
        if (Number.isFinite(file.size) && file.size > MAX_IMAGE_BYTES) return reject(new Error('图片请控制在 5MB 以内'));
        resolve(file.tempFilePath);
      },
      fail(error) {
        if (error && /cancel/i.test(error.errMsg || '')) return reject(new Error('已取消选择图片'));
        reject(new Error('无法选择图片，请检查相册或相机权限'));
      }
    });
  });
}

async function pickAndUploadImage() {
  const path = await chooseOneImage();
  return cloud.uploadResourceImage(path);
}

async function pickAndUploadAvatar() {
  const path = await chooseOneImage();
  return cloud.uploadAvatarImage(path);
}

async function pickAndUploadActivityCover() {
  const path = await chooseOneImage();
  return cloud.uploadActivityImage(path);
}

module.exports = { pickAndUploadImage, pickAndUploadAvatar, pickAndUploadActivityCover, getTempFileUrls: cloud.getTempFileUrls };
