// 部署前静态自检：不连接 CloudBase，不读取任何本机 AppID/环境 ID。
// 它只防止“代码、规则、schema、部署清单”在协作中悄悄脱节。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/^\uFEFF/, '');
const project = JSON.parse(read('project.config.json'));
const rules = JSON.parse(read('database/deny-client.rules.json'));
const config = read('miniprogram/config.js');
const backend = read('cloudfunctions/community/index.js');
const schema = read('database/schema.md');
const runbook = read('后端部署与验收.md');
const handoff = read('两人协作交接.md');

assert.equal(project.miniprogramRoot, 'miniprogram/');
assert.equal(project.cloudfunctionRoot, 'cloudfunctions/');
assert.deepEqual(rules, { read: false, write: false });
assert.match(config, /mode:\s*'cloud'/);
assert.match(config, /envId:\s*''/);
assert(!/wx[a-z0-9]{16,}/i.test(config), 'config.js must not contain a checked-in AppID');
assert.match(backend, /cloud\.getWXContext\(\)/);
assert.match(backend, /process\.env\.WECHAT_APPID/);
assert(!/callContainer|require\(['\"]https?['\"]\)/.test(backend), 'v0.1 backend must not add an HTTP service dependency');

for (const name of ['members', 'activities', 'registrations', 'connectionRequests', 'resources']) {
  assert.match(schema, new RegExp('## ' + name));
  assert.match(runbook, new RegExp(name));
}
for (const action of ['completeOnboarding', 'registerActivity', 'listActivityRegistrations', 'createConnectionRequest', 'reviewConnectionRequest', 'listResources', 'publishResource']) {
  assert.match(backend, new RegExp(action));
  assert.match(handoff, new RegExp(action));
}
assert.match(schema, /不保存手机号、微信号、简历/);
assert.match(handoff, /不做：支付/);

console.log('PASS deployment contract: roots, zero client DB access, no checked-in environment credentials, schema/runbook/action alignment.');
console.log('Static preflight only: it does NOT prove deployed function permissions, indexes, AppID binding, database rules, or real transaction behavior.');
