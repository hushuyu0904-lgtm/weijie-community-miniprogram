const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const mp = path.join(root, 'miniprogram');
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
// 保留第一阶段演示回归，不把本地数据作为云端权限验证。
const service = require('./miniprogram/services/demo-activities');
let checks = 0;
async function check(name, run) {
  await run();
  checks++;
  console.log('PASS ' + name);
}
function page(name, api = service, depth = 2) {
  let definition;
  const navigation = [];
  vm.runInNewContext(read(path.join(mp, 'pages', name, 'index.js')), {
    require: () => api,
    Page: value => { definition = value; },
    getCurrentPages: () => Array(depth).fill({}),
    wx: Object.fromEntries(['navigateTo', 'navigateBack', 'switchTab', 'showToast'].map(method =>
      [method, options => navigation.push({ method, options })]))
  });
  const instance = Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data || {})),
    setData(update) { Object.assign(this.data, update); }
  });
  return { instance, navigation, definition };
}
async function main() {
  await check('project, JSON, JavaScript syntax, page paths and four tabs', () => {
    const project = json(path.join(root, 'project.config.json'));
    assert.equal(project.miniprogramRoot, 'miniprogram/');
    assert.equal(project.compileType, 'miniprogram');
    const app = json(path.join(mp, 'app.json'));
    assert.deepEqual(app.tabBar.list.map(tab => tab.text), ['活动', '招聘', '交流', '我的']);
    assert.equal(new Set(app.pages).size, app.pages.length);
    for (const tab of app.tabBar.list) assert(app.pages.includes(tab.pagePath));
    for (const route of app.pages) {
      for (const ext of ['js', 'json', 'wxml']) assert(fs.existsSync(path.join(mp, route + '.' + ext)));
      const name = route.split('/')[1];
      const { definition } = page(name);
      const markup = read(path.join(mp, route + '.wxml'));
      for (const match of markup.matchAll(/bindtap="([^"]+)"/g)) assert.equal(typeof definition[match[1]], 'function');
    }
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (file.endsWith('.json')) json(file);
        else if (file.endsWith('.js')) new vm.Script(read(file), { filename: file });
      }
    }
    walk(mp);
  });
  await check('demo data, unique IDs, details, invalid IDs and independent copies', async () => {
    assert.match(service.sourceLabel, /本地演示数据.*未连接真实后端/);
    const items = await service.listActivities();
    assert(items.length > 0);
    assert.equal(new Set(items.map(item => item.id)).size, items.length);
    for (const item of items) {
      assert(Number.isInteger(item.priceFen) && item.priceFen >= 0);
      assert(item.remaining >= 0 && item.remaining <= item.capacity);
      assert.equal((await service.getActivity(item.id)).title, item.title);
    }
    for (const id of [undefined, null, '', '../x', {}, 'missing', 'x'.repeat(65)]) {
      assert.equal(await service.getActivity(id), null);
    }
    items[0].title = 'changed';
    assert.notEqual((await service.listActivities())[0].title, 'changed');
  });
  await check('manual demo empty/error scenarios actually work', async () => {
    const context = vm.createContext({ module: { exports: {} }, require: () => require('./miniprogram/data/demo-activities') });
    vm.runInContext(read(path.join(mp, 'services/demo-activities.js')), context);
    const api = context.module.exports;
    vm.runInContext("DEMO_SCENARIO.list = 'empty'", context);
    assert.equal((await api.listActivities()).length, 0);
    vm.runInContext("DEMO_SCENARIO.list = 'error'; DEMO_SCENARIO.detail = 'error'", context);
    await assert.rejects(api.listActivities());
    await assert.rejects(api.getActivity('demo-medical-ai'));
    vm.runInContext("DEMO_SCENARIO.list = 'normal'; DEMO_SCENARIO.detail = 'normal'", context);
    assert((await api.listActivities()).length);
    assert(await api.getActivity('demo-medical-ai'));
  });
  await check('list loading, ready, empty, failure and successful retry', async () => {
    const api = Object.assign({}, service);
    const { instance: p } = page('activities', api);
    const initial = p.onLoad();
    assert.equal(p.data.status, 'loading');
    await initial;
    assert.equal(p.data.status, 'ready');
    api.listActivities = async () => [];
    await p.loadActivities();
    assert.equal(p.data.status, 'empty');
    api.listActivities = async () => { throw Error('offline'); };
    await p.loadActivities();
    assert.equal(p.data.status, 'error');
    assert.equal(p.data.items.length, 0);
    api.listActivities = service.listActivities;
    await p.loadActivities();
    assert.equal(p.data.status, 'ready');
  });
  await check('list navigation opens matching detail and reports navigation failure', async () => {
    const { instance: p, navigation } = page('activities');
    await p.onLoad();
    p.openActivity({ currentTarget: { dataset: { id: 'invalid' } } });
    assert.equal(navigation.length, 0);
    for (const item of p.data.items) {
      p.openActivity({ currentTarget: { dataset: { id: item.id } } });
      const action = navigation[navigation.length - 1];
      assert.equal(action.method, 'navigateTo');
      const id = decodeURIComponent(action.options.url.split('?id=')[1]);
      const { instance: detail } = page('activity-detail');
      await detail.onLoad({ id });
      assert.equal(detail.data.activity.id, item.id);
    }
    navigation[navigation.length - 1].options.fail();
    assert.equal(navigation[navigation.length - 1].method, 'showToast');
  });
  await check('detail loading, failure, retry and missing links', async () => {
    const api = Object.assign({}, service, { getActivity: async () => { throw Error('offline'); } });
    const { instance: p } = page('activity-detail', api);
    const initial = p.onLoad({ id: 'demo-medical-ai' });
    assert.equal(p.data.status, 'loading');
    await initial;
    assert.equal(p.data.status, 'error');
    api.getActivity = service.getActivity;
    await p.loadActivity();
    assert.equal(p.data.status, 'ready');
    for (const options of [{}, { id: 'unknown' }, { id: '../x' }]) {
      await p.onLoad(options);
      assert.equal(p.data.status, 'missing');
      assert.equal(p.data.activity, null);
    }
  });
  await check('back navigation, direct entry and failed back fallback', () => {
    const normal = page('activity-detail');
    normal.instance.goBack();
    assert.equal(normal.navigation[0].method, 'navigateBack');
    normal.navigation[0].options.fail();
    assert.equal(normal.navigation[1].method, 'switchTab');
    assert.equal(normal.navigation[1].options.url, '/pages/activities/index');
    const direct = page('activity-detail', service, 1);
    direct.instance.goBack();
    assert.equal(direct.navigation[0].method, 'switchTab');
    direct.navigation[0].options.fail();
    assert.equal(direct.navigation[1].method, 'showToast');
  });
  await check('late responses do not overwrite newer state or update unloaded pages', async () => {
    for (const [name, method, reload, options] of [
      ['activities', 'listActivities', 'loadActivities', undefined],
      ['activity-detail', 'getActivity', 'loadActivity', { id: 'demo-medical-ai' }]
    ]) {
      const pending = [];
      const api = Object.assign({}, service, { [method]: () => new Promise(resolve => pending.push(resolve)) });
      const { instance: p } = page(name, api);
      const first = p.onLoad(options);
      const second = p[reload]();
      const value = method === 'listActivities' ? await service.listActivities() : await service.getActivity(options.id);
      pending[1](value);
      await second;
      pending[0](method === 'listActivities' ? [] : null);
      await first;
      assert.equal(p.data.status, 'ready');
      const last = p[reload]();
      p.onUnload();
      pending[2](value);
      await last;
      assert.equal(p.data.status, 'loading');
    }
  });
  await check('closed pages have no simulated actions or identity grant', () => {
    for (const name of ['jobs', 'community']) {
      const markup = read(path.join(mp, 'pages', name, 'index.wxml'));
      assert.match(markup, /尚未开放/);
      assert(!/<button|bindtap=/.test(markup));
      assert.equal(Object.keys(page(name).definition).length, 0);
    }
    assert.match(read(path.join(mp, 'pages/activity-detail/index.wxml')), /报名功能尚未开放/);
  });
  console.log(`${checks} groups passed. Node static and page-logic checks only; not WeChat rendering or device verification.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
