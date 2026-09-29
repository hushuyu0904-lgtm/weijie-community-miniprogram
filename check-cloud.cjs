// 无网络的真实处理函数测试：数据库与微信可信上下文由测试替身提供。
// 不验证已部署的云函数、微信身份透传或实际数据库安全规则。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/^\uFEFF/, '');
const copy = value => JSON.parse(JSON.stringify(value));
const APPID = 'wx-test-only';
const memberKey = openid => crypto.createHash('sha256').update(APPID + ':' + openid).digest('hex');
const records = { members: new Map(), activities: new Map(), registrations: new Map(), connectionRequests: new Map(), resources: new Map() };
const context = { APPID, OPENID: 'admin' };
const env = { WECHAT_APPID: APPID };
let databaseFailure = false;
const db = {
  async runTransaction(work) { return work(this); },
  collection(name) {
    const table = records[name];
    assert(table, 'unexpected collection');
    let filter = {}, offset = 0, limit = 20;
    const sorts = [];
    const matching = () => [...table.values()].filter(item => Object.entries(filter).every(([key, value]) => item[key] === value));
    return {
      where(value) { filter = value; return this; },
      limit(value) { limit = value; return this; },
      skip(value) { offset = value; return this; },
      orderBy(key, direction) { sorts.push([key, direction]); return this; },
      async get() {
        if (databaseFailure) throw Error('secret database diagnostic');
        const values = matching().sort((a, b) => {
          for (const [key, direction] of sorts) {
            const result = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
            if (result) return direction === 'desc' ? -result : result;
          }
          return 0;
        });
        return { data: copy(values.slice(offset, offset + limit)) };
      },
      async add({ data }) {
        if (table.has(data._id)) throw Error('duplicate ID');
        table.set(data._id, copy(data));
        return { _id: data._id };
      },
      async update({ data }) {
        const values = matching();
        for (const value of values) table.set(value._id, Object.assign({}, value, copy(data)));
        return { stats: { updated: values.length } };
      }
    };
  }
};
const cloud = { init() {}, database: () => db, getWXContext: () => context, DYNAMIC_CURRENT_ENV: 'test' };
const backend = { exports: {} };
vm.runInNewContext(read('cloudfunctions/community/index.js'), {
  module: backend, exports: backend.exports, require: name => name === 'wx-server-sdk' ? cloud : require(name), process: { env }, Date, console
});
const run = event => backend.exports.main(event);
const call = (action, extra = {}) => run(Object.assign({ action }, extra));
const actAs = name => { context.OPENID = name; context.APPID = APPID; };
function register(name, role, active = true) { records.members.set(memberKey(name), { _id: memberKey(name), role, active }); }
function activity() {
  return { title: '测试活动', description: '测试说明', location: '线上', category: 'coffee', priceFen: 0, capacity: 30,
    startAt: Date.now() + 7200000, endAt: Date.now() + 10800000, deadlineAt: Date.now() + 3600000, refundPolicy: '待确认' };
}
function profile() {
  return { displayName: '小余', stage: 'student', organization: '复旦大学', specialty: '临床医学', city: '上海',
    directions: ['medical-ai', 'pharma'], currentNeeds: ['explore'], experience: '', shareExperience: false, avatarFileId: '' };
}
function consents(opportunityOptIn = false) { return { privacyAccepted: true, opportunityOptIn }; }
function connectionRequest() {
  return { intent: 'seek', directions: ['medical-ai'], introduction: '临床医学在读，正在探索医疗 AI。', question: '希望了解从医学进入医疗 AI 的第一份实习如何准备。', availability: '工作日晚上' };
}
const draft = (id, input = activity(), version = 0) => call('saveDraft', { id, version, activity: input });
let count = 0;
async function check(name, fn) { await fn(); count++; console.log('PASS ' + name); }
function ok(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; }
function denied(result, code) { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.code, code); }

async function main() {
  register('admin', 'admin'); register('member', 'member'); register('disabled', 'admin', false);
  await check('identity uses trusted context only; user input cannot grant administrator role', async () => {
    actAs('visitor');
    const who = ok(await call('identity'));
    assert.equal(who.memberKey, memberKey('visitor')); assert.equal(who.role, 'visitor'); assert.equal(who.canBrowse, false);
    assert.equal(records.members.size, 3);
    assert.equal(ok(await run({ action: 'identity', OPENID: 'admin', role: 'admin' })).role, 'visitor');
    assert.equal(ok(await run({ action: 'identity', OPENID: 'admin', APPID: 'other-app', UNIONID: 'fake-union' })).role, 'visitor');
    assert.equal(ok(await run({ action: 'identity', userInfo: { openId: 'admin', role: 'admin' } })).role, 'visitor');
    assert.equal(ok(await run({ action: 'identity', tcbcontext: { OPENID: 'admin', role: 'admin' } })).role, 'visitor');
    denied(await call('registerAdmin'), 'INVALID_ARGUMENT');
    delete context.OPENID;
    denied(await run({ action: 'identity', userInfo: { openId: 'admin' } }), 'UNAUTHENTICATED');
    actAs('admin'); context.APPID = 'other-app'; denied(await call('identity'), 'UNAUTHENTICATED');
    actAs('admin'); delete env.WECHAT_APPID; denied(await call('identity'), 'NOT_CONFIGURED'); env.WECHAT_APPID = APPID;
  });
  await check('new users can complete a bounded profile but cannot self-grant admin or reactivate an account', async () => {
    actAs('newcomer');
    const before = records.members.size;
    const saved = ok(await call('completeOnboarding', { profile: profile(), consents: consents(true) }));
    assert.equal(saved.role, 'member'); assert.equal(saved.canBrowse, true); assert.equal(saved.opportunityOptIn, true);
    assert.deepEqual(saved.profile.directions, ['medical-ai', 'pharma']);
    assert.equal(records.members.size, before + 1);
    const record = records.members.get(memberKey('newcomer'));
    assert.equal(record.role, 'member'); assert.equal(record.active, true); assert.equal(record.consent.privacyAccepted, true);
    denied(await call('completeOnboarding', { profile: Object.assign(profile(), { role: 'admin' }), consents: consents() }), 'INVALID_ARGUMENT');
    denied(await call('updateProfile', { profile: Object.assign(profile(), { directions: [] }), consents: consents() }), 'INVALID_ARGUMENT');
    denied(await call('updateProfile', { profile: Object.assign(profile(), { directions: ['medical-ai', 'medical-ai'] }), consents: consents() }), 'INVALID_ARGUMENT');
    denied(await call('updateProfile', { profile: Object.assign(profile(), { currentNeeds: [] }), consents: consents() }), 'INVALID_ARGUMENT');
    denied(await call('updateProfile', { profile: Object.assign(profile(), { currentNeeds: ['explore', 'explore'] }), consents: consents() }), 'INVALID_ARGUMENT');
    const lowercaseNeeds = profile(); lowercaseNeeds.currentneeds = lowercaseNeeds.currentNeeds; delete lowercaseNeeds.currentNeeds;
    assert.deepEqual(ok(await call('updateProfile', { profile: lowercaseNeeds, consents: consents() })).profile.currentNeeds, ['explore']);
    denied(await call('updateProfile', { profile: profile(), consents: { privacyAccepted: false, opportunityOptIn: true } }), 'INVALID_ARGUMENT');
    register('blocked', 'member', false); actAs('blocked');
    denied(await call('completeOnboarding', { profile: profile(), consents: consents() }), 'FORBIDDEN');
    actAs('newcomer');
    const updated = ok(await call('updateProfile', { profile: Object.assign(profile(), { city: '杭州', shareExperience: true }), consents: consents(false) }));
    assert.equal(updated.profile.city, '杭州'); assert.equal(updated.profile.shareExperience, true); assert.equal(updated.opportunityOptIn, false);
    const avatar = 'cloud://test-env.avatars/avatar.jpg';
    assert.equal(ok(await call('updateProfile', { profile: Object.assign(profile(), { avatarFileId: avatar }), consents: consents(false) })).profile.avatarFileId, avatar);
    denied(await call('updateProfile', { profile: Object.assign(profile(), { avatarFileId: 'https://bad.example/avatar.jpg' }), consents: consents(false) }), 'INVALID_ARGUMENT');
  });
  await check('nonmembers and disabled accounts cannot browse; members cannot call management directly', async () => {
    for (const user of ['visitor', 'disabled']) {
      actAs(user);
      denied(await call('listActivities'), 'FORBIDDEN');
      denied(await call('getActivity', { id: 'a-test-draft-001' }), 'FORBIDDEN');
      denied(await draft('a-test-draft-001'), 'FORBIDDEN');
    }
    actAs('member');
    for (const action of ['listManagedActivities', 'getManagedActivity', 'saveDraft', 'publishActivity', 'listActivityRegistrations', 'listManagedResources', 'getManagedResource', 'saveResourceDraft', 'publishResource']) {
      const payload = action === 'saveDraft' ? { id: 'a-test-draft-001', version: 0, activity: activity() } :
        action === 'publishActivity' ? { id: 'a-test-draft-001', version: 1 } :
        action === 'getManagedActivity' ? { id: 'a-test-draft-001' } :
        action === 'saveResourceDraft' ? { id: 's-test-resource-001', version: 0, resource: resource() } :
        action === 'publishResource' ? { id: 's-test-resource-001', version: 1 } :
        action === 'getManagedResource' ? { id: 's-test-resource-001' } :
        action === 'listActivityRegistrations' ? { id: 'a-test-draft-001', offset: 0 } : {};
      denied(await call(action, payload), 'FORBIDDEN');
    }
    denied(await call('listManagedActivities', { userInfo: { role: 'admin', openId: 'admin' } }), 'FORBIDDEN');
    assert.equal(records.activities.size, 0);
  });
  await check('server rejects invalid fields, amounts, capacities and time boundaries without writes', async () => {
    actAs('admin');
    const invalid = [
      ...[-1, 0.5, '4900', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(priceFen => ({ priceFen })),
      ...[0, -1, 0.5, '30', null, Infinity].map(capacity => ({ capacity })),
      { title: '' }, { title: 'x'.repeat(121) }, { title: {} }, { location: ' ' }, { description: '' }, { refundPolicy: '' },
      { startAt: 'tomorrow' }, { startAt: 8.65e15 }, { endAt: 1 }, { deadlineAt: 0 }, { deadlineAt: Date.now() + 20000000 },
      { role: 'admin' }, { status: 'published' }, { createdBy: 'attacker' }, { _id: 'other' }
    ];
    for (const changes of invalid) denied(await draft('a-test-invalid-001', Object.assign(activity(), changes)), 'INVALID_ARGUMENT');
    denied(await draft('../bad'), 'INVALID_ARGUMENT');
    denied(await draft('a-test-invalid-001', activity(), -1), 'INVALID_ARGUMENT');
    denied(await draft('a-test-invalid-001', null), 'INVALID_ARGUMENT');
    assert.equal(records.activities.size, 0);
  });
  await check('admin saves draft, member cannot read draft, publish becomes readable', async () => {
    actAs('admin');
    const input = activity();
    const saved = ok(await draft('a-test-draft-001', input));
    assert.equal(saved.status, 'draft'); assert.equal(saved.version, 1);
    ok(await draft('a-test-draft-001', input)); assert.equal(records.activities.size, 1);
    actAs('member');
    assert.equal(ok(await call('listActivities')).length, 0);
    assert.equal(ok(await call('getActivity', { id: saved.id })), null);
    actAs('admin');
    assert.equal(ok(await call('getManagedActivity', { id: saved.id })).status, 'draft');
    const published = ok(await call('publishActivity', { id: saved.id, version: 1 }));
    assert.equal(published.status, 'published'); assert.equal(published.version, 2);
    assert.equal(ok(await call('publishActivity', { id: saved.id, version: 1 })).version, 2);
    denied(await draft(saved.id, input, 2), 'CONFLICT');
    actAs('member');
    const list = ok(await call('listActivities'));
    assert.equal(list.length, 1); assert.equal(list[0].id, saved.id);
    const detail = ok(await call('getActivity', { id: saved.id }));
    assert.equal(detail.title, input.title); assert(!('createdBy' in detail)); assert(!('_id' in detail));
    assert.equal(ok(await call('getActivity', { id: 'a-test-missing-001' })), null);
  });
  await check('free activity registration is one-per-user, capacity-safe and waitlists later users', async () => {
    actAs('admin');
    const input = Object.assign(activity(), { title: '报名验收活动', capacity: 1 });
    ok(await draft('a-test-registration-001', input));
    ok(await call('publishActivity', { id: 'a-test-registration-001', version: 1 }));
    actAs('member');
    const first = ok(await call('registerActivity', { id: 'a-test-registration-001' }));
    assert.equal(first.status, 'confirmed');
    const repeated = ok(await call('registerActivity', { id: 'a-test-registration-001' }));
    assert.equal(repeated.id, first.id); assert.equal(records.registrations.size, 1);
    assert.equal(records.activities.get('a-test-registration-001').registrationCount, 1);
    const detail = ok(await call('getActivity', { id: 'a-test-registration-001' }));
    assert.equal(detail.myRegistration.status, 'confirmed');
    assert.equal(ok(await call('listMyRegistrations', { offset: 0 }))[0].status, 'confirmed');
    actAs('newcomer');
    const waitlisted = ok(await call('registerActivity', { id: 'a-test-registration-001' }));
    assert.equal(waitlisted.status, 'waitlist');
    assert.equal(records.activities.get('a-test-registration-001').registrationCount, 1);
    actAs('admin');
    const roster = ok(await call('listActivityRegistrations', { id: 'a-test-registration-001', offset: 0 }));
    assert.equal(roster.length, 2); assert.deepEqual(roster.map(row => row.status), ['confirmed', 'waitlist']);
    assert(roster.some(row => row.displayName === '小余'));
    actAs('visitor'); denied(await call('registerActivity', { id: 'a-test-registration-001' }), 'FORBIDDEN');
  });
  await check('connection requests are private, reviewable by admins and never create a direct match', async () => {
    actAs('member');
    const created = ok(await call('createConnectionRequest', { request: connectionRequest() }));
    assert.equal(created.status, 'submitted'); assert.equal(created.operatorNote, '');
    assert.equal(records.connectionRequests.size, 1);
    const edited = ok(await call('createConnectionRequest', { request: Object.assign(connectionRequest(), { question: '想先了解岗位和实习准备。' }) }));
    assert.equal(edited.id, created.id); assert.equal(records.connectionRequests.size, 1);
    assert.equal(ok(await call('listMyConnectionRequests', { offset: 0 }))[0].id, created.id);
    denied(await call('listConnectionRequests', { offset: 0 }), 'FORBIDDEN');
    denied(await call('createConnectionRequest', { request: Object.assign(connectionRequest(), { phone: '13800000000' }) }), 'INVALID_ARGUMENT');
    actAs('admin');
    const adminList = ok(await call('listConnectionRequests', { offset: 0 }));
    assert.equal(adminList[0].id, created.id); assert.equal(adminList[0].profileSummary.displayName, '未填写称呼');
    const reviewed = ok(await call('reviewConnectionRequest', { id: created.id, status: 'reviewing', operatorNote: '将在下一批 Coffee Chat 前联系。' }));
    assert.equal(reviewed.status, 'reviewing');
    denied(await call('reviewConnectionRequest', { id: created.id, status: 'matched', operatorNote: '' }), 'INVALID_ARGUMENT');
    actAs('member');
    assert.equal(ok(await call('listMyConnectionRequests', { offset: 0 }))[0].operatorNote, '将在下一批 Coffee Chat 前联系。');
    actAs('visitor'); denied(await call('createConnectionRequest', { request: connectionRequest() }), 'FORBIDDEN');
  });
  await check('admin publishes resources by category and members only read published resources', async () => {
    actAs('admin');
    const input = resource();
    const saved = ok(await call('saveResourceDraft', { id: 's-test-resource-001', version: 0, resource: input }));
    assert.equal(saved.status, 'draft');
    actAs('member');
    assert.equal(ok(await call('listResources', { offset: 0, category: 'knowledge' })).length, 0);
    assert.equal(ok(await call('getResource', { id: saved.id })), null);
    actAs('admin');
    ok(await call('publishResource', { id: saved.id, version: 1 }));
    actAs('member');
    const list = ok(await call('listResources', { offset: 0, category: 'knowledge' }));
    assert.equal(list.length, 1); assert.equal(list[0].title, input.title); assert(!('createdBy' in list[0]));
    denied(await call('listResources', { offset: 0, category: 'bad' }), 'INVALID_ARGUMENT');
    actAs('admin');
    denied(await call('saveResourceDraft', { id: 's-test-resource-002', version: 0, resource: Object.assign(resource(), { sourceUrl: 'http://bad.example' }) }), 'INVALID_ARGUMENT');
    const illustrated = Object.assign(resource(), { content: '', coverFileId: 'cloud://test-env.resources/cover.jpg', blocks: [{ type: 'heading', text: '从临床到医疗 AI' }, { type: 'paragraph', text: '这是未界原创长文的第一段。' }, { type: 'quote', text: '先从真实问题开始。' }, { type: 'image', fileId: 'cloud://test-env.resources/body.jpg' }] });
    const illustratedSaved = ok(await call('saveResourceDraft', { id: 's-test-resource-004', version: 0, resource: illustrated }));
    assert.equal(illustratedSaved.blocks.length, 4); assert.equal(illustratedSaved.coverFileId, illustrated.coverFileId);
    ok(await call('publishResource', { id: illustratedSaved.id, version: 1 }));
    const illustratedRead = ok(await call('getResource', { id: illustratedSaved.id }));
    assert.equal(illustratedRead.blocks[3].fileId, illustrated.blocks[3].fileId);
    denied(await call('saveResourceDraft', { id: 's-test-resource-005', version: 0, resource: Object.assign(resource(), { blocks: [{ type: 'image', fileId: 'https://not-cloud.example/a.jpg' }] }) }), 'INVALID_ARGUMENT');
    denied(await call('saveResourceDraft', { id: 's-test-resource-006', version: 0, resource: Object.assign(resource(), { blocks: [{ type: 'script', text: 'bad' }] }) }), 'INVALID_ARGUMENT');
    ok(await call('saveResourceDraft', { id: 's-test-resource-003', version: 0, resource: Object.assign(resource(), { content: '', sourceUrl: '' }) }));
    denied(await call('publishResource', { id: 's-test-resource-003', version: 1 }), 'INVALID_ARGUMENT');
  });
  await check('stale edit conflict, expired publication rejection and concurrent edits', async () => {
    actAs('admin');
    const input = activity();
    ok(await draft('a-test-conflict-001', input));
    ok(await draft('a-test-conflict-001', Object.assign({}, input, { title: '修改一' }), 1));
    denied(await draft('a-test-conflict-001', Object.assign({}, input, { title: '旧版本' }), 1), 'CONFLICT');
    const results = await Promise.all([
      draft('a-test-conflict-001', Object.assign({}, input, { title: '并发一' }), 2),
      draft('a-test-conflict-001', Object.assign({}, input, { title: '并发二' }), 2)
    ]);
    assert.equal(results.filter(result => result.ok).length, 1);
    const old = Object.assign(activity(), { deadlineAt: Date.now() - 1000 });
    ok(await draft('a-test-expired-001', old));
    denied(await call('publishActivity', { id: 'a-test-expired-001', version: 1 }), 'INVALID_ARGUMENT');
    const paid = Object.assign(activity(), { priceFen: 100 });
    ok(await draft('a-test-paid-001', paid));
    denied(await call('publishActivity', { id: 'a-test-paid-001', version: 1 }), 'INVALID_ARGUMENT');
  });
  await check('role revocation checked on each call; DB failures deny instead of exposing data', async () => {
    actAs('admin'); register('admin', 'member');
    denied(await call('listManagedActivities'), 'FORBIDDEN');
    register('admin', 'admin');
    actAs('member'); register('member', 'member', false);
    denied(await call('listActivities'), 'FORBIDDEN'); register('member', 'member');
    databaseFailure = true;
    const result = await call('listActivities');
    denied(result, 'BACKEND_ERROR'); assert(!result.message.includes('secret'));
    databaseFailure = false;
  });
  await check('pagination validates input and lists only published data', async () => {
    actAs('member');
    denied(await call('listActivities', { offset: -1 }), 'INVALID_ARGUMENT');
    denied(await call('listActivities', { offset: 0.5 }), 'INVALID_ARGUMENT');
    for (let n = 0; n < 22; n++) records.activities.set('a-page-test-' + n, Object.assign(activity(), { _id: 'a-page-test-' + n, status: 'published', version: 2, createdAt: n }));
    const first = ok(await call('listActivities', { offset: 0 }));
    const second = ok(await call('listActivities', { offset: 20 }));
    assert.equal(first.length, 20); assert.equal(second.length, 4);
    assert.equal(new Set(first.concat(second).map(item => item.id)).size, 24);
    assert(first.concat(second).every(item => item.status === 'published'));
  });
  await check('checked-in rules deny every client read/write; cloud config has no credentials', () => {
    assert.deepEqual(JSON.parse(read('database/deny-client.rules.json')), { read: false, write: false });
    const config = require('./miniprogram/config');
    assert.equal(config.mode, 'cloud'); assert.equal(config.envId, '');
    assert(!/AppSecret|secretKey|secretId/.test(read('miniprogram/config.js')));
    new vm.Script(read('cloudfunctions/community/index.js'));
  });
  await check('cloud caller blocks missing config and demo; errors never fall back to demo', async () => {
    const config = { mode: 'cloud', envId: '' };
    let calls = 0;
    const module = { exports: {} };
    const wx = { cloud: { init() {}, async callFunction() { calls++; return { result: { ok: false, code: 'FORBIDDEN', message: '无权访问' } }; } } };
    vm.runInNewContext(read('miniprogram/services/cloud.js'), { module, require: () => config, wx });
    await assert.rejects(module.exports.call('identity'), /尚未配置/); assert.equal(calls, 0);
    config.mode = 'demo'; await assert.rejects(module.exports.call('identity'), /演示模式/);
    config.mode = 'cloud'; config.envId = 'test-env';
    await assert.rejects(module.exports.call('listActivities'), error => error.code === 'FORBIDDEN');
    const activitiesModule = { exports: {} };
    vm.runInNewContext(read('miniprogram/services/activities.js'), {
      module: activitiesModule, require: name => name === '../config' ? config : name === './cloud' ? module.exports : { listActivities() { throw Error('must not call demo'); } }
    });
    await assert.rejects(activitiesModule.exports.listActivities(), error => error.code === 'FORBIDDEN');
  });
  await check('admin form saves and publishes through actual handler; member list/detail read it', async () => {
    actAs('admin');
    let modalConfirm = false;
    const bridge = { async call(action, payload) {
      const result = await call(action, payload);
      if (!result.ok) throw Object.assign(new Error(result.message), { code: result.code });
      return result.data;
    } };
    function loadPage(name) {
      let definition;
      const wx = { disableAlertBeforeUnload() {}, enableAlertBeforeUnload() {},
        showModal(options) { options.success({ confirm: modalConfirm }); } };
      vm.runInNewContext(read('miniprogram/pages/' + name + '/index.js'), { Page: value => { definition = value; }, require: () => bridge, wx, Date });
      return Object.assign({}, definition, { data: copy(definition.data), setData(value) { Object.assign(this.data, value); } });
    }
    const editor = loadPage('activity-edit');
    await editor.onLoad({}); assert.equal(editor.data.status, 'ready');
    const values = { title: '表单链路活动', description: '本地替身验收', location: '线上', priceYuan: '0', capacity: '25',
      startAt: '2090-12-20 14:00', endAt: '2090-12-20 16:00', deadlineAt: '2090-12-19 18:00', refundPolicy: '待确认' };
    for (const [field, value] of Object.entries(values)) editor.inputField({ currentTarget: { dataset: { field } }, detail: { value } });
    const before = records.activities.size;
    editor.inputField({ currentTarget: { dataset: { field: 'startAt' } }, detail: { value: '2090-02-30 14:00' } });
    await editor.saveDraft(); assert.match(editor.data.error, /有效/); assert.equal(records.activities.size, before);
    editor.inputField({ currentTarget: { dataset: { field: 'startAt' } }, detail: { value: values.startAt } });
    await editor.saveDraft(); assert.equal(editor.data.version, 1); assert.equal(editor.data.dirty, false);
    assert.equal(records.activities.get(editor._id).priceFen, 0);
    editor.publish(); assert.equal(editor.data.busy, false); assert.equal(editor.data.activityStatus, 'draft');
    await editor.publishConfirmed(); assert.equal(editor.data.activityStatus, 'published');
    actAs('member');
    const apiModule = { exports: {} };
    vm.runInNewContext(read('miniprogram/services/activities.js'), {
      module: apiModule, require: name => name === '../config' ? { mode: 'cloud' } : name === './cloud' ? bridge : {}, Date
    });
    const shown = await apiModule.exports.getActivity(editor._id);
    assert.equal(shown.title, values.title); assert.equal(shown.priceText, '免费'); assert.equal(shown.isDemo, false);
    assert.match(shown.timeText, /2090-12-20 14:00/);
    assert((await apiModule.exports.listActivities()).some(item => item.id === editor._id));
    const unauthorizedEditor = loadPage('activity-edit');
    await unauthorizedEditor.onLoad({}); assert.equal(unauthorizedEditor.data.status, 'error');
    assert.match(unauthorizedEditor.data.error, /无管理权限/);
    const manager = loadPage('activity-manage');
    await manager.onShow(); assert.equal(manager.data.status, 'error'); assert.equal(manager.data.items.length, 0);
    const mine = loadPage('mine');
    await mine.onShow(); assert.equal(mine.data.identity.role, 'member');
    mine.onHide(); assert.equal(mine.data.identity, null);
  });
  console.log(count + ' groups passed: local SDK/database substitutes only; deployed identity and database rules NOT verified.');
}
function resource() { return { title: '测试资源', summary: '测试资源简介', category: 'knowledge', content: '测试正文', sourceLabel: '', sourceUrl: '', coverFileId: '', blocks: [] }; }
main().catch(error => { console.error(error); process.exitCode = 1; });
