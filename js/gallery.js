/* ============ gallery.js —— 皮肤图鉴：筛选 / 网格 / 特效预览入口 ============ */
'use strict';

const galleryState = { q: '', weapon: '全部', tier: '全部', theme: '全部' };

/** 系列下拉选项（国服名 + 数量） */
function buildThemeOptions() {
  const counts = new Map();
  const zhOf = new Map();
  for (const s of Data.skins) {
    if (!s.theme) continue;
    counts.set(s.theme, (counts.get(s.theme) || 0) + 1);
    if (!zhOf.has(s.theme)) zhOf.set(s.theme, s.themeEn || s.theme);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => ({ t, n, label: `${t}（${n}）`, en: zhOf.get(t) }));
}

/** 武器下拉选项（国服名 + 英文名） */
function buildWeaponOptions() {
  const enOf = new Map();
  for (const s of Data.skins) {
    if (s.weapon && !enOf.has(s.weapon)) enOf.set(s.weapon, s.weaponEn || s.weapon);
  }
  return [...enOf.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([zh, en]) => ({ zh, label: en && en !== zh ? `${zh}（${en}）` : zh }));
}

function renderGallery() {
  const el = document.getElementById('view-gallery');
  const weapons = buildWeaponOptions();
  const themes = buildThemeOptions();
  const tiers = tierList().map(([, v]) => v.zh);
  el.innerHTML = `
  <div class="hero">
    <h1>皮肤<span class="accent">图鉴</span></h1>
    <div class="hero-tags">
      <span class="tag">共 <b>${Data.skins.length}</b> 款皮肤 · 国服官方译名</span>
      <span class="tag">点击卡片查看 <b>特效预览</b>（检视/击杀动画视频）</span>
    </div>
  </div>
  <div class="gallery-toolbar">
    <input type="search" id="g-q" placeholder="搜索皮肤 / 系列 / 武器，中英文均可：狂徒、Reaver、掠夺者…" value="${esc(galleryState.q)}">
    <select id="g-weapon">
      <option value="全部" ${galleryState.weapon === '全部' ? 'selected' : ''}>全部武器</option>
      ${weapons.map((w) => `<option value="${esc(w.zh)}" ${w.zh === galleryState.weapon ? 'selected' : ''}>${esc(w.label)}</option>`).join('')}
    </select>
    <select id="g-tier">
      <option value="全部" ${galleryState.tier === '全部' ? 'selected' : ''}>全部品质</option>
      ${tiers.map((t) => `<option value="${esc(t)}" ${t === galleryState.tier ? 'selected' : ''}>${esc(t)}</option>`).join('')}
    </select>
    <select id="g-theme">
      <option value="全部" ${galleryState.theme === '全部' ? 'selected' : ''}>全部系列</option>
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
  const tierKey = tier === '全部' ? null : tierKeyOfZh(tier);
  const query = q.trim().toLowerCase();
  let list = Data.skins.filter((s) => {
    if (weapon !== '全部' && s.weapon !== weapon) return false;
    if (tierKey && s.tier !== tierKey) return false;
    if (theme !== '全部' && s.theme !== theme) return false;
    if (query) {
      // 中英文名、系列、武器、类别均可搜索
      const hay = [s.name, s.nameEn, s.theme, s.themeEn, s.weapon, s.weaponEn, s.category, s.tierZh]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
  list = list.sort((a, b) =>
    (tierInfo(b.tier).rank - tierInfo(a.tier).rank) ||
    a.weapon.localeCompare(b.weapon, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'));

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
      ${enSub(s.name, s.nameEn, 'en-sub sc-en')}
      <div class="sc-meta">${esc(s.weapon)} · ${esc(s.theme)}</div>
      <div class="sc-bottom">${tierBadge(s.tier)}<span class="sc-price">${cnPrice(s.price)}</span></div>
    </div>`;
  }).join('');
  grid.querySelectorAll('img[data-fbk]').forEach((img) => bindImgFallback(img, img.dataset.fbk));
  grid.querySelectorAll('[data-uuid]').forEach((card) => card.addEventListener('click', () => openSkinModal(card.dataset.uuid)));
}
