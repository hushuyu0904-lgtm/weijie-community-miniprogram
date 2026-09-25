const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(__dirname + '/activity-style.html', 'utf8');
const nodes = {};
const context = vm.createContext({ document: {
  getElementById: id => nodes[id] || (nodes[id] = { setAttribute() {} }),
  addEventListener() {}
}, setTimeout, clearTimeout });
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
assert(nodes.events.innerHTML.includes('医学职业探索'));
for (const type of ['outing', 'chat']) {
  vm.runInContext(`chosen='${type}';render()`, context);
  assert(nodes.events.innerHTML.includes('暂无此类活动'));
}
vm.runInContext("chosen='lecture';render()", context);
assert(nodes.events.innerHTML.includes('AI 产品岗位'));
assert(!nodes.events.innerHTML.includes('医学职业探索交流会'));
vm.runInContext("chosen='all';render()", context);
assert.equal((nodes.events.innerHTML.match(/<article/g) || []).length, 2);
console.log('PASS visual sample rendering and category states (DOM substitutes, not browser visual verification).');
