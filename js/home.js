/* ============ home.js —— 首页：商店轮换礼包 / 夜市活动 / 精选与全部礼包 ============ */
'use strict';

let nmResult = [];
let allExpanded = false;

function daysUntil(dateStr) {
  const t = new Date(dateStr + 'T00:00:00');
  return Math.max(0, Math.ceil((t - new Date()) / 86400000));
}

/* ---------------- 商店轮换（实时快照） ---------------- */
function renderLiveStore() {
  const sf = Data.storefront;
  if (!sf || !sf.bundles || !sf.bundles.length) {
    return `
    <div class="live-note" style="border:1px dashed var(--border-2);border-radius:10px;padding:16px;">
      实时商店快照暂不可用${sf && sf.error ? `（${esc(sf.error)}）` : ''}。
      下方「近期礼包精选」按已知发布顺序展示轮换候选，运行 <code>scripts/update.mjs</code> 可刷新快照。
    </div>`;
  }
  const cards = sf.bundles.map((b) => {
    const d = b.discountPct || 0;
    const off = (p) => Math.round((p * (100 - d)) / 100 / 5) * 5;
    const total = b.items.reduce((s, it) => s + (it.price || 0), 0);
    const newTotal = off(total);
    let itemsHtml;
    if (b.items.length) {
      itemsHtml = b.items.map((it) => `
        <div class="live-item" data-uuid="${esc(it.uuid)}" title="点击查看特效预览">
          <img src="${esc(it.icon || phIcon(it.name))}" alt="" data-fbk="${esc(it.name)}">
          <div><div class="li-name">${esc(it.name)}</div><div class="li-sub">${esc(it.weapon)} · ${tierInfo(it.tier).zh}</div>${it.nameEn && it.nameEn !== it.name ? `<div class="en-sub">${esc(it.nameEn)}</div>` : ''}</div>
          <div class="li-price">
            ${d ? `<span class="old">${fmtPrice(it.price)}</span><span class="now">${fmtPrice(off(it.price))} 点券</span>`
               : `<span class="now" style="color:var(--text)">${fmtPrice(it.price)} 点券</span>`}
          </div>
        </div>`).join('');
    } else {
      itemsHtml = `<div class="live-acc">${b.accessories.map((a) => `
        <span><img src="${esc(a.icon || phIcon('?'))}" alt="" data-fbk="饰品">${esc({ buddies: '挂件', playercards: '卡面', sprays: '喷漆' }[a.kind] || '饰品')}</span>`).join('')}
      </div>`;
    }
    return `
    <div class="live-card">
      <span class="live-badge"><span class="dot"></span>轮换中</span>
      <h3>${esc(b.name)}</h3>
      <div class="live-sub">当前商店礼包 · 来源 ${esc(sf.source || '快照')} · ${fmtDate(sf.fetchedAt)}</div>
      <div class="live-items">${itemsHtml}</div>
      ${b.items.length ? `
      <div class="live-total">
        ${d ? `<span class="old">${fmtPrice(total)} 点券</span>` : ''}
        <span class="now">${fmtPrice(newTotal)} 点券</span>
        ${d ? `<span class="off">-${d}%</span>` : ''}
      </div>
      ${d ? '' : '<div class="live-note">价格按国服品质档位估算，折扣与最终价格以游戏内为准。</div>'}` : ''}
    </div>`;
  }).join('');
  return `<div class="live-grid">${cards}</div>
  <p class="live-note" style="margin-top:12px">轮换快照由公开页面解析，每日更新脚本自动刷新；若快照过期请运行 <code>scripts/update.mjs</code>。</p>`;
}

/* ---------------- 夜市 ---------------- */
function renderNightMarket() {
  const nm = Data.nm;
  const isActive = !!nm.active;
  const anchor = isActive ? nm.active : nm.next;
  const days = anchor ? (isActive ? daysUntil(anchor.end) : daysUntil(anchor.start)) : 0;
  const timeline = (nm.windows || []).map((w) => `
    <span class="nm-chip ${w.status}">${w.start} ~ ${w.end}${w.status === 'active' ? ' · 进行中' : ''}${w.estimated ? '<span class="est">（推算）</span>' : ''}</span>`).join('');
  const statusHtml = isActive
    ? `<div class="big active">🌙 夜市进行中！</div>
       <div class="desc">本期 ${anchor.start} ~ ${anchor.end}${anchor.estimated ? '（推算）' : ''} · 每人 6 款随机折扣皮肤</div>`
    : anchor
      ? `<div class="big">夜市未开启</div>
         <div class="desc">下次预计 ${anchor.start} ~ ${anchor.end}（按官方历史排期推算）</div>`
      : `<div class="big">夜市未开启</div><div class="desc">暂无排期信息</div>`;
  return `
  <div class="nm-banner">
    <div class="nm-status">
      <span class="nm-icon">🌙</span>
      <div>${statusHtml}</div>
    </div>
    ${anchor ? `
    <div class="nm-countdown">
      <div class="num">${isActive ? days + ' 天' : days + ' 天'}</div>
      <div class="lbl">${isActive ? '距结束' : '距开启'}（估算）</div>
    </div>` : ''}
  </div>
  <div class="nm-timeline">${timeline}</div>
  <div class="nm-panel">
    <div class="nm-rules">
      <b>夜市规则（2026 版）</b><br>
      · 每账号随机 6 款皮肤，折扣 <b>10% ~ 49%</b>，期内不变<br>
      · 品质范围：精选 / 奢华 / 高级 / <b>限定</b>（不含尊爵）<br>
      · 只出现上线满 2 个幕的商店皮肤，不含近战与通行证皮肤<br>
      · 至少 2 款高级及以上品质；同一种武器最多 2 款<br>
      · 当前资格池共 <b style="color:var(--text)">${nm.eligibleCount}</b> 款（按上述规则筛选）
    </div>
    <div class="nm-sim">
      <div class="nm-sim-head">
        <h3>🎲 模拟我的夜市</h3>
        <span class="muted">个人夜市数据不公开，这里按官方规则随机模拟，仅供娱乐参考</span>
        <span class="spacer" style="flex:1"></span>
        <button class="btn-primary" id="btn-nm-sim">${nmResult.length ? '再摇一次' : '开箱夜市'}</button>
      </div>
      <div id="nm-sim-box">${nmResult.length ? renderNmResult() : '<div class="nm-empty">点击「开箱夜市」按官方规则生成 6 款随机折扣皮肤</div>'}</div>
    </div>
  </div>`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function simulateNM() {
  const pool = Data.nm.eligiblePool.slice();
  const high = shuffle(pool.filter((s) => s.tier === 'Premium' || s.tier === 'Exclusive'));
  const rest = shuffle(pool);
  const picked = [];
  const wc = {};
  const canAdd = (s) => (wc[s.weapon] || 0) < 2;
  for (const s of high) {
    if (picked.length >= 2) break;
    if (!picked.includes(s) && canAdd(s)) { picked.push(s); wc[s.weapon] = (wc[s.weapon] || 0) + 1; }
  }
  for (const s of rest) {
    if (picked.length >= 6) break;
    if (!picked.includes(s) && canAdd(s)) { picked.push(s); wc[s.weapon] = (wc[s.weapon] || 0) + 1; }
  }
  nmResult = picked.map((s) => ({ ...s, off: 10 + Math.floor(Math.random() * 40) }));
  const box = document.getElementById('nm-sim-box');
  if (box) box.innerHTML = renderNmResult();
  bindChips(box);
}

function renderNmResult() {
  return `<div class="nm-sim-grid">${nmResult.map((s) => {
    const np = Math.round((s.price * (100 - s.off)) / 100 / 5) * 5;
    return `
    <div class="nm-sim-card" data-uuid="${esc(s.uuid)}">
      <span class="nm-off">-${s.off}%</span>
      <img src="${esc(s.icon || phIcon(s.name))}" alt="" data-fbk="${esc(s.name)}">
      <div class="nm-name">${esc(s.name)}</div>
      <div class="nm-sub">${esc(s.weapon)} · ${tierInfo(s.tier).zh}</div>
      <div><span class="price-old">${fmtPrice(s.price)}</span> <span class="price-new">${fmtPrice(np)} 点券</span></div>
    </div>`;
  }).join('')}</div>`;
}

/* ---------------- 精选礼包 ---------------- */
function renderFeaturedBundles() {
  const featured = Data.bundles.filter((b) => b.featured).slice(0, 12);
  const cards = featured.map(bundleCard).join('');
  return `<div class="bundle-grid">${cards}</div>
  <p class="live-note" style="margin-top:12px">按已知发布顺序排列（新 → 旧）；礼包价按「刀免费」惯例估算，实际以游戏内为准。点击皮肤标签查看特效预览。</p>`;
}

function bundleCard(b) {
  const img = b.promoImage || b.icon;
  return `
  <div class="bundle-card">
    <img class="b-img" src="${esc(img || phIcon(b.name))}" alt="${esc(b.name)}" data-fbk="${esc(b.name)}" loading="lazy">
    <div class="b-body">
      <h3>${esc(b.name)}</h3>
      ${enSub(b.name, b.nameEn, 'en-sub')}
      <div class="b-sub">${b.itemCount} 件皮肤${b.items.some((i) => i.category === '近战') ? ' · 含近战' : ''}</div>
      <div class="bundle-price">
        <span class="now">≈ ${fmtPrice(b.price)} 点券</span>
        <span class="old">单买 ${fmtPrice(b.total)}</span>
        <span class="save">${b.save > 0 ? '省 ' + fmtPrice(b.save) : '同款打包'}</span>
      </div>
      <div class="chips">${b.items.map((it) => `
        <span class="chip" data-uuid="${esc(it.uuid)}" title="${esc(it.name)} · ${fmtPrice(it.price)} 点券">
          ${tierDot(it.tier)}<img src="${esc(it.icon || phIcon(it.weapon))}" alt="" data-fbk="${esc(it.weapon)}">${esc(it.weapon)}
        </span>`).join('')}
      </div>
    </div>
  </div>`;
}

/* ---------------- 全部礼包 ---------------- */
function renderAllBundles() {
  const shown = allExpanded ? Data.bundles : Data.bundles.slice(0, 30);
  const rows = shown.map((b) => `
    <div class="bundle-row">
      <img class="b-icon" src="${esc(b.icon || phIcon(b.name))}" alt="" data-fbk="${esc(b.name)}" loading="lazy">
      <div>
        <div class="br-name">${esc(b.name)}</div>
        ${enSub(b.name, b.nameEn, 'en-sub')}
        <div class="br-meta">${b.itemCount} 件 · ${b.items.map((i) => esc(i.weapon)).slice(0, 6).join(' / ')}${b.itemCount > 6 ? '…' : ''}</div>
      </div>
      <div class="chips">${b.items.slice(0, 5).map((it) => `
        <span class="chip" data-uuid="${esc(it.uuid)}" title="${esc(it.name)} · ${fmtPrice(it.price)} 点券">${tierDot(it.tier)}${esc(it.weapon)}</span>`).join('')}${b.itemCount > 5 ? `<span class="chip" style="cursor:default">+${b.itemCount - 5}</span>` : ''}
      </div>
      <div class="br-price">
        <div class="now">≈ ${fmtPrice(b.price)} 点券</div>
        <div class="save">${b.save > 0 ? '省 ' + fmtPrice(b.save) : '同款打包'}</div>
      </div>
    </div>`).join('');
  return `<div class="bundle-list">${rows}</div>
  ${Data.bundles.length > 30 ? `
  <div class="expander"><button class="show-more" id="btn-more-bundles">${allExpanded ? '收起' : `展开全部 ${Data.bundles.length} 个礼包`}</button></div>` : ''}`;
}

/* ---------------- 绑定事件 ---------------- */
function bindChips(scope) {
  scope.querySelectorAll('[data-uuid]').forEach((el) => el.addEventListener('click', () => {
    const uuid = el.dataset.uuid;
    if (skinById.has(uuid)) openSkinModal(uuid);
    else toast('该物品不在皮肤图鉴目录中');
  }));
  scope.querySelectorAll('img[data-fbk]').forEach((img) => bindImgFallback(img, img.dataset.fbk));
}

/* ---------------- 首页入口 ---------------- */
function renderHome() {
  const el = document.getElementById('view-home');
  const m = Data.meta || {};
  el.innerHTML = `
  <div class="hero">
    <h1>无畏契约 <span class="accent">折扣看板</span></h1>
    <div class="hero-tags">
      <span class="tag">数据更新 <b>${fmtDate(m.updatedAt)}</b></span>
      <span class="tag">游戏版本 <b>${esc(m.gameVersion || '—')}</b></span>
      <span class="tag">图鉴 <b>${Data.skins.length}</b> 款皮肤</span>
      <span class="tag">礼包 <b>${Data.bundles.length}</b> 个</span>
      <span class="tag">国服译名 · 点券价</span>
      <span class="tag">每日自动更新 ✓</span>
    </div>
  </div>

  <div class="section-title">
    <h2>🔥 当前商店轮换礼包</h2>
    <span class="sub">实时快照 · 每日更新脚本自动同步</span>
  </div>
  <div id="live-store">${renderLiveStore()}</div>

  <div class="section-title">
    <h2>🌙 夜市活动</h2>
    <span class="sub">官方排期锚点 + 规律推算 · 个人夜市模拟</span>
  </div>
  <div id="nm-section">${renderNightMarket()}</div>

  <div class="section-title">
    <h2>💎 近期礼包精选</h2>
    <span class="sub">轮换候选 · 按已知发布顺序</span>
  </div>
  <div id="featured-bundles">${renderFeaturedBundles()}</div>

  <div class="section-title">
    <h2>🗂 全部礼包</h2>
    <span class="sub">共 ${Data.bundles.length} 个 · 含价格估算</span>
  </div>
  <div id="all-bundles">${renderAllBundles()}</div>`;

  bindChips(el);
  const simBtn = document.getElementById('btn-nm-sim');
  if (simBtn) simBtn.addEventListener('click', simulateNM);
  const moreBtn = document.getElementById('btn-more-bundles');
  if (moreBtn) moreBtn.addEventListener('click', () => {
    allExpanded = !allExpanded;
    document.getElementById('all-bundles').innerHTML = renderAllBundles();
    bindChips(document.getElementById('all-bundles'));
  });
}
