#!/usr/bin/env node
/**
 * 无畏契约折扣看板 —— 每日数据更新脚本
 *
 * 数据源:
 *   1. https://valorant-api.com      官方客户端数据快照（皮肤/品质/主题/礼包/视频特效）
 *   2. https://valohub.co/store      商店轮换实时快照（当前 featured 礼包，尽力解析）
 * 输出:
 *   data/skins.json        皮肤图鉴目录（含各级特效视频/贴图 URL、品质、价格）
 *   data/bundles.json      礼包目录（含内容重建、礼包价估算、精选排序）
 *   data/storefront.json   当前商店轮换礼包（实时快照；失败时回退精选列表）
 *   data/nightmarket.json  夜市排期（真实锚点 + 推算）+ 资格池
 *   data/meta.json         更新时间 / 游戏版本 / 统计
 *
 * 用法:  node scripts/update.mjs
 * 说明:  可配合 Windows 计划任务每日自动执行（见 scripts/schedule.ps1）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const API = 'https://valorant-api.com';

/* ---------------------------------------------------------------- 抓取工具 */
async function fetchData(path) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(API + path, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status !== 200) throw new Error(`API status ${json.status}`);
      return json.data;
    } catch (e) {
      lastErr = e;
      console.warn(`  [重试 ${attempt}/3] GET ${path} -> ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`GET ${path} 失败: ${lastErr?.message}`);
}

/* ---------------------------------------------------------------- 常量 */
const THEME_ZH = {
  'Prime': '原初', 'Reaver': '掠夺者', 'Oni': '鬼', 'Glitchpop': '电幻普普',
  'Elderflame': '源焰', 'Singularity': '奇点', 'Sovereign': '帝威', 'Ion': '离子',
  'BlastX': '爆能', 'Origin': '起源', 'Protocol 781-A': '781-A 协议',
  'Magepunk': '魔幻朋克', 'Forsaken': '遗落', 'Ruination': '湮灭',
  'Sentinels of Light': '光之哨兵', 'Spectrum': '频谱', 'Radiant Crisis 001': '光危机 001',
  'Neptune': '海王星', 'ChronoVoid': '时之隙', 'Prelude to Chaos': '混沌序曲',
  "Gaia's Vengeance": '盖亚之怒', 'Celestial': '天界', 'Crimsonbeast': '绯红兽',
  'Champions 2021': '2021 冠军赛', 'Champions 2022': '2022 冠军赛',
  'Champions 2023': '2023 冠军赛', 'Champions 2024': '2024 冠军赛',
  'Champions 2025': '2025 冠军赛', 'Arcane': '双城之战', 'Imperium': '帝国',
  'Black.Market': '黑市', 'Radiant Entertainment System': '光能娱乐系统',
  'Cryostasis': '冰封', 'Comet': '彗星', 'Convex': '凸面', 'Smite': '惩戒',
  'Piedra del Sol': '太阳石', 'Team Ace': '王牌战队', 'Doombringer': '厄运使者',
  'Holomoku': '全息木库', 'Mystbloom': '秘咒之花', 'Kuronami': '黑浪',
  'XERØFANG': '噬零', 'Overlay': '叠影', 'Valiant Hero': '英勇英雄',
  'Evori Dreamwings': '艾沃里梦翼', 'Emberclad': '余烬铠甲', 'Nocturnum': '夜魇',
  'Aemondir': '艾蒙迪尔', 'Araxys': '荒骨', 'Luna': '月辉', 'Ignite Fan': '点燃之扇',
  'Primordium': '源质', 'Undercity': '下城', 'Velocity': '疾风', 'EX.O': '外部改造',
  'CYRAX': '赛拉克斯', 'Helix': '螺旋', 'Kohaku & Matsuba': '琥珀与松叶',
  'Rune Riot': '符文暴动', 'Prism': '棱镜', 'Prism II': '棱镜 II',
  'Avalanche': '雪崩', 'Winterwunderland': '冬日仙境', 'Nunca Olvidados': '勿忘亡灵',
  'Endeavour': '奋进', 'Rush': '突进', 'Tilde': '波浪号', 'Silvanus': '森林之神',
  'Aristocrat': '贵族', 'Sensation': '轰动', 'Daydreams': '白日梦', 'Ego': '自我',
  'Gravitational Uranium Neuroblaster': '引力铀神经枪', 'Hivemind': '蜂巢心智',
  'Horizon': '地平线', 'Infantry': '步兵', 'Intergrade': '整合',
  "Lycan's Bane": '狼人克星', 'Minima': '极简', 'MK.VII Liberty': '自由 MK.VII',
  'Neo Frontier': '新边境', 'Polyfrog': '多变蛙', 'Premier Collision': '顶级碰撞',
  'Sakura': '樱花', 'Sarmad': '萨尔马德', 'Snowfall': '落雪',
  'Soulstrife': '灵魂纷争', 'Striker': '前锋', 'Switchback': '之字路',
  'Task Force 809': '809 特遣队', 'Tiger': '猛虎', 'Titanmail': '泰坦甲',
  'Topotek': '地形', 'Valorant GO! Vol. 1': 'GO! 一', 'Valorant GO! Vol. 2': 'GO! 二',
  'Vendetta': '仇杀', 'Venturi': '文丘里', 'Wasteland': '废土', 'Wunderkind': '神童',
  '9 Lives': '九命', 'Bound': '束缚', 'Cavalier': '骑士', 'Couture': '时装',
  'Depths': '深渊', 'Digihex': '数码六边形', 'Divine Swine': '神猪',
  'Doodle Buds': '涂鸦芽', 'Fiber Optic': '光纤', 'Galleria': '画廊',
  'Goldwing': '金翼', 'Heavy Metal': '重金属', 'Hydrodip': '水转印',
  'Libertine': '浪子', 'Misfits': '不合群', 'Moondash': '月冲', 'Nitro': '氮气',
  'PG-13': 'PG-13', 'Riptide': '激流', 'Red Alert': '红色警戒', 'Tacticool': '战术酷',
  'Varnish': '清漆', 'Abyssal': '深渊', 'Amethyst': '紫晶', 'Aero': '气动',
  'Altitude': '海拔', 'Aperture': '光圈', 'Astral': '星界', 'Blush': '腮红',
  'Chronos': '克洛诺斯', 'Code Red': '红色代码', 'Dambe': '丹贝', 'Dune': '沙丘',
  'Firefly': '萤火虫', 'Galaxy': '银河', 'Immortalized': '不朽', 'Jigsaw': '拼图',
  'Luxe': '奢华', 'Neo Luna': '新月', 'Obsidiana': '黑曜石', 'Pinkie': '小指',
  'Signature': '签名', 'Solid': '纯色', 'Split': '分裂', 'Swarm': '蜂群',
  'Temptation': '诱惑', 'Trimark': '三角标记', 'Viper': '毒蛇', 'Waveform': '波形',
  'Zedd': 'Zedd', 'VCT': 'VCT', 'VCT LOCK//IN': 'VCT 锁定//入围赛',
  '5 Years // Beta Remastered': '五周年 // 测试版重制',
  'VCT 2025 Season': 'VCT 2025 赛季', 'VCT 2026 Season': 'VCT 2026 赛季',
  'Blackspyre': '黑焰', 'Tethered Realms': '羁缚界域', 'Wonderstallion': '奇幻骏马',
  'NO LIMITS': '无极限', "Fortune's Hand": '命运之手', 'Storm Maw': '风暴之颚',
  'Reverie': '幻梦', 'Ayakashi': '妖怪', 'Tigris': '底格里斯', 'Holo Meridian': '全息经线',
  'Solarstride': '日行', 'Aeris': '风灵', 'Rupture': '裂爆', 'SilkLeaf': '丝叶',
  'Hi-DR0': 'Hi-DR0', 'Chromedek': '铬甲板', 'Phaseguard': '相位守卫', 'Divergence': '分歧',
  'Jellybeam': '果冻光束', "Dolmir's Revenge": '多尔米尔的复仇', 'Troublemaker': '捣蛋鬼',
  'Bubblegum Deathwish': '泡泡糖死愿', 'Nanomight': '纳米威', 'SplashX': '水花X',
  'Blackthorn': '黑棘', 'Rogue': '浪客', 'Nebula': '星云', 'Spline': '样条',
  'Combat Crafts': '战斗工艺', 'Sarmad': '萨尔马德', 'Silvanus': '西尔瓦努斯',
  'Nunca Olvidados': '勿忘亡灵', 'Couture': '高定', 'Valiant Hero': '英勇英雄',
  'Snowfall': '落雪', 'Spline': '样条', 'Rogue': '浪客', 'Blackthorn': '黑棘',
};

/** 主题英文名 -> 中文参考译名（含 2.0 / 3.0 后缀处理） */
function themeZh(name) {
  const n = name || '';
  if (THEME_ZH[n]) return THEME_ZH[n];
  const m = n.match(/^(.*?)\s*\/\/\s*(2\.0|3\.0)$/i);
  if (m && THEME_ZH[m[1]]) return `${THEME_ZH[m[1]]} ${m[2]}`;
  return n;
}

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

/* 官方定价规则（VP）：
 * 枪械: Ultra 2475 / Exclusive 2175（冠军赛·双城之战等特别系列 2675）/ Premium 1775 / Deluxe 1275 / Select 875
 * 近战: Ultra 4350 / Exclusive 4950 / Premium 3550 / Deluxe 2550 / Select 1750 */
const GUN_PRICE = { Ultra: 2475, Exclusive: 2175, Premium: 1775, Deluxe: 1275, Select: 875 };
const MELEE_PRICE = { Ultra: 4350, Exclusive: 4950, Premium: 3550, Deluxe: 2550, Select: 1750 };
const EXCLUSIVE_2675 = ['Champions 2021', 'Champions 2022', 'Champions 2023', 'Champions 2024', 'Champions 2025', 'Arcane'];

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

/* 近期礼包精选顺序（新 -> 旧；2026 系列顺序为估算，实时轮换以 storefront 为准） */
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
  console.log('[1/6] 拉取游戏版本 …');
  const version = await fetchData('/v1/version');

  console.log('[2/6] 拉取武器与皮肤目录 …');
  const [weapons, skinsRaw] = await Promise.all([
    fetchData('/v1/weapons'),
    fetchData('/v1/weapons/skins'),
  ]);

  console.log('[3/6] 拉取主题与品质 …');
  const [themes, tiers] = await Promise.all([
    fetchData('/v1/themes'),
    fetchData('/v1/contenttiers'),
  ]);

  console.log('[4/6] 拉取礼包目录 …');
  const bundlesRaw = await fetchData('/v1/bundles');

  /* ---------- 基础映射 ---------- */
  const tierByUuid = new Map(tiers.map((t) => [t.uuid, tierKey(t.displayName)]));
  const themeById = new Map(themes.map((t) => [t.uuid, t.displayName]));
  const skinWeapon = new Map();
  for (const w of weapons) {
    const cat = CATEGORY_ZH[String(w.category || '').split('::').pop()] || '其他';
    for (const s of w.skins || []) skinWeapon.set(s.uuid, { weapon: w.displayName, category: cat });
  }
  const priceOf = (tier, category, theme) => {
    if (category === '近战') return MELEE_PRICE[tier] ?? null;
    let p = GUN_PRICE[tier];
    if (tier === 'Exclusive' && EXCLUSIVE_2675.includes(theme)) p = 2675;
    return p ?? null;
  };

  /* ---------- 皮肤图鉴 ---------- */
  const skinMap = new Map();
  const catalog = [];
  for (const s of skinsRaw) {
    const tier = tierByUuid.get(s.contentTierUuid) || 'None';
    if (tier === 'Standard' || tier === 'None') continue;
    if (!s.displayIcon) continue;
    const wi = skinWeapon.get(s.uuid) || { weapon: '武器', category: '其他' };
    const theme = themeById.get(s.themeUuid) || '';
    catalog.push({
      uuid: s.uuid,
      name: s.displayName,
      theme,
      themeZh: themeZh(theme),
      tier,
      weapon: wi.weapon,
      category: wi.category,
      price: priceOf(tier, wi.category, theme),
      icon: s.displayIcon || null,
      levels: (s.levels || []).map((lv) => ({
        name: lv.displayName,
        icon: lv.displayIcon || null,
        video: lv.streamedVideo || null,
      })),
      chromas: (s.chromas || []).map((c) => ({
        name: c.displayName,
        swatch: c.swatch || null,
        icon: c.displayIcon || null,
        render: c.fullRender || null,
        video: c.streamedVideo || null,
      })),
    });
    skinMap.set(s.uuid, catalog[catalog.length - 1]);
  }

  /* ---------- 礼包内容重建（主题名匹配 + 特殊规则） ---------- */
  const themeSkins = new Map(); // norm(theme) -> skins
  for (const sk of catalog) {
    const k = norm(sk.theme);
    if (!themeSkins.has(k)) themeSkins.set(k, []);
    themeSkins.get(k).push(sk);
  }
  const byName = new Map();
  for (const sk of catalog) {
    const k = norm(sk.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(sk);
  }
  function matchBundle(name) {
    const nk = norm(name);
    const exact = themeSkins.get(nk) || [];
    if (exact.length) return exact;
    const bySkinName = byName.get(nk) || [];
    if (bySkinName.length) return bySkinName;
    const rib = name.match(/^Run It Back:\s*(.+)$/i); // 复刻礼包 -> 基础系列主题
    if (rib) {
      const t = norm(rib[1]);
      if (t === 'lunar 26') return themeSkins.get('luna') || [];
      return themeSkins.get(t) || [];
    }
    if (/^valorant go!/i.test(name)) { // GO! 全系列
      return catalog.filter((s) => /^valorant go!/i.test(s.theme));
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
    const price = Math.max(0, total - meleePrice); // 礼包惯例：刀免费
    bundles.push({
      uuid: b.uuid,
      name: b.displayName,
      subText: b.displayNameSubText || '',
      description: b.description || '',
      icon: b.displayIcon || b.displayIcon2 || null,
      promoImage: b.promoImage || b.verticalPromoImage || null,
      price,
      priceEstimated: true,
      total,
      save: meleePrice,
      itemCount: items.length,
      items: items.map((it) => ({
        uuid: it.uuid, name: it.name, tier: it.tier, price: it.price,
        weapon: it.weapon, category: it.category, icon: it.icon,
      })),
    });
  }
  // 精选排序
  const rankOf = new Map(FEATURED_ORDER.map((n, i) => [norm(n), i]));
  for (const b of bundles) {
    b.featuredRank = rankOf.has(norm(b.name)) ? rankOf.get(norm(b.name)) : 999;
    b.featured = b.featuredRank < 60;
  }
  bundles.sort((a, b) => a.featuredRank - b.featuredRank || a.name.localeCompare(b.name));

  /* ---------- 实时商店轮换 ---------- */
  console.log('[5/6] 抓取实时商店轮换（valohub）…');
  let storefront;
  try {
    const live = await fetchLiveStore();
    storefront = {
      source: 'valohub.co/store',
      fetchedAt: new Date().toISOString(),
      bundles: live.map((l) => ({
        name: l.name,
        discountPct: l.discountPct,
        items: l.skinUuids
          .map((u) => {
            const sk = skinMap.get(u);
            if (!sk) return { uuid: u, name: '皮肤', unknown: true, icon: `https://media.valorant-api.com/weaponskins/${u}/displayicon.png` };
            return { uuid: u, name: sk.name, tier: sk.tier, price: sk.price, weapon: sk.weapon, category: sk.category, icon: sk.icon };
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
  const nmTiers = ['Select', 'Deluxe', 'Premium', 'Exclusive']; // 2026 起官方加入限定品质
  const inBundle = new Set(bundles.flatMap((b) => b.items.map((it) => it.uuid)));
  // 官方规则：夜市只出现上线满 2 个幕的皮肤 —— 用"最近 10 个礼包系列"近似排除
  const recentThemes = new Set(
    bundles
      .filter((b) => b.featuredRank < 10)
      .flatMap((b) => b.items.map((it) => skinMap.get(it.uuid)?.theme))
      .filter(Boolean)
  );
  const nmPool = catalog.filter(
    (s) => nmTiers.includes(s.tier) && s.category !== '近战' && inBundle.has(s.uuid) && !recentThemes.has(s.theme)
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
      uuid: s.uuid, name: s.name, tier: s.tier, weapon: s.weapon,
      category: s.category, price: s.price, icon: s.icon,
    })),
  };

  /* ---------- 写入 ---------- */
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
      bundleCount: bundles.length,
      skinCount: catalog.length,
      nmEligibleCount: nmPool.length,
      liveStore: !!storefront.fetchedAt,
    }, null, 2)
  );

  console.log('[6/6] 写入完成 ✓');
  console.log(`  皮肤图鉴: ${catalog.length} 款`);
  console.log(`  礼包: ${bundles.length} 个（精选 ${bundles.filter((b) => b.featured).length} 个）`);
  console.log(`  实时商店: ${storefront.bundles.length} 个轮换礼包${storefront.error ? '（失败，已回退）' : ''}`);
  console.log(`  夜市资格池: ${nmPool.length} 款`);
  if (nightmarket.active) console.log(`  夜市: 进行中，结束于 ${nightmarket.active.end}`);
  else if (nightmarket.next) console.log(`  夜市: 下次预计 ${nightmarket.next.start} ~ ${nightmarket.next.end}（推算）`);
}

main().catch((e) => {
  console.error('\n更新失败:', e.message);
  process.exit(1);
});
