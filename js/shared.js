/* ============ shared.js —— 数据加载 / 工具 / 皮肤详情弹窗 ============ */
'use strict';

const Data = { bundles: [], skins: [], storefront: null, nm: null, meta: null };
const skinById = new Map();

const TIERS = {
  Exclusive: { zh: '限定', color: '#e8a33d' },
  Ultra:     { zh: '尊爵', color: '#ff5b3c' },
  Premium:   { zh: '高级', color: '#d76ab2' },
  Deluxe:    { zh: '奢华', color: '#3ddc84' },
  Select:    { zh: '精选', color: '#4aa0e8' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const fmtPrice = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : '—');
const tierInfo = (t) => TIERS[t] || { zh: '其他', color: '#9aa4b2' };

function tierBadge(t) {
  const info = tierInfo(t);
  return `<span class="tier-badge" style="color:${info.color}">${esc(info.zh)}</span>`;
}
function tierDot(t) {
  return `<span class="tier-dot" style="background:${tierInfo(t).color}" title="${esc(t)}"></span>`;
}

/** 图片加载失败时的占位图 */
function phIcon(text, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="160"><rect width="256" height="160" rx="16" fill="#1b2632"/><text x="50%" y="54%" fill="${color || '#5b6b7c'}" font-size="44" font-family="Arial" font-weight="bold" text-anchor="middle" dominant-baseline="central">${esc(text || '?').slice(0, 8)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function bindImgFallback(img, label) {
  img.addEventListener('error', () => {
    if (img.dataset.fbk) return;
    img.dataset.fbk = '1';
    img.src = phIcon(label, '#66788c');
  });
}

async function loadData(cacheBust) {
  const q = cacheBust ? '?t=' + Date.now() : '';
  const [bundles, skins, storefront, nm, meta] = await Promise.all([
    fetch('data/bundles.json' + q).then((r) => r.json()),
    fetch('data/skins.json' + q).then((r) => r.json()),
    fetch('data/storefront.json' + q).then((r) => r.json()),
    fetch('data/nightmarket.json' + q).then((r) => r.json()),
    fetch('data/meta.json' + q).then((r) => r.json()),
  ]);
  Object.assign(Data, { bundles, skins, storefront, nm, meta });
  skinById.clear();
  for (const s of skins) skinById.set(s.uuid, s);
  return Data;
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg, ms) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms || 3200);
}

/* ---------------- 皮肤详情弹窗 ---------------- */
let modalState = { skin: null, level: 0, chroma: -1 };

function openSkinModal(uuid) {
  const skin = skinById.get(uuid);
  if (!skin) { toast('未找到该皮肤数据'); return; }
  modalState = { skin, level: 0, chroma: -1 };
  renderModal();
  const root = document.getElementById('modal-root');
  root.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSkinModal() {
  const root = document.getElementById('modal-root');
  const v = root.querySelector('video');
  if (v) v.pause();
  root.hidden = true;
  root.innerHTML = '';
  document.body.style.overflow = '';
}

function modalMediaSource() {
  const { skin, level, chroma } = modalState;
  const lv = skin.levels[level];
  if (chroma >= 0 && skin.chromas[chroma]) {
    const c = skin.chromas[chroma];
    return { video: c.video, img: c.render || c.icon || lv?.icon || skin.icon, label: c.name, vfx: !!c.video };
  }
  return { video: lv?.video || null, img: lv?.icon || skin.icon, label: lv?.name || '基础', vfx: !!lv?.video };
}

function renderModalMedia() {
  const stage = document.querySelector('#modal-root .media-stage');
  if (!stage) return;
  const src = modalMediaSource();
  let inner;
  if (src.video) {
    inner = `<video src="${esc(src.video)}" autoplay muted loop playsinline controls></video>`;
  } else {
    inner = `<img src="${esc(src.img || phIcon(src.label))}" alt="${esc(src.label)}">`;
  }
  stage.innerHTML = `<span class="stage-tag ${src.vfx ? 'vfx' : ''}">${src.vfx ? '▶ 特效预览' : '外观预览'} · ${esc(src.label)}</span>${inner}`;
  const img = stage.querySelector('img');
  if (img) bindImgFallback(img, src.label);
}

function renderModal() {
  const root = document.getElementById('modal-root');
  const { skin, level, chroma } = modalState;
  const info = tierInfo(skin.tier);
  const levelsHtml = skin.levels.map((lv, i) =>
    `<button class="level-tab ${i === level ? 'on' : ''}" data-level="${i}" title="${esc(lv.name)}">Lv${i + 1}</button>`
  ).join('');
  const chromasHtml = skin.chromas.map((c, i) => {
    const sw = c.swatch
      ? `<span class="sw" style="background:${esc(c.swatch)}"></span>`
      : `<img src="${esc(c.icon || phIcon(c.name))}" alt="${esc(c.name)}" data-fbk-img="${esc(c.name)}">`;
    return `<button class="chroma-item ${i === chroma ? 'on' : ''}" data-chroma="${i}" title="${esc(c.name)}">${sw}</button>`;
  }).join('');
  root.innerHTML = `
  <div class="modal-backdrop" data-close></div>
  <div class="modal" role="dialog" aria-modal="true">
    <button class="modal-close" data-close aria-label="关闭">✕</button>
    <div class="modal-media">
      <div class="media-stage"></div>
      <div class="level-tabs">${levelsHtml}</div>
    </div>
    <div class="modal-info">
      <h2>${esc(skin.name)}</h2>
      <div class="info-row">${tierBadge(skin.tier)}<span class="val">${esc(skin.weapon)} · ${esc(skin.category)}</span></div>
      <div class="info-row"><span class="lbl">系列</span><span class="val">${esc(skin.themeZh)}${skin.themeZh !== skin.theme ? ` <span class="muted">(${esc(skin.theme)})</span>` : ''}</span></div>
      <div class="info-row"><span class="lbl">价格</span><span class="val" style="color:var(--gold);font-weight:700">${skin.price ? fmtPrice(skin.price) + ' VP' : '—'}</span></div>
      <div class="chroma-block">
        <span class="lbl">配色（${skin.chromas.length} 种）· 点击切换外观与特效</span>
        <div class="chroma-row">${chromasHtml}</div>
      </div>
      <div class="modal-hint">点击级别标签查看该等级特效动画（含击杀特效/检视动画的视频为自动播放）；部分等级仅有外观贴图。</div>
    </div>
  </div>`;

  // 事件绑定
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeSkinModal));
  root.querySelectorAll('[data-level]').forEach((el) => el.addEventListener('click', () => {
    modalState.level = Number(el.dataset.level);
    renderModal();
    renderModalMedia();
  }));
  root.querySelectorAll('[data-chroma]').forEach((el) => el.addEventListener('click', () => {
    modalState.chroma = Number(el.dataset.chroma);
    renderModal();
    renderModalMedia();
  }));
  root.querySelectorAll('[data-fbk-img]').forEach((img) => bindImgFallback(img, img.dataset.fbkImg));
  renderModalMedia();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('modal-root').hidden) closeSkinModal();
});
