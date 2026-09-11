#!/usr/bin/env node
/**
 * 无畏契约折扣看板 —— 每日数据更新脚本
 *
 * 数据源:
 *   1. https://valorant-api.com      官方客户端数据快照（皮肤/品质/主题/礼包/视频特效）
 *      - 使用 language=zh-CN 语言包，皮肤/系列/礼包/武器名均为**国服官方译名**
 *   2. https://valohub.co/store      商店轮换实时快照（当前 featured 礼包，尽力解析）
 * 输出:
 *   data/skins.json        皮肤图鉴目录（国服名 + 英文名，含各级特效视频/贴图 URL）
 *   data/bundles.json      礼包目录（内容重建、礼包价估算、精选排序）
 *   data/storefront.json   当前商店轮换礼包（实时快照；失败时回退精选列表）
 *   data/nightmarket.json  夜市排期（真实锚点 + 推算）+ 资格池
 *   data/meta.json         更新时间 / 游戏版本 / 统计
 *
 * 用法:  node scripts/update.mjs
 * 说明:  可配合 Windows 计划任务或 GitHub Actions 每日自动执行
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const API = 'https://valorant-api.com';

/* ---------------------------------------------------------------- 抓取工具 */
async function fetchData(path, lang) {
  const url = API + path + (lang ? `?language=${lang}` : '');
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status !== 200) throw new Error(`API status ${json.status}`);
      return json.data;
    } catch (e) {
      lastErr = e;
      console.warn(`  [重试 ${attempt}/3] GET ${path}${lang ? '?language=' + lang : ''} -> ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`GET ${path} 失败: ${lastErr?.message}`);
}

/* ---------------------------------------------------------------- 常量 */
function tierKey(displayName) {
  const n = displayName || '';
  if (/ultra/i.test(n)) return 'Ultra';
  if (/exclusive/i.test(n)) return 'Exclusive';
  if (/premium/i.test(n)) return 'Premium';
  if (/deluxe/i.test(n)) return 'Deluxe';
  if (/select/i.test(n)) return 'Select';
  if (/standard/i.test(n)) return 'Standard';
  return 'None';
}

/* ---- 国服点券价格 ----
 * 枪械档位为**国服商城实测值**（来源：国服 wiki 商城价格行，逐一核对）：
 *   精选 690 / 豪华 890 / 卓越 1290 / 传奇 1590 / 终极 1790
 * 近战武器按"同品质枪械价 ×2"（国服实测：卓越刀 2580、传奇刀 3180，均等于对应枪价 ×2）：
 *   1380 / 1780 / 2580 / 3180 / 3580
 * 个别系列国服有独立定价，已核实的加在下面的覆盖表
 */
const GUN_PRICE_CN = { Select: 690, Deluxe: 890, Premium: 1290, Exclusive: 1590, Ultra: 1790 };
const MELEE_PRICE_CN = { Select: 1380, Deluxe: 1780, Premium: 2580, Exclusive: 3180, Ultra: 3580 };
const CN_THEME_OVERRIDE = {
  'Kuronami': { gun: 1690, melee: 3380 },                      // 塑水宗：传奇档 1690（实测）
  'Radiant Entertainment System': { gun: 2190, melee: 4380 },  // 源能者娱乐系统：终极档 2190（实测）
};

/* 国际服 VP 参考价（仅用于对照显示） */
const GUN_PRICE_VP = { Ultra: 2475, Exclusive: 2175, Premium: 1775, Deluxe: 1275, Select: 875 };
const MELEE_PRICE_VP = { Ultra: 4950, Exclusive: 4350, Premium: 3550, Deluxe: 2550, Select: 1750 };
const EXCLUSIVE_2675 = ['Champions 2021', 'Champions 2022', 'Champions 2023', 'Champions 2024', 'Champions 2025', 'Arcane'];

function priceCn(tier, category, themeEn) {
  const ov = CN_THEME_OVERRIDE[themeEn];
  if (category === '近战') return ov?.melee ?? MELEE_PRICE_CN[tier] ?? null;
  return ov?.gun ?? GUN_PRICE_CN[tier] ?? null;
}
function priceVp(tier, category, themeEn) {
  if (category === '近战') return MELEE_PRICE_VP[tier] ?? null;
  let p = GUN_PRICE_VP[tier];
  if (tier === 'Exclusive' && EXCLUSIVE_2675.includes(themeEn)) p = 2675;
  return p ?? null;
}

const CATEGORY_ZH = {
  Sidearm: '手枪', SMG: '冲锋枪', Rifle: '步枪', Sniper: '狙击枪',
  Shotgun: '霰弹枪', Heavy: '机枪', Melee: '近战',
};

const norm = (s) => (s || '').toLowerCase().replace(/\/\/\s*/g, ' ').replace(/\s+/g, ' ').trim();

/* 夜市历史锚点（官方公告的真实活动日期，用于推算未来排期） */
const NM_ANCHORS = [
  { start: '2024-02-15', end: '2024-02-28' },
  { start: '2024-05-16', end: '2024-05-29' },
  { start: '2024-07-18', end: '2024-07-31' },
  { start: '2024-09-26', end: '2024-10-08' },
  { start: '2024-11-28', end: '2024-12-11' },
  { start: '2025-01-23', end: '2025-02-05' },
  { start: '2025-03-27', end: '2025-04-09' },
  { start: '2025-05-29', end: '2025-06-11' },
  { start: '2026-05-08', end: '2026-05-21' },
  { start: '2026-07-17', end: '2026-07-29' }, // 官方公告：7月17日~29日
];
const NM_DURATION_DAYS = 14;

/* 近期礼包精选顺序（英文名，新 -> 旧；实时轮换以 storefront 为准） */
const FEATURED_ORDER = [
  'VCT 2026 Season', 'Blackspyre', 'Tethered Realms', 'Wonderstallion', 'NO LIMITS',
  "Fortune's Hand", 'Storm Maw', 'Reverie', 'Ayakashi', 'Tigris', 'Holo Meridian',
  'Solarstride', 'Aeris', 'Rupture', 'SilkLeaf', 'Hi-DR0', 'Chromedek', 'Phaseguard',
  'Divergence', 'Jellybeam', "Dolmir's Revenge", 'Troublemaker', 'Bubblegum Deathwish',
  'Nanomight', 'SplashX', 'Blackthorn', 'Rogue', 'Nebula', 'Abyssal',
  'Champions 2025', 'Emberclad', 'Ignite Fan', 'Nocturnum', 'Kohaku & Matsuba',
  'Helix', 'Holomoku', 'Evori Dreamwings', '5 Years // Beta Remastered', 'Aemondir',
  'CYRAX', 'EX.O', 'Doombringer', 'VCT 2025 Season', 'Mystbloom', 'XERØFANG',
  'Prelude to Chaos', 'Champions 2024', 'Black.Market', 'Radiant Entertainment System',
  'Araxys', 'Kuronami', 'Overlay', 'Primordium', 'Sentinels of Light', 'Neptune',
  'Valiant Hero', 'Cryostasis', 'Singularity', 'Oni', 'Glitchpop', 'Elderflame',
  'Reaver', 'Prime', 'Spectrum', 'Origin', 'BlastX', 'Forsaken', 'Ion', 'Sovereign',
  'Ruination', 'Magepunk', 'Protocol 781-A', 'Team Ace', "Gaia's Vengeance",
];

/* ---------------------------------------------------------------- 实时商店 */
async function fetchLiveStore() {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fetchLiveStoreOnce();
    } catch (e) {
      lastErr = e;
      console.warn(`  [重试 ${attempt}/4] 实时商店 -> ${e.message}`);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw lastErr;
}

async function fetchLiveStoreOnce() {
  const res = await fetch('https://valohub.co/store', { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  // 标题区（h2 礼包名），以第一个 h3（页脚导航）为边界
  const heads = [...html.matchAll(/<h2[^>]*>([^<]{2,80})<\/h2>/g)].map((m) => ({ i: m.index, name: m[1].trim() }));
  const footerIdx = html.search(/<h3[^>]*>/);
  if (!heads.length) throw new Error('页面结构变化：未找到礼包区块');
  const sections = heads.map((h, k) => ({
    name: h.name,
    slice: html.slice(h.i, k + 1 < heads.length ? heads[k + 1].i : footerIdx > 0 ? footerIdx : html.length),
  }));
  const out = [];
  for (const sec of sections) {
    const skinUuids = [...new Set([...sec.slice.matchAll(/weaponskins\/([0-9a-f-]+)\/displayicon/g)].map((m) => m[1]))];
    const acc = [...new Set([...sec.slice.matchAll(/media\.valorant-api\.com\/(buddies|playercards|sprays)\/([0-9a-f-]+)\/displayicon/g)].map((m) => `${m[1]}:${m[2]}`))];
    const pctM = sec.slice.replace(/<[^>]+>/g, ' ').match(/(\d+(?:\.\d+)?)\s*%/);
    let discountPct = null;
    if (pctM) {
      const d = parseFloat(pctM[1]);
      discountPct = d > 1 ? Math.round(d) : Math.round(d * 100);
      if (discountPct > 99) discountPct = null;
    }
    out.push({ name: sec.name, skinUuids, accessories: acc, discountPct });
  }
  return out.filter((s) => s.skinUuids.length > 0 || s.accessories.length > 0);
}

/* ---------------------------------------------------------------- 主流程 */
async function main() {
  console.log('== 无畏契约折扣看板 · 数据更新 ==');
  console.log('[1/7] 拉取游戏版本 …');
  const version = await fetchData('/v1/version');

  console.log('[2/7] 拉取武器与皮肤目录（英文 + 国服简中）…');
  const [weaponsEn, weaponsZh, skinsEn, skinsZh] = await Promise.all([
    fetchData('/v1/weapons'),
    fetchData('/v1/weapons', 'zh-CN'),
    fetchData('/v1/weapons/skins'),
    fetchData('/v1/weapons/skins', 'zh-CN'),
  ]);

  console.log('[3/7] 拉取主题与品质（英文 + 国服简中）…');
  const [themesEn, themesZh, tiersEn, tiersZh] = await Promise.all([
    fetchData('/v1/themes'),
    fetchData('/v1/themes', 'zh-CN'),
    fetchData('/v1/contenttiers'),
    fetchData('/v1/contenttiers', 'zh-CN'),
  ]);

  console.log('[4/7] 拉取礼包目录（英文 + 国服简中）…');
  const [bundlesRaw, bundlesZh] = await Promise.all([
    fetchData('/v1/bundles'),
    fetchData('/v1/bundles', 'zh-CN'),
  ]);

  /* ---------- 基础映射 ---------- */
  const tierZhByUuid = new Map(tiersZh.map((t) => [t.uuid, t.displayName]));
  const tierByUuid = new Map(tiersEn.map((t) => [t.uuid, { key: tierKey(t.displayName), zh: tierZhByUuid.get(t.uuid) || t.displayName }]));
  const themeZhById = new Map(themesZh.map((t) => [t.uuid, t.displayName]));
  const themeEnById = new Map(themesEn.map((t) => [t.uuid, t.displayName]));
  const bundleZhById = new Map(bundlesZh.map((b) => [b.uuid, b.displayName]));

  // 皮肤 uuid -> 武器（英文名 / 国服名 / 类别）
  const skinWeapon = new Map();
  const weaponZhById = new Map(weaponsZh.map((w) => [w.uuid, w.displayName]));
  for (const w of weaponsEn) {
    const cat = CATEGORY_ZH[String(w.category || '').split('::').pop()] || '其他';
    for (const s of w.skins || []) {
      skinWeapon.set(s.uuid, { weaponEn: w.displayName, weapon: weaponZhById.get(w.uuid) || w.displayName, category: cat });
    }
  }

  const tierZhByKey = new Map();
  for (const v of tierByUuid.values()) tierZhByKey.set(v.key, v.zh);

  /* ---------- 皮肤图鉴（英文 + 国服译名） ---------- */
  const zhSkinById = new Map(skinsZh.map((s) => [s.uuid, s]));
  const skinMap = new Map();
  const catalog = [];
  for (const s of skinsEn) {
    const tierInfo = tierByUuid.get(s.contentTierUuid);
    const tier = tierInfo?.key || 'None';
    if (tier === 'Standard' || tier === 'None') continue;
    if (!s.displayIcon) continue;
    const sz = zhSkinById.get(s.uuid) || {};
    const wi = skinWeapon.get(s.uuid) || { weapon: '武器', weaponEn: 'Weapon', category: '其他' };
    const themeEn = themeEnById.get(s.themeUuid) || '';
    const theme = themeZhById.get(s.themeUuid) || themeEn;

    // 配色名：国服格式形如 "电光霓虹 狂徒\n（炫彩1 橙色）"，抽出括号内文案
    const cleanChroma = (zhName, enName, chromaIdx) => {
      const m = (zhName || '').match(/（([^）]+)）/);
      if (m) return m[1].replace(/\s+/g, ' ').trim();
      const stripped = (enName || '').replace(s.displayName, '').replace(/[()]/g, '').trim();
      return stripped || `炫彩 ${chromaIdx + 1}`;
    };

    const entry = {
      uuid: s.uuid,
      name: sz.displayName || s.displayName,       // 国服官方译名
      nameEn: s.displayName,                        // 国际服英文名
      theme,
      themeEn,
      tier,
      tierZh: tierInfo?.zh || '',
      weapon: wi.weapon,
      weaponEn: wi.weaponEn,
      category: wi.category,
      price: priceCn(tier, wi.category, themeEn),      // 国服点券
      priceVp: priceVp(tier, wi.category, themeEn),    // 国际服 VP 对照
      priceNote: wi.category === '近战' ? '同品质 ×2 换算' : '国服商城实测档位',
      icon: s.displayIcon || null,
      levels: (s.levels || []).map((lv, i) => ({
        name: lv.displayName,
        label: `等级 ${i + 1}`,
        icon: lv.displayIcon || null,
        video: lv.streamedVideo || null,
      })),
      chromas: (s.chromas || []).map((c, i) => ({
        name: cleanChroma((sz.chromas || [])[i]?.displayName, c.displayName, i),
        nameEn: c.displayName,
        swatch: c.swatch || null,
        icon: c.displayIcon || null,
        render: c.fullRender || null,
        video: c.streamedVideo || null,
      })),
    };
    catalog.push(entry);
    skinMap.set(s.uuid, entry);
  }

  /* ---------- 近战品质校正 ----------
   * 官方数据把近战皮肤统一标注为"传奇"（国际服近战确实同价），
   * 但国服近战按品质定价，因此用**同系列枪械的品质**推断近战真实品质。 */
  const themeTierVotes = new Map();
  for (const sk of catalog) {
    if (sk.category === '近战') continue;
    if (!themeTierVotes.has(sk.themeEn)) themeTierVotes.set(sk.themeEn, new Map());
    const votes = themeTierVotes.get(sk.themeEn);
    votes.set(sk.tier, (votes.get(sk.tier) || 0) + 1);
  }
  const themeTier = new Map();
  for (const [theme, votes] of themeTierVotes) {
    themeTier.set(theme, [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  let meleeFixed = 0;
  for (const sk of catalog) {
    if (sk.category !== '近战') continue;
    const inferred = themeTier.get(sk.themeEn);
    if (inferred && inferred !== sk.tier) {
      sk.tier = inferred;
      sk.tierZh = tierZhByKey.get(inferred) || sk.tierZh;
      sk.tierInferred = true;                       // 品质由同系列枪械推断
      sk.price = priceCn(sk.tier, sk.category, sk.themeEn);
      sk.priceVp = priceVp(sk.tier, sk.category, sk.themeEn);
      meleeFixed++;
    }
  }
  console.log(`  近战品质校正: ${meleeFixed} 款（按同系列枪械品质推断）`);

  /* ---------- 礼包内容重建（按英文名匹配 + 特殊规则） ---------- */
  const themeSkins = new Map(); // norm(themeEn) -> skins
  for (const sk of catalog) {
    const k = norm(sk.themeEn);
    if (!themeSkins.has(k)) themeSkins.set(k, []);
    themeSkins.get(k).push(sk);
  }
  const byName = new Map();
  for (const sk of catalog) {
    const k = norm(sk.nameEn);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(sk);
  }
  function matchBundle(nameEn) {
    const nk = norm(nameEn);
    const exact = themeSkins.get(nk) || [];
    if (exact.length) return exact;
    const bySkinName = byName.get(nk) || [];
    if (bySkinName.length) return bySkinName;
    const rib = nameEn.match(/^Run It Back:\s*(.+)$/i); // 复刻礼包 -> 基础系列主题
    if (rib) {
      const t = norm(rib[1]);
      if (t === 'lunar 26') return themeSkins.get('luna') || [];
      return themeSkins.get(t) || [];
    }
    if (/^valorant go!/i.test(nameEn)) { // GO! 全系列
      return catalog.filter((s) => /^valorant go!/i.test(s.themeEn));
    }
    return [];
  }
  const seenNames = new Set();
  const bundles = [];
  for (const b of bundlesRaw) {
    const nk = norm(b.displayName);
    if (seenNames.has(nk)) continue; // 同名去重
    seenNames.add(nk);
    const items = matchBundle(b.displayName);
    if (!items.length) continue; // 纯饰品/不可重建的礼包跳过
    const total = items.reduce((sum, it) => sum + (it.price || 0), 0);
    const meleePrice = items.find((it) => it.category === '近战')?.price || 0;
    const knifeFree = total - meleePrice; // 礼包惯例：刀免费
    const price = knifeFree > 0 ? knifeFree : total; // 纯近战礼包不适用该惯例
    bundles.push({
      uuid: b.uuid,
      name: bundleZhById.get(b.uuid) || b.displayName, // 国服礼包名
      nameEn: b.displayName,
      subText: b.displayNameSubText || '',
      description: b.description || '',
      icon: b.displayIcon || b.displayIcon2 || null,
      promoImage: b.promoImage || b.verticalPromoImage || null,
      price,
      priceEstimated: true,
      total,
      save: Math.max(0, total - price),
      itemCount: items.length,
      items: items.map((it) => ({
        uuid: it.uuid, name: it.name, nameEn: it.nameEn, tier: it.tier, price: it.price,
        weapon: it.weapon, weaponEn: it.weaponEn, category: it.category, icon: it.icon,
      })),
    });
  }
  const rankOf = new Map(FEATURED_ORDER.map((n, i) => [norm(n), i]));
  for (const b of bundles) {
    b.featuredRank = rankOf.has(norm(b.nameEn)) ? rankOf.get(norm(b.nameEn)) : 999;
    b.featured = b.featuredRank < 60;
  }
  bundles.sort((a, b) => a.featuredRank - b.featuredRank || a.name.localeCompare(b.name, 'zh-Hans-CN'));

  /* ---------- 实时商店轮换 ---------- */
  console.log('[5/7] 抓取实时商店轮换（valohub）…');
  let storefront;
  try {
    const live = await fetchLiveStore();
    storefront = {
      source: 'valohub.co/store',
      fetchedAt: new Date().toISOString(),
      bundles: live.map((l) => ({
        name: byName.get(norm(l.name))?.[0]?.name || l.name, // 混合礼包名若等于某皮肤英文名，则显示其国服译名
        nameEn: l.name,
        discountPct: l.discountPct,
        items: l.skinUuids.map((u) => {
          const sk = skinMap.get(u);
          if (!sk) return { uuid: u, name: '皮肤', nameEn: null, unknown: true, icon: `https://media.valorant-api.com/weaponskins/${u}/displayicon.png` };
          return { uuid: u, name: sk.name, nameEn: sk.nameEn, tier: sk.tier, price: sk.price, weapon: sk.weapon, weaponEn: sk.weaponEn, category: sk.category, icon: sk.icon };
        }),
        accessories: l.accessories.map((a) => {
          const [kind, uuid] = a.split(':');
          return { kind, uuid, icon: `https://media.valorant-api.com/${kind}/${uuid}/displayicon.png` };
        }),
      })),
    };
  } catch (e) {
    console.warn(`  [警告] 实时商店抓取失败: ${e.message}，将回退到精选礼包列表`);
    storefront = { source: null, fetchedAt: null, error: e.message, bundles: [] };
  }

  /* ---------- 夜市 ---------- */
  console.log('[6/7] 计算夜市排期与资格池 …');
  const nmTiers = ['Select', 'Deluxe', 'Premium', 'Exclusive']; // 2026 起官方加入传奇品质
  const inBundle = new Set(bundles.flatMap((b) => b.items.map((it) => it.uuid)));
  // 官方规则：夜市只出现上线满 2 个幕的皮肤 —— 用"最近 10 个礼包系列"近似排除
  const recentThemes = new Set(
    bundles
      .filter((b) => b.featuredRank < 10)
      .flatMap((b) => b.items.map((it) => skinMap.get(it.uuid)?.themeEn))
      .filter(Boolean)
  );
  const nmPool = catalog.filter(
    (s) => nmTiers.includes(s.tier) && s.category !== '近战' && inBundle.has(s.uuid) && !recentThemes.has(s.themeEn)
  );
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dayMs = 86400000;
  const gaps = [];
  for (let i = 1; i < NM_ANCHORS.length; i++) {
    gaps.push((new Date(NM_ANCHORS[i].start) - new Date(NM_ANCHORS[i - 1].start)) / dayMs);
  }
  const lastGap = Math.round(gaps[gaps.length - 1]);
  const windows = [];
  let last = NM_ANCHORS[NM_ANCHORS.length - 1];
  while (windows.length < 4) {
    const start = new Date(last.start);
    start.setDate(start.getDate() + lastGap);
    const end = new Date(start);
    end.setDate(end.getDate() + NM_DURATION_DAYS - 1);
    last = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    windows.push(last);
  }
  const allWindows = [...NM_ANCHORS, ...windows].map((w) => ({
    ...w,
    estimated: !NM_ANCHORS.includes(w),
    status: todayStr < w.start ? 'upcoming' : todayStr > w.end ? 'past' : 'active',
  }));
  const nightmarket = {
    generatedAt: new Date().toISOString(),
    note: '夜市为账号个人随机内容，公开接口无法获取个人夜市；排期按官方历史公告锚点推算，未来场次仅供参考。',
    active: allWindows.find((w) => w.status === 'active') || null,
    next: allWindows.find((w) => w.status === 'upcoming') || null,
    windows: allWindows.slice(-6),
    eligibleCount: nmPool.length,
    eligiblePool: nmPool.map((s) => ({
      uuid: s.uuid, name: s.name, nameEn: s.nameEn, tier: s.tier, weapon: s.weapon,
      category: s.category, price: s.price, icon: s.icon,
    })),
  };

  /* ---------- 写入 ---------- */
  console.log('[7/7] 写入数据文件 …');
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'skins.json'), JSON.stringify(catalog));
  writeFileSync(join(DATA_DIR, 'bundles.json'), JSON.stringify(bundles));
  writeFileSync(join(DATA_DIR, 'storefront.json'), JSON.stringify(storefront));
  writeFileSync(join(DATA_DIR, 'nightmarket.json'), JSON.stringify(nightmarket));
  writeFileSync(
    join(DATA_DIR, 'meta.json'),
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      gameVersion: version.version || null,
      locale: 'zh-CN',
      currency: '点券',
      priceNote: '枪械档位为国服商城实测（精选 690 / 豪华 890 / 卓越 1290 / 传奇 1590 / 终极 1790），近战按同品质 ×2',
      bundleCount: bundles.length,
      skinCount: catalog.length,
      nmEligibleCount: nmPool.length,
      liveStore: !!storefront.fetchedAt,
    }, null, 2)
  );

  console.log('写入完成 ✓');
  console.log(`  皮肤图鉴: ${catalog.length} 款（国服译名）`);
  console.log(`  礼包: ${bundles.length} 个（精选 ${bundles.filter((b) => b.featured).length} 个）`);
  console.log(`  实时商店: ${storefront.bundles.length} 个轮换礼包${storefront.error ? '（失败，已回退）' : ''}`);
  console.log(`  夜市资格池: ${nmPool.length} 款`);
  if (nightmarket.active) console.log(`  夜市: 进行中，结束于 ${nightmarket.active.end}`);
  else if (nightmarket.next) console.log(`  夜市: 下次预计 ${nightmarket.next.start} ~ ${nightmarket.next.end}（推算）`);
  console.log(`  示例: ${catalog[0]?.name} / ${catalog[0]?.nameEn}`);
}

main().catch((e) => {
  console.error('\n更新失败:', e.message);
  process.exit(1);
});
