const cloud = require('wx-server-sdk');
const crypto = require('node:crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const FIELDS = ['title', 'description', 'location', 'category', 'priceFen', 'capacity', 'startAt', 'endAt', 'deadlineAt', 'refundPolicy'];
const ACTIVITY_CATEGORIES = ['coffee', 'outing', 'lecture', 'chat', 'other'];
const RESOURCE_FIELDS = ['title', 'summary', 'category', 'content', 'sourceLabel', 'sourceUrl'];
const RESOURCE_CATEGORIES = ['opportunity', 'news', 'knowledge', 'recap'];
const PROFILE_FIELDS = ['displayName', 'stage', 'organization', 'specialty', 'city', 'directions', 'currentNeed', 'experience', 'shareExperience'];
const STAGES = ['student', 'graduate', 'resident', 'clinician', 'industry', 'other'];
const DIRECTIONS = ['medical-ai', 'pharma', 'consulting', 'internet', 'startup', 'investment', 'other'];
const NEEDS = ['explore', 'opportunities', 'network', 'resume'];
const CONNECTION_STATUSES = ['submitted', 'reviewing', 'closed'];

function fail(code, message) {
  const error = new Error(message);
  error.businessCode = code;
  throw error;
}

function fieldsOnly(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_ARGUMENT', '请求格式无效');
  }
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  if (unexpected.length) {
    // 只返回字段名，方便测试环境定位前端协议或平台注入，不回显字段值。
    fail('INVALID_ARGUMENT', '请求包含不允许的字段：' + unexpected.slice(0, 5).join('、'));
  }
}

function textField(value, name, limit, required = true) {
  if (!required && value === undefined) return '';
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    fail('INVALID_ARGUMENT', name + (required ? '为必填项' : '格式无效'));
  }
  return value.trim();
}

function profileInput(value) {
  fieldsOnly(value, PROFILE_FIELDS);
  if (!STAGES.includes(value.stage)) fail('INVALID_ARGUMENT', '请选择当前阶段');
  if (!Array.isArray(value.directions) || value.directions.length < 1 || value.directions.length > 5 ||
      new Set(value.directions).size !== value.directions.length || value.directions.some(item => !DIRECTIONS.includes(item))) {
    fail('INVALID_ARGUMENT', '请选择 1 至 5 个感兴趣方向');
  }
  if (!NEEDS.includes(value.currentNeed)) fail('INVALID_ARGUMENT', '请选择当前最希望解决的问题');
  if (typeof value.shareExperience !== 'boolean') fail('INVALID_ARGUMENT', '分享意愿格式无效');
  return {
    displayName: textField(value.displayName, '称呼', 30),
    stage: value.stage,
    organization: textField(value.organization, '学校或单位', 100),
    specialty: textField(value.specialty, '专业或岗位方向', 80),
    city: textField(value.city, '所在城市', 40),
    directions: value.directions.slice(),
    currentNeed: value.currentNeed,
    experience: textField(value.experience, '经历介绍', 1000, false),
    shareExperience: value.shareExperience
  };
}

function consentInput(value) {
  fieldsOnly(value, ['privacyAccepted', 'opportunityOptIn']);
  if (value.privacyAccepted !== true || typeof value.opportunityOptIn !== 'boolean') {
    fail('INVALID_ARGUMENT', '请确认隐私说明并检查授权选项');
  }
  return { privacyAccepted: true, opportunityOptIn: value.opportunityOptIn };
}

function safeProfile(member) {
  if (!member || !member.profile) return null;
  const profile = {};
  for (const field of PROFILE_FIELDS) profile[field] = Array.isArray(member.profile[field]) ? member.profile[field].slice() : member.profile[field];
  return profile;
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
  if (!ACTIVITY_CATEGORIES.includes(value.category)) fail('INVALID_ARGUMENT', '请选择活动类型');
  result.category = value.category;
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
  if (publishing && result.priceFen !== 0) fail('INVALID_ARGUMENT', '小程序首发仅支持发布免费活动');
  return result;
}

function resourceInput(value, publishing) {
  fieldsOnly(value, RESOURCE_FIELDS);
  if (!RESOURCE_CATEGORIES.includes(value.category)) fail('INVALID_ARGUMENT', '请选择资源分类');
  const result = {
    title: textField(value.title, '资源标题', 120),
    summary: textField(value.summary, '资源简介', 1200),
    category: value.category,
    content: textField(value.content, '资源正文', 8000, false),
    sourceLabel: textField(value.sourceLabel, '来源说明', 160, false),
    sourceUrl: textField(value.sourceUrl, '来源链接', 2000, false)
  };
  if (result.sourceUrl && !/^https:\/\//.test(result.sourceUrl)) fail('INVALID_ARGUMENT', '来源链接须以 https:// 开头');
  if (publishing && !result.content && !result.sourceUrl) fail('INVALID_ARGUMENT', '发布资源请提供正文或来源链接');
  return result;
}

function validId(id) {
  if (typeof id !== 'string' || !/^a-[a-z0-9-]{8,60}$/.test(id)) fail('INVALID_ARGUMENT', '活动编号无效');
  return id;
}

function validResourceId(id) {
  if (typeof id !== 'string' || !/^s-[a-z0-9-]{8,60}$/.test(id)) fail('INVALID_ARGUMENT', '资源编号无效');
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
  const result = { id: item._id, status: item.status, version: item.version,
    registrationCount: Number.isSafeInteger(item.registrationCount) && item.registrationCount >= 0 ? item.registrationCount : 0 };
  for (const field of FIELDS) result[field] = item[field];
  return result; // 不向成员返回创建者身份、成员记录或内部数据库字段。
}

function visibleResource(item) {
  const result = { id: item._id, status: item.status, version: item.version };
  for (const field of RESOURCE_FIELDS) result[field] = item[field];
  return result;
}

async function findResource(id) {
  const result = await db.collection('resources').where({ _id: id }).limit(1).get();
  return result.data[0] || null;
}

async function saveResourceDraft(event, actor) {
  const id = validResourceId(event.id);
  const version = expectedVersion(event.version);
  const input = resourceInput(event.resource, false);
  const collection = db.collection('resources');
  const existing = await findResource(id);
  if (!existing) {
    if (version !== 0) fail('CONFLICT', '资源草稿不存在，请返回资源管理核实');
    const record = Object.assign({}, input, { _id: id, status: 'draft', version: 1, createdBy: actor, createdAt: Date.now(), updatedAt: Date.now() });
    try {
      await collection.add({ data: record });
      return visibleResource(record);
    } catch (error) {
      const saved = await findResource(id);
      if (saved && saved.createdBy === actor && saved.status === 'draft' && saved.version === 1 && RESOURCE_FIELDS.every(key => saved[key] === input[key])) return visibleResource(saved);
      if (saved) fail('CONFLICT', '资源编号已存在，请返回资源管理核实');
      throw error;
    }
  }
  if (existing.status !== 'draft') fail('CONFLICT', '已发布资源本阶段只读');
  if (existing.version === version + 1 && RESOURCE_FIELDS.every(key => existing[key] === input[key])) return visibleResource(existing);
  if (existing.version !== version) fail('CONFLICT', '资源已被更新，请返回管理列表重新打开');
  const changes = Object.assign({}, input, { version: version + 1, updatedAt: Date.now() });
  const result = await collection.where({ _id: id, status: 'draft', version }).update({ data: changes });
  if (result.stats.updated !== 1) fail('CONFLICT', '资源状态已变化，请返回管理列表核实');
  return visibleResource(Object.assign({}, existing, changes));
}

async function publishResource(event) {
  const id = validResourceId(event.id);
  const version = expectedVersion(event.version);
  const existing = await findResource(id);
  if (!existing) fail('NOT_FOUND', '资源不存在');
  if (existing.status === 'published') return visibleResource(existing);
  if (existing.status !== 'draft' || existing.version !== version) fail('CONFLICT', '资源状态已变化，请重新打开');
  const input = {};
  for (const field of RESOURCE_FIELDS) input[field] = existing[field];
  resourceInput(input, true);
  const changes = { status: 'published', version: version + 1, publishedAt: Date.now(), updatedAt: Date.now() };
  const result = await db.collection('resources').where({ _id: id, status: 'draft', version }).update({ data: changes });
  if (result.stats.updated !== 1) fail('CONFLICT', '资源状态已变化，请核实发布结果');
  return visibleResource(Object.assign({}, existing, changes));
}

function registrationId(activityId, memberKey) {
  return 'r-' + crypto.createHash('sha256').update(activityId + ':' + memberKey).digest('hex');
}

function connectionRequestId(memberKey) {
  return 'c-' + crypto.createHash('sha256').update('connection:' + memberKey).digest('hex');
}

function validConnectionId(id) {
  if (typeof id !== 'string' || !/^c-[a-f0-9]{64}$/.test(id)) fail('INVALID_ARGUMENT', '连接申请编号无效');
  return id;
}

function connectionRequestInput(value) {
  fieldsOnly(value, ['intent', 'directions', 'introduction', 'question', 'availability']);
  if (!['seek', 'share'].includes(value.intent)) fail('INVALID_ARGUMENT', '请选择连接目的');
  if (!Array.isArray(value.directions) || value.directions.length < 1 || value.directions.length > 5 ||
      new Set(value.directions).size !== value.directions.length || value.directions.some(item => !DIRECTIONS.includes(item))) {
    fail('INVALID_ARGUMENT', '请选择 1 至 5 个感兴趣方向');
  }
  return {
    intent: value.intent,
    directions: value.directions.slice(),
    introduction: textField(value.introduction, '个人背景与经历', 1500),
    question: textField(value.question, '希望交流的问题', 1000),
    availability: textField(value.availability, '可交流时间', 300, false)
  };
}

function profileSummary(member) {
  const profile = member && member.profile || {};
  return {
    displayName: typeof profile.displayName === 'string' && profile.displayName || '未填写称呼',
    stage: typeof profile.stage === 'string' && profile.stage || '',
    organization: typeof profile.organization === 'string' && profile.organization || '',
    specialty: typeof profile.specialty === 'string' && profile.specialty || ''
  };
}

function visibleMyConnectionRequest(item) {
  return {
    id: item._id, status: item.status, intent: item.intent, directions: item.directions.slice(),
    introduction: item.introduction, question: item.question, availability: item.availability,
    createdAt: item.createdAt, updatedAt: item.updatedAt,
    operatorNote: typeof item.operatorNote === 'string' ? item.operatorNote : ''
  };
}

function visibleAdminConnectionRequest(item) {
  return Object.assign(visibleMyConnectionRequest(item), { memberKey: item.memberKey, profileSummary: Object.assign({}, item.profileSummary) });
}

async function findConnectionRequest(id) {
  const result = await db.collection('connectionRequests').where({ _id: id }).limit(1).get();
  return result.data[0] || null;
}

async function saveConnectionRequest(memberKey, member, input) {
  const id = connectionRequestId(memberKey);
  const existing = await findConnectionRequest(id);
  const now = Date.now();
  const changes = Object.assign({}, input, { status: 'submitted', operatorNote: '', profileSummary: profileSummary(member), updatedAt: now });
  if (!existing) {
    const record = Object.assign({}, changes, { _id: id, memberKey, createdAt: now });
    try {
      await db.collection('connectionRequests').add({ data: record });
      return visibleMyConnectionRequest(record);
    } catch (error) {
      const latest = await findConnectionRequest(id);
      if (!latest) throw error;
      return visibleMyConnectionRequest(latest);
    }
  }
  if (!CONNECTION_STATUSES.includes(existing.status)) fail('CONFLICT', '连接申请状态异常，请联系运营者');
  await db.collection('connectionRequests').where({ _id: id }).update({ data: changes });
  return visibleMyConnectionRequest(Object.assign({}, existing, changes));
}

async function listMyConnectionRequests(memberKey, offset) {
  const result = await db.collection('connectionRequests').where({ memberKey }).orderBy('updatedAt', 'desc').skip(offset).limit(20).get();
  return result.data.map(visibleMyConnectionRequest);
}

async function listConnectionRequests(offset) {
  const result = await db.collection('connectionRequests').orderBy('updatedAt', 'desc').skip(offset).limit(20).get();
  return result.data.map(visibleAdminConnectionRequest);
}

async function reviewConnectionRequest(event) {
  const id = validConnectionId(event.id);
  if (!['reviewing', 'closed'].includes(event.status)) fail('INVALID_ARGUMENT', '连接申请状态无效');
  const note = textField(event.operatorNote, '运营备注', 500, false);
  const existing = await findConnectionRequest(id);
  if (!existing) fail('NOT_FOUND', '连接申请不存在');
  const changes = { status: event.status, operatorNote: note, updatedAt: Date.now() };
  await db.collection('connectionRequests').where({ _id: id }).update({ data: changes });
  return visibleAdminConnectionRequest(Object.assign({}, existing, changes));
}

function visibleRegistration(item) {
  return { id: item._id, activityId: item.activityId, activityTitle: item.activityTitle, activityStartAt: item.activityStartAt,
    location: item.location, status: item.status, createdAt: item.createdAt };
}

async function registerActivity(event, actor, member) {
  const activityId = validId(event.id);
  const id = registrationId(activityId, actor);
  return db.runTransaction(async transaction => {
    const activityRow = await transaction.collection('activities').where({ _id: activityId }).limit(1).get();
    const activity = activityRow.data[0];
    if (!activity || activity.status !== 'published') fail('NOT_FOUND', '活动不存在或尚未发布');
    if (activity.priceFen !== 0) fail('INVALID_ARGUMENT', '首发阶段仅支持免费活动报名');
    if (activity.deadlineAt <= Date.now()) fail('INVALID_ARGUMENT', '报名已截止');
    const existingRow = await transaction.collection('registrations').where({ _id: id }).limit(1).get();
    const existing = existingRow.data[0];
    if (existing) return visibleRegistration(existing);
    const count = Number.isSafeInteger(activity.registrationCount) && activity.registrationCount >= 0 ? activity.registrationCount : 0;
    const status = count < activity.capacity ? 'confirmed' : 'waitlist';
    const record = {
      _id: id, activityId, memberKey: actor, status, createdAt: Date.now(),
      activityTitle: activity.title, activityStartAt: activity.startAt, location: activity.location,
      displayName: member.profile && member.profile.displayName || '未填写称呼',
      organization: member.profile && member.profile.organization || '',
      specialty: member.profile && member.profile.specialty || ''
    };
    await transaction.collection('registrations').add({ data: record });
    if (status === 'confirmed') {
      await transaction.collection('activities').where({ _id: activityId }).update({ data: { registrationCount: count + 1, updatedAt: Date.now() } });
    }
    return visibleRegistration(record);
  });
}

async function findRegistration(activityId, memberKey) {
  const result = await db.collection('registrations').where({ _id: registrationId(activityId, memberKey) }).limit(1).get();
  return result.data[0] || null;
}

async function listMyRegistrations(memberKey, offset) {
  const result = await db.collection('registrations').where({ memberKey }).orderBy('createdAt', 'desc').skip(offset).limit(20).get();
  return result.data.map(visibleRegistration);
}

async function listActivityRegistrations(activityId, offset) {
  const result = await db.collection('registrations').where({ activityId }).orderBy('createdAt', 'asc').skip(offset).limit(20).get();
  return result.data.map(item => ({
    id: item._id, status: item.status, createdAt: item.createdAt,
    displayName: item.displayName || '未填写称呼', organization: item.organization || '', specialty: item.specialty || ''
  }));
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

async function saveProfile(memberKey, existing, profile, consents) {
  const now = Date.now();
  const changes = {
    profile,
    consent: Object.assign({ version: 'v0.1' }, consents),
    profileUpdatedAt: now
  };
  if (existing) {
    if (existing.active !== true) fail('FORBIDDEN', '当前账号不可注册，请联系运营者');
    await db.collection('members').where({ _id: memberKey }).update({ data: changes });
    return Object.assign({}, existing, changes);
  }
  const record = Object.assign({}, changes, {
    _id: memberKey, role: 'member', active: true, registeredAt: now
  });
  try {
    await db.collection('members').add({ data: record });
    return record;
  } catch (error) {
    const found = await db.collection('members').where({ _id: memberKey }).limit(1).get();
    const latest = found.data[0];
    if (!latest) throw error;
    if (latest.active !== true) fail('FORBIDDEN', '当前账号不可注册，请联系运营者');
    await db.collection('members').where({ _id: memberKey }).update({ data: changes });
    return Object.assign({}, latest, changes);
  }
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
      createdAt: Date.now(), updatedAt: Date.now(), registrationCount: 0
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
      identity: [], completeOnboarding: ['profile', 'consents'], updateProfile: ['profile', 'consents'],
      listActivities: ['offset', 'category'], getActivity: ['id'],
      registerActivity: ['id'], listMyRegistrations: ['offset'], listActivityRegistrations: ['id', 'offset'],
      createConnectionRequest: ['request'], listMyConnectionRequests: ['offset'],
      listConnectionRequests: ['offset'], reviewConnectionRequest: ['id', 'status', 'operatorNote'],
      listManagedActivities: ['offset'], getManagedActivity: ['id'],
      saveDraft: ['id', 'version', 'activity'], publishActivity: ['id', 'version'],
      listResources: ['offset', 'category'], getResource: ['id'],
      listManagedResources: ['offset'], getManagedResource: ['id'],
      saveResourceDraft: ['id', 'version', 'resource'], publishResource: ['id', 'version']
    };
    if (!Object.prototype.hasOwnProperty.call(allowed, action)) fail('INVALID_ARGUMENT', '不支持的操作');
    // 小程序云函数可能在 event 顶层注入身份元数据。它们只为兼容平台而放行，
    // 身份与角色始终只取 getWXContext() 和 members，绝不读取这些前端可伪造字段。
    fieldsOnly(event, [
      'action', 'userInfo', 'OPENID', 'APPID', 'UNIONID',
      // CloudBase / 微信在不同运行时或触发方式下可能附带的只读上下文。
      // 它们从不参与身份、角色或任何业务字段判断。
      'FROM_OPENID', 'FROM_APPID', 'FROM_UNIONID', 'ENV', 'CLIENTIP', 'TENCENTCLOUD_REGION', 'tcbcontext'
    ].concat(allowed[action]));
    if (action === 'identity') return { ok: true, data: {
      memberKey,
      role: active ? member.role : 'visitor',
      canBrowse: active,
      hasProfile: !!safeProfile(member),
      profile: safeProfile(member),
      opportunityOptIn: !!(member && member.consent && member.consent.opportunityOptIn)
    } };
    if (action === 'completeOnboarding' || action === 'updateProfile') {
      if (action === 'updateProfile') requireMember(member);
      const profile = profileInput(event.profile);
      const consents = consentInput(event.consents);
      const saved = await saveProfile(memberKey, member, profile, consents);
      return { ok: true, data: {
        memberKey,
        role: saved.role,
        canBrowse: saved.active === true,
        hasProfile: true,
        profile: safeProfile(saved),
        opportunityOptIn: saved.consent.opportunityOptIn
      } };
    }
    requireMember(member);
    if (['listManagedActivities', 'getManagedActivity', 'saveDraft', 'publishActivity', 'listActivityRegistrations',
      'listConnectionRequests', 'reviewConnectionRequest', 'listManagedResources', 'getManagedResource',
      'saveResourceDraft', 'publishResource'].includes(action)) requireAdmin(member);
    let data;
    if (action === 'saveDraft') data = await saveDraft(event, memberKey);
    else if (action === 'publishActivity') data = await publishActivity(event);
    else if (action === 'saveResourceDraft') data = await saveResourceDraft(event, memberKey);
    else if (action === 'publishResource') data = await publishResource(event);
    else if (action === 'registerActivity') data = await registerActivity(event, memberKey, member);
    else if (action === 'createConnectionRequest') data = await saveConnectionRequest(memberKey, member, connectionRequestInput(event.request));
    else if (action === 'reviewConnectionRequest') data = await reviewConnectionRequest(event);
    else if (['listMyRegistrations', 'listActivityRegistrations', 'listMyConnectionRequests', 'listConnectionRequests'].includes(action)) {
      const offset = event.offset === undefined ? 0 : event.offset;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) fail('INVALID_ARGUMENT', '分页参数无效');
      if (action === 'listMyRegistrations') data = await listMyRegistrations(memberKey, offset);
      else if (action === 'listActivityRegistrations') data = await listActivityRegistrations(validId(event.id), offset);
      else if (action === 'listMyConnectionRequests') data = await listMyConnectionRequests(memberKey, offset);
      else data = await listConnectionRequests(offset);
    }
    else if (action === 'getActivity' || action === 'getManagedActivity') {
      const item = await findActivity(validId(event.id));
      data = item && (action === 'getManagedActivity' || item.status === 'published') ? visibleActivity(item) : null;
      if (data && action === 'getActivity') {
        const registration = await findRegistration(item._id, memberKey);
        data.myRegistration = registration ? visibleRegistration(registration) : null;
      }
    } else if (action === 'getResource' || action === 'getManagedResource') {
      const item = await findResource(validResourceId(event.id));
      data = item && (action === 'getManagedResource' || item.status === 'published') ? visibleResource(item) : null;
    } else {
      const offset = event.offset === undefined ? 0 : event.offset;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) fail('INVALID_ARGUMENT', '分页参数无效');
      if (action === 'listActivities') {
        const query = { status: 'published' };
        if (event.category !== undefined) {
          if (!ACTIVITY_CATEGORIES.includes(event.category)) fail('INVALID_ARGUMENT', '活动分类无效');
          query.category = event.category;
        }
        const result = await db.collection('activities').where(query).orderBy('createdAt', 'desc').orderBy('_id', 'desc').skip(offset).limit(20).get();
        data = result.data.map(visibleActivity);
      } else if (action === 'listResources') {
        const query = { status: 'published' };
        if (event.category !== undefined) {
          if (!RESOURCE_CATEGORIES.includes(event.category)) fail('INVALID_ARGUMENT', '资源分类无效');
          query.category = event.category;
        }
        const result = await db.collection('resources').where(query).orderBy('createdAt', 'desc').orderBy('_id', 'desc').skip(offset).limit(20).get();
        data = result.data.map(visibleResource);
      } else {
        const result = await db.collection(action === 'listManagedResources' ? 'resources' : 'activities').where({}).orderBy('createdAt', 'desc').orderBy('_id', 'desc').skip(offset).limit(20).get();
        data = result.data.map(action === 'listManagedResources' ? visibleResource : visibleActivity);
      }
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, code: error.businessCode || 'BACKEND_ERROR', message: error.businessCode ? error.message : '服务暂不可用，请重试；若持续失败请联系运营者检查云环境' };
  }
};
