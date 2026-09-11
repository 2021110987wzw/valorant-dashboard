/* ============ app.js —— 路由 / 初始化 / 刷新 ============ */
'use strict';

let rendered = { home: false, gallery: false };

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const view = hash.startsWith('gallery') ? 'gallery' : 'home';
  document.getElementById('view-home').hidden = view !== 'home';
  document.getElementById('view-gallery').hidden = view !== 'gallery';
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === view);
  });
  if (view === 'home') {
    if (!rendered.home) { renderHome(); rendered.home = true; }
  } else if (!rendered.gallery) {
    renderGallery();
    rendered.gallery = true;
  }
  window.scrollTo({ top: 0 });
}

function renderMeta() {
  const m = Data.meta || {};
  const el = document.getElementById('updated-at');
  el.textContent = m.updatedAt ? `数据更新于 ${fmtDate(m.updatedAt)}` : '数据未加载';
}

async function refresh() {
  const btn = document.getElementById('btn-refresh');
  btn.disabled = true;
  btn.textContent = '刷新中…';
  try {
    await loadData(true);
    rendered = { home: false, gallery: false };
    route();
    renderMeta();
    toast('数据已刷新 ✓（每日自动更新脚本会同步最新商店轮换）');
  } catch (e) {
    toast('刷新失败：' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ 刷新数据';
  }
}

(async function init() {
  try {
    await loadData();
    renderMeta();
    window.addEventListener('hashchange', route);
    document.getElementById('btn-refresh').addEventListener('click', refresh);
    route();
  } catch (e) {
    document.getElementById('view-home').hidden = false;
    document.getElementById('view-home').innerHTML = `
      <div class="live-note" style="margin-top:60px;text-align:center;border:1px dashed var(--border-2);border-radius:12px;padding:30px;">
        <h2 style="margin-bottom:10px">数据加载失败</h2>
        <p>${esc(e.message)}</p>
        <p style="margin-top:8px">请先运行 <code>node scripts/update.mjs</code> 生成数据文件，再刷新页面。</p>
      </div>`;
    document.getElementById('updated-at').textContent = '数据加载失败';
  }
})();
