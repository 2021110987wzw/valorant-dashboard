// 冒烟测试：用 jsdom 加载真实页面脚本，验证首页/图鉴/夜市模拟/皮肤弹窗
// 依赖 jsdom（仅测试用）: npm install jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  const p = join(os.tmpdir(), 'dsh-jsdom', 'node_modules', 'jsdom', 'lib', 'api.js');
  ({ JSDOM } = await import('file:///' + p.replace(/\\/g, '/')));
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://127.0.0.1:8347/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

window.fetch = async (u) => {
  const pathname = new URL(u, 'http://127.0.0.1:8347/').pathname;
  const body = readFileSync(join(ROOT, pathname.replace(/^[/\\]/, '')), 'utf8');
  return { ok: true, json: async () => JSON.parse(body) };
};
window.scrollTo = () => {};

const errors = [];
window.addEventListener('error', (e) => errors.push('window error: ' + e.message));
window.addEventListener('unhandledrejection', (e) => errors.push('unhandled rejection: ' + e.reason));

const combined = ['shared.js', 'home.js', 'gallery.js', 'app.js']
  .map((f) => readFileSync(join(ROOT, 'js', f), 'utf8'))
  .join('\n;\n');
window.eval(combined);

const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error('断言失败: ' + msg); console.log('  ✓ ' + msg); };

// 等待 app.js init 完成（数据加载 + 首页渲染）
let ok = false;
for (let i = 0; i < 50; i++) {
  await sleep(100);
  if ($('#view-home') && $('#view-home').textContent.includes('夜市活动')) { ok = true; break; }
}
assert(ok, '首页渲染完成');

const liveCards = $$('#live-store .live-card');
console.log('  实时商店卡片数: ' + liveCards.length);
assert(liveCards.length >= 1, '实时商店轮换礼包已渲染');
assert($('#live-store').textContent.includes('轮换中'), '轮换中徽标存在');
assert($('#live-store').textContent.includes('-20%') || $('#live-store').textContent.includes('20%'), '折扣信息存在');

assert($('#nm-section').textContent.includes('夜市'), '夜市区块渲染');
assert($('#nm-section').textContent.includes('资格池'), '夜市规则渲染');

$('#btn-nm-sim').click();
await sleep(50);
const simCards = $$('#nm-sim-box .nm-sim-card');
assert(simCards.length === 6, '模拟夜市生成 6 款皮肤');
console.log('  首张夜市卡内容:', JSON.stringify(simCards[0].textContent.trim().replace(/\s+/g, ' ')));
assert(/-\d+%/.test(simCards[0].textContent), '模拟夜市含折扣徽标');
assert(simCards[0].textContent.includes('VP'), '模拟夜市含折后价');

assert($$('#featured-bundles .bundle-card').length >= 6, '近期礼包精选已渲染');
assert($$('#all-bundles .bundle-row').length > 0, '全部礼包列表已渲染');

// 图鉴
window.location.hash = '#/gallery';
window.dispatchEvent(new window.Event('hashchange'));
await sleep(100);
const gridCards = $$('#g-grid .skin-card');
console.log('  图鉴卡片数: ' + gridCards.length);
assert(gridCards.length > 500, '图鉴默认显示大量皮肤');

const q = $('#g-q');
q.value = 'Reaver';
q.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(30);
const filtered = $$('#g-grid .skin-card');
assert(filtered.length > 0 && filtered.length < 500, `搜索 "Reaver" 得到 ${filtered.length} 款`);
assert($('#g-count').textContent.includes(String(filtered.length)), '筛选计数正确');

// 皮肤详情弹窗（特效预览）
filtered[0].click();
await sleep(50);
assert(!$('#modal-root').hidden, '弹窗打开');
const stage = $('.media-stage');
assert(stage.querySelector('video, img'), '媒体区域有视频或图片');
const levels = $$('#modal-root .level-tab');
assert(levels.length >= 2, `等级标签 ${levels.length} 个`);
let hasVideo = false;
for (const t of levels) {
  t.click(); await sleep(10);
  if ($('.media-stage video')) hasVideo = true;
}
assert(hasVideo || !!$('.media-stage img'), '切换等级后媒体正常展示');
const vfxTags = $$('#modal-root .stage-tag');
assert(vfxTags.length > 0, '特效标签存在');
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await sleep(30);
assert($('#modal-root').hidden, 'ESC 关闭弹窗');

// 首页礼包 chip 点击 → 弹窗
window.location.hash = '#/home';
window.dispatchEvent(new window.Event('hashchange'));
await sleep(50);
$$('#all-bundles .chip[data-uuid]')[0].click();
await sleep(50);
assert(!$('#modal-root').hidden, '礼包皮肤标签可打开详情弹窗');
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

if (errors.length) {
  console.error('页面错误:', errors);
  process.exit(1);
}
console.log('\n全部冒烟测试通过 ✓');
