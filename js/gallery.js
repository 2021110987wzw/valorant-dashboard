/* ============ gallery.js —— 皮肤图鉴：筛选 / 网格 / 特效预览入口 ============ */
'use strict';

const galleryState = { q: '', weapon: '全部', tier: '全部', theme: '全部' };

function buildThemeOptions() {
  const counts = new Map();
  for (const s of Data.skins) {
    if (!s.theme) continue;
    counts.set(s.theme, (counts.get(s.theme) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => {
      const zh = Data.skins.find((s) => s.theme === t)?.themeZh || t;
      return { t, n, label: `${zh} (${n})` };
    });
}

function renderGallery() {
  const el = document.getElementById('view-gallery');
  const weapons = ['全部', ...new Set(Data.skins.map((s) => s.weapon).filter(Boolean))].sort();
  const themes = buildThemeOptions();
  el.innerHTML = `
  <div class="hero">
    <h1>皮肤<span class="accent">图鉴</span></h1>
    <div class="hero-tags">
      <span class="tag">共 <b>${Data.skins.length}</b> 款皮肤</span>
      <span class="tag">点击卡片查看 <b>特效预览</b>（检视/击杀动画视频）</span>
    </div>
  </div>
  <div class="gallery-toolbar">
    <input type="search" id="g-q" placeholder="搜索皮肤 / 系列 / 武器，如：Reaver、原初、Vandal…" value="${esc(galleryState.q)}">
    <select id="g-weapon">
      ${weapons.map((w) => `<option ${w === galleryState.weapon ? 'selected' : ''}>${esc(w)}</option>`).join('')}
    </select>
    <select id="g-tier">
      ${['全部', '限定', '尊爵', '高级', '奢华', '精选'].map((t) => `<option ${t === galleryState.tier ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <select id="g-theme">
      <option ${galleryState.theme === '全部' ? 'selected' : ''}>全部系列</option>
      ${themes.map((t) => `<option value="${esc(t.t)}" ${t.t === galleryState.theme ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
    </select>
    <span class="g-count" id="g-count"></span>
  </div>
  <div class="skin-grid" id="g-grid"></div>`;

  el.querySelector('#g-q').addEventListener('input', (e) => { galleryState.q = e.target.value; applyFilters(); });
  el.querySelector('#g-weapon').addEventListener('change', (e) => { galleryState.weapon = e.target.value; applyFilters(); });
  el.querySelector('#g-tier').addEventListener('change', (e) => { galleryState.tier = e.target.value; applyFilters(); });
  el.querySelector('#g-theme').addEventListener('change', (e) => { galleryState.theme = e.target.value; applyFilters(); });
  applyFilters();
}

function applyFilters() {
  const { q, weapon, tier, theme } = galleryState;
  const tierZh = { 限定: 'Exclusive', 尊爵: 'Ultra', 高级: 'Premium', 奢华: 'Deluxe', 精选: 'Select' }[tier];
  const query = q.trim().toLowerCase();
  let list = Data.skins.filter((s) => {
    if (weapon !== '全部' && s.weapon !== weapon) return false;
    if (tierZh && s.tier !== tierZh) return false;
    if (theme !== '全部' && s.theme !== theme) return false;
    if (query) {
      const hay = `${s.name} ${s.theme} ${s.themeZh} ${s.weapon} ${s.category}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
  // 品质优先，再按武器、名称
  const tierOrder = { Exclusive: 5, Ultra: 4, Premium: 3, Deluxe: 2, Select: 1 };
  list = list.sort((a, b) =>
    (tierOrder[b.tier] || 0) - (tierOrder[a.tier] || 0) ||
    a.weapon.localeCompare(b.weapon) || a.name.localeCompare(b.name));

  document.getElementById('g-count').textContent = `显示 ${list.length} 款`;
  const grid = document.getElementById('g-grid');
  if (!list.length) {
    grid.innerHTML = `<div class="nm-empty" style="grid-column:1/-1">没有符合筛选条件的皮肤，换个关键词试试～</div>`;
    return;
  }
  grid.innerHTML = list.map((s) => {
    const hasVideo = s.levels.some((l) => l.video) || s.chromas.some((c) => c.video);
    return `
    <div class="skin-card" data-uuid="${esc(s.uuid)}">
      ${hasVideo ? '<span class="video-badge">▶ 特效</span>' : ''}
      <img class="sc-icon" src="${esc(s.icon || phIcon(s.name))}" alt="${esc(s.name)}" data-fbk="${esc(s.name)}" loading="lazy">
      <div class="sc-name">${esc(s.name)}</div>
      <div class="sc-meta">${esc(s.weapon)} · ${esc(s.themeZh)}</div>
      <div class="sc-bottom">${tierBadge(s.tier)}<span class="sc-price">${s.price ? fmtPrice(s.price) + ' VP' : '—'}</span></div>
    </div>`;
  }).join('');
  grid.querySelectorAll('img[data-fbk]').forEach((img) => bindImgFallback(img, img.dataset.fbk));
  grid.querySelectorAll('[data-uuid]').forEach((card) => card.addEventListener('click', () => openSkinModal(card.dataset.uuid)));
}
