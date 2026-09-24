const cloud = require('wx-server-sdk');
const crypto = require('node:crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const FIELDS = ['title', 'description', 'location', 'priceFen', 'capacity', 'startAt', 'endAt', 'deadlineAt', 'refundPolicy'];

function fail(code, message) {
  const error = new Error(message);
  error.businessCode = code;
  throw error;
}

function fieldsOnly(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) {
    fail('INVALID_ARGUMENT', '请求包含不允许的字段');
  }
}

function activityInput(value, publishing) {
  fieldsOnly(value, FIELDS);
  const result = {};
  for (const [field, limit] of [['title', 120], ['description', 5000], ['location', 200], ['refundPolicy', 2000]]) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > limit) {
      fail('INVALID_ARGUMENT', '请完整填写标题、说明、地点和退款规则，并遵守长度限制');
    }
    result[field] = value[field].trim();
  }
  if (!Number.isSafeInteger(value.priceFen) || value.priceFen < 0) fail('INVALID_ARGUMENT', '金额必须为非负整数分');
  if (!Number.isSafeInteger(value.capacity) || value.capacity < 1) fail('INVALID_ARGUMENT', '容量必须为正整数');
  result.priceFen = value.priceFen;
  result.capacity = value.capacity;
  for (const field of ['startAt', 'endAt', 'deadlineAt']) {
    if (!Number.isSafeInteger(value[field]) || !Number.isFinite(new Date(value[field]).getTime())) {
      fail('INVALID_ARGUMENT', '活动时间必须为有效时间');
    }
    result[field] = value[field];
  }
  if (result.endAt <= result.startAt || result.deadlineAt > result.startAt || result.deadlineAt <= 0) {
    fail('INVALID_ARGUMENT', '结束须晚于开始，报名截止不得晚于开始');
  }
  if (publishing && result.deadlineAt <= Date.now()) fail('INVALID_ARGUMENT', '发布时报名截止时间必须在未来');
  return result;
}

function validId(id) {
  if (typeof id !== 'string' || !/^a-[a-z0-9-]{8,60}$/.test(id)) fail('INVALID_ARGUMENT', '活动编号无效');
  return id;
}

function expectedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_ARGUMENT', '版本编号无效');
  return value;
}

async function findActivity(id) {
  const result = await db.collection('activities').where({ _id: id }).limit(1).get();
  return result.data[0] || null;
}

function visibleActivity(item) {
  const result = { id: item._id, status: item.status, version: item.version };
  for (const field of FIELDS) result[field] = item[field];
  return result; // 不向成员返回创建者身份、成员记录或内部数据库字段。
}

function requireMember(member) {
  if (!member || member.active !== true || !['member', 'admin'].includes(member.role)) {
    fail('FORBIDDEN', '尚未获准访问社群，请联系运营者');
  }
}

function requireAdmin(member) {
  requireMember(member);
  if (member.role !== 'admin') fail('FORBIDDEN', '无管理权限');
}

async function saveDraft(event, actor) {
  const id = validId(event.id);
  const version = expectedVersion(event.version);
  const input = activityInput(event.activity, false);
  const collection = db.collection('activities');
  const existing = await findActivity(id);
  if (!existing) {
    if (version !== 0) fail('CONFLICT', '草稿不存在，请返回活动管理核实');
    const record = Object.assign({}, input, {
      _id: id, status: 'draft', version: 1, createdBy: actor,
      createdAt: Date.now(), updatedAt: Date.now()
    });
    try {
      await collection.add({ data: record });
      return visibleActivity(record);
    } catch (error) {
      // 同一草稿编号的网络重试不再创建第二条记录；查询失败也不会假装成功。
      const saved = await findActivity(id);
      if (saved && saved.createdBy === actor && saved.status === 'draft' && saved.version === 1 &&
          FIELDS.every(key => saved[key] === input[key])) return visibleActivity(saved);
      if (saved) fail('CONFLICT', '草稿编号已存在，请返回活动管理核实');
      throw error;
    }
  }
  if (existing.status !== 'draft') fail('CONFLICT', '已发布活动本阶段只读');
  if (existing.version === version + 1 && FIELDS.every(key => existing[key] === input[key])) {
    return visibleActivity(existing);
  }
  if (existing.version !== version) fail('CONFLICT', '活动已被更新，请返回管理列表重新打开');
  const changes = Object.assign({}, input, { version: version + 1, updatedAt: Date.now() });
  const result = await collection.where({ _id: id, status: 'draft', version }).update({ data: changes });
  if (result.stats.updated !== 1) fail('CONFLICT', '活动状态已变化，请返回管理列表核实');
  return visibleActivity(Object.assign({}, existing, changes));
}

async function publishActivity(event) {
  const id = validId(event.id);
  const version = expectedVersion(event.version);
  const existing = await findActivity(id);
  if (!existing) fail('NOT_FOUND', '活动不存在');
  if (existing.status === 'published') return visibleActivity(existing);
  if (existing.status !== 'draft' || existing.version !== version) fail('CONFLICT', '活动状态已变化，请重新打开');
  const input = {};
  for (const field of FIELDS) input[field] = existing[field];
  activityInput(input, true);
  const changes = { status: 'published', version: version + 1, publishedAt: Date.now(), updatedAt: Date.now() };
  const result = await db.collection('activities').where({ _id: id, status: 'draft', version }).update({ data: changes });
  if (result.stats.updated !== 1) fail('CONFLICT', '活动状态已变化，请核实发布结果');
  return visibleActivity(Object.assign({}, existing, changes));
}

exports.main = async event => {
  try {
    const context = cloud.getWXContext();
    const expectedAppId = process.env.WECHAT_APPID;
    if (!expectedAppId) fail('NOT_CONFIGURED', '服务端尚未配置小程序 AppID');
    if (!context || typeof context.OPENID !== 'string' || !context.OPENID || context.APPID !== expectedAppId) {
      fail('UNAUTHENTICATED', '无法验证微信身份，请从已绑定的小程序访问');
    }
    const memberKey = crypto.createHash('sha256').update(context.APPID + ':' + context.OPENID).digest('hex');
    const found = await db.collection('members').where({ _id: memberKey }).limit(1).get();
    const member = found.data[0] || null;
    const active = !!member && member.active === true && ['admin', 'member'].includes(member.role);
    const action = event && event.action;
    const allowed = {
      identity: [], listActivities: ['offset'], getActivity: ['id'],
      listManagedActivities: ['offset'], getManagedActivity: ['id'],
      saveDraft: ['id', 'version', 'activity'], publishActivity: ['id', 'version']
    };
    if (!Object.prototype.hasOwnProperty.call(allowed, action)) fail('INVALID_ARGUMENT', '不支持的操作');
    // userInfo 可能由平台附加，但绝不用于身份或角色判断。
    fieldsOnly(event, ['action', 'userInfo'].concat(allowed[action]));
    if (action === 'identity') return { ok: true, data: { memberKey, role: active ? member.role : 'visitor', canBrowse: active } };
    requireMember(member);
    if (['listManagedActivities', 'getManagedActivity', 'saveDraft', 'publishActivity'].includes(action)) requireAdmin(member);
    let data;
    if (action === 'saveDraft') data = await saveDraft(event, memberKey);
    else if (action === 'publishActivity') data = await publishActivity(event);
    else if (action === 'getActivity' || action === 'getManagedActivity') {
      const item = await findActivity(validId(event.id));
      data = item && (action === 'getManagedActivity' || item.status === 'published') ? visibleActivity(item) : null;
    } else {
      const offset = event.offset === undefined ? 0 : event.offset;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) fail('INVALID_ARGUMENT', '分页参数无效');
      const query = action === 'listActivities' ? { status: 'published' } : {};
      const result = await db.collection('activities').where(query).orderBy('createdAt', 'desc').orderBy('_id', 'desc').skip(offset).limit(20).get();
      data = result.data.map(visibleActivity);
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, code: error.businessCode || 'BACKEND_ERROR', message: error.businessCode ? error.message : '服务暂不可用，请重试；若持续失败请联系运营者检查云环境' };
  }
};
