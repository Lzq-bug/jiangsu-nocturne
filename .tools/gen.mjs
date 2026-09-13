/**
 * 生成截图任务（本地开发工具，不入库）
 * 用法：node .tools/gen.mjs <batch>
 *   batch: qa | ritual | play | readme | competition | manual | sc | beforeafter | console
 */
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:5174';
const SUITS = ['wands', 'cups', 'swords', 'pentacles'];
const OUT = '.showcase';
const AUDIT = '.audit-art/environment-before-after';

/** 全 78/78 收藏（README / manual / 软著候选的完整状态） */
function fullIds() {
  const ids = [];
  for (let n = 0; n < 22; n++) ids.push(`major-${n}`);
  for (const s of SUITS) for (let r = 1; r <= 14; r++) ids.push(`minor-${s}-${r}`);
  return ids;
}

const COUNT_BY_INDEX = (i) => 1 + (i % 3);

function buildSave(ids, opts = {}) {
  const t0 = Date.UTC(2026, 7, 8, 9, 0, 0);
  const c = {};
  ids.forEach((id, i) => {
    c[id] = { count: COUNT_BY_INDEX(i), firstAt: t0 + i * 3600e3, lastAt: t0 + i * 3600e3 + 86400e3 };
  });
  return {
    version: 1,
    createdAt: t0,
    updatedAt: Date.UTC(2026, 8, 13, 12, 0, 0),
    stardust: opts.stardust ?? 320,
    totalDraws: opts.totalDraws ?? 132,
    sinceLastNew: 0,
    collection: c,
    stats: { gamesPlayed: opts.gamesPlayed ?? 46, starsCaught: 512, bestRound: 21 },
    settings: { master: 0.8, bgm: 0.5, sfx: 0.8, muted: true, reducedMotion: false, apiKey: '', apiBaseUrl: '/__api', modelId: 'deepseek-chat' },
  };
}

const ALL = fullIds();
const MID_IDS = [
  ...ALL.filter((id) => id.startsWith('major-')),
  ...ALL.filter((id) => /-(11|12|13|14)$/.test(id)),            // 全部宫廷 16
  ...['wands-1','wands-2','wands-3','wands-4','wands-5','wands-6','wands-7','wands-8'],
  ...['cups-1','cups-2','cups-3','cups-4','cups-5','cups-6','cups-7','cups-8'],
  ...['swords-1','swords-2','swords-3','swords-4','swords-5','swords-6'],
  ...['pentacles-1','pentacles-2','pentacles-3','pentacles-4','pentacles-5','pentacles-6','pentacles-7','pentacles-8'],
].map((s) => (s.startsWith('major-') || s.startsWith('minor-') ? s : `minor-${s}`));
const EARLY_IDS = [
  ...ALL.filter((id) => { const m = /^major-(\d+)$/.exec(id); return m && Number(m[1]) <= 9; }),
  'minor-swords-14', 'minor-wands-14', 'minor-cups-13', 'minor-pentacles-12',
  'minor-wands-1', 'minor-wands-2', 'minor-cups-1', 'minor-cups-2',
];

const FIX = {
  full: () => buildSave(ALL, { stardust: 320, totalDraws: 132 }),
  mid: () => buildSave(MID_IDS, { stardust: 150, totalDraws: 86 }),
  early: () => buildSave(EARLY_IDS, { stardust: 420, totalDraws: 24 }),
  none: null,
};

const DESKTOP = { w: 1440, h: 900 };
const WIDE = { w: 1280, h: 720 };
const MOBILE = { w: 390, h: 844, scale: 2, mobile: true };

/* 观星台进入对局并等待星星出现 */
const PLAY_STEPS = [{ goto: '/starcatch', wait: 1200 }, { click: '.sky .btn-primary', wait: 6500 }];
const FAN_STEPS = [{ goto: '/unseal', wait: 1200 }, { click: '.orb-gate', wait: 1000 }];

/** 揭示：反复启封直到抽到「新牌入阁」，保证展示图为最优状态（真实交互，不伪造状态） */
const revealRetry = (idx) => `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const badge = () => (document.querySelector('.new-badge')?.textContent || '').trim();
  for (let i = 0; i < 9; i++) {
    const cards = document.querySelectorAll('.fan-box .card-btn');
    if (cards.length) { cards[(${idx} + i * 3) % cards.length].click(); await sleep(1900); }
    if (badge().includes('新牌')) return 'NEW: ' + badge();
    const again = [...document.querySelectorAll('button.btn')].find(b => b.textContent.includes('再启一封'));
    if (!again || again.disabled) return 'STOP: ' + badge();
    again.click(); await sleep(950);
  }
  return 'MAX: ' + badge();
})()`;

const REVEAL_STEPS = [
  { goto: '/unseal', wait: 1200 },
  { click: '.orb-gate', wait: 1000 },
  { evalAsync: revealRetry(4), wait: 400 },
];
const FILTER_STEP = (i) => ({ eval: `document.querySelectorAll('.filter-btn')[${i}].click()`, wait: 700 });

/** 「背景变更前」复现：关闭环境层并恢复旧的纯黑底 + 旧卡牌底板 */
const BEFORE_CSS = `
.env-scene{display:none!important}
.shell{background-color:#0d1226;background-image:radial-gradient(ellipse 60% 40% at 50% -5%,rgba(230,198,135,.07),transparent 70%),radial-gradient(ellipse 90% 60% at 80% 110%,rgba(27,35,71,.9),transparent 70%),linear-gradient(180deg,#0e1327 0%,#0b0f20 100%);min-height:100vh}
.card-btn::before{display:none!important}
.archive-wall{background:none!important;border-color:transparent!important;box-shadow:none!important}
.panel{background:linear-gradient(165deg,rgba(27,35,71,.55),rgba(13,18,38,.75))!important;box-shadow:none!important}
.entry-card{background:linear-gradient(165deg,rgba(27,35,71,.5),rgba(13,18,38,.6))!important;box-shadow:none!important}
.desk-hero{background:radial-gradient(ellipse 70% 90% at 85% 10%,rgba(230,198,135,.06),transparent 60%),linear-gradient(160deg,#182050,#10142b,#0b0f20)!important;box-shadow:none!important}
.topbar{background:linear-gradient(180deg,rgba(13,18,38,.92),rgba(13,18,38,.75))!important}
.sky{background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(27,35,71,.8),transparent 70%),linear-gradient(180deg,#0a0e1e,#070a16)!important;box-shadow:none!important}
body{background-color:#0d1226!important;background-image:none!important}
`;
const beforeEval = (extra = '') => `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(BEFORE_CSS + extra)}; document.head.appendChild(s); return 'before-css'; })()`;

const batches = {
  /* ---------- 内部 QA ---------- */
  qa: () => [
    { out: '.tools/qa/main-1440.png', ...DESKTOP, fixture: FIX.full(), goto: '/', wait: 1800 },
    { out: '.tools/qa/observatory-1440.png', ...DESKTOP, goto: '/starcatch', wait: 1400 },
    { out: '.tools/qa/unseal-1440.png', ...DESKTOP, goto: '/unseal', wait: 1400 },
    { out: '.tools/qa/archive-1440.png', ...DESKTOP, full: true, goto: '/collection', wait: 2400 },
    { out: '.tools/qa/archive-top-1440.png', ...DESKTOP, goto: '/collection', wait: 2200 },
    { out: '.tools/qa/detail-major-1440.png', ...DESKTOP, goto: '/card/major-18', wait: 1600 },
    { out: '.tools/qa/detail-minor-1440.png', ...DESKTOP, goto: '/card/minor-cups-8', wait: 1600 },
    { out: '.tools/qa/detail-court-1440.png', ...DESKTOP, goto: '/card/minor-swords-14', wait: 1600 },
    { out: '.tools/qa/main-1280.png', ...WIDE, goto: '/', wait: 1600 },
    { out: '.tools/qa/archive-1280.png', ...WIDE, full: true, goto: '/collection', wait: 2200 },
    { out: '.tools/qa/main-mobile.png', ...MOBILE, goto: '/', wait: 1600 },
    { out: '.tools/qa/archive-mobile.png', ...MOBILE, goto: '/collection', wait: 2200 },
    { out: '.tools/qa/detail-mobile.png', ...MOBILE, goto: '/card/major-18', wait: 1600 },
    { out: '.tools/qa/unseal-mobile.png', ...MOBILE, goto: '/unseal', wait: 1400 },
    { out: '.tools/qa/observatory-mobile.png', ...MOBILE, goto: '/starcatch', wait: 1400 },
    { out: '.tools/qa/archive-sealed-1440.png', ...DESKTOP, fixture: FIX.mid(), steps: [{ goto: '/collection', wait: 1500 }, FILTER_STEP(8)], wait: 1800 },
    { out: '.tools/qa/archive-owned-1440.png', ...DESKTOP, fixture: FIX.mid(), steps: [{ goto: '/collection', wait: 1500 }, FILTER_STEP(7)], wait: 1800 },
    { out: '.tools/qa/archive-major-1440.png', ...DESKTOP, fixture: FIX.mid(), steps: [{ goto: '/collection', wait: 1500 }, FILTER_STEP(1)], wait: 1800 },
    { out: '.tools/qa/archive-suit-wands-1440.png', ...DESKTOP, fixture: FIX.mid(), steps: [{ goto: '/collection', wait: 1500 }, FILTER_STEP(3)], wait: 1800 },
    { out: '.tools/qa/quiet-settings-1440.png', ...DESKTOP, fixture: FIX.mid(), goto: '/settings', wait: 1400 },
    { out: '.tools/qa/quiet-about-1440.png', ...DESKTOP, fixture: FIX.mid(), goto: '/about', wait: 1400 },
    { out: '.tools/qa/quiet-whisper-1440.png', ...DESKTOP, fixture: FIX.mid(), goto: '/starwhisper', wait: 1400 },
    { out: '.tools/qa/missing-card-1440.png', ...DESKTOP, fixture: FIX.mid(), goto: '/card/nope-999', wait: 1400 },
  ],

  ritual: () => [
    { out: '.tools/qa/ritual-gate.png', ...DESKTOP, fixture: FIX.early(), goto: '/unseal', wait: 1400 },
    { out: '.tools/qa/ritual-fan.png', ...DESKTOP, fixture: FIX.early(), steps: FAN_STEPS, settle: 800 },
    { out: '.tools/qa/ritual-reveal.png', ...DESKTOP, fixture: FIX.early(), steps: REVEAL_STEPS, settle: 900 },
    { out: '.tools/qa/ritual-fan-mobile.png', ...MOBILE, fixture: FIX.early(), steps: FAN_STEPS, settle: 800 },
    { out: '.tools/qa/ritual-reveal-mobile.png', ...MOBILE, fixture: FIX.early(), steps: [{ goto: '/unseal', wait: 1200 }, { click: '.orb-gate', wait: 1000 }, { evalAsync: revealRetry(2), wait: 400 }], settle: 900 },
  ],

  play: () => [
    { out: '.tools/qa/observatory-playing.png', ...DESKTOP, fixture: FIX.mid(), steps: PLAY_STEPS, settle: 400 },
    { out: '.tools/qa/observatory-playing-mobile.png', ...MOBILE, fixture: FIX.mid(), steps: PLAY_STEPS, settle: 400 },
  ],

  /* ---------- README 展示图 ---------- */
  readme: () => [
    { out: `${OUT}/readme/README-01-ARCHIVE-78.png`, ...DESKTOP, full: true, fixture: FIX.full(), goto: '/collection', wait: 2600 },
    { out: `${OUT}/readme/README-02-MAJOR-DETAIL.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/major-18', wait: 1800 },
    { out: `${OUT}/readme/README-03-UNSEAL-FAN.png`, ...DESKTOP, fixture: FIX.early(), steps: FAN_STEPS, settle: 900 },
    { out: `${OUT}/readme/README-04-FOUR-SUITS.png`, ...DESKTOP, full: true, fixture: FIX.full(), steps: [{ goto: '/collection', wait: 1500 }, FILTER_STEP(2)], wait: 2200 },
    { out: `${OUT}/readme/README-05-MOBILE.png`, ...MOBILE, fixture: FIX.full(), goto: '/collection', wait: 2400 },
  ],

  /* ---------- 比赛展示截图 ---------- */
  competition: () => [
    { out: `${OUT}/competition/competition-01-main.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/', wait: 2000 },
    { out: `${OUT}/competition/competition-02-observatory.png`, ...DESKTOP, fixture: FIX.mid(), steps: PLAY_STEPS, settle: 500 },
    { out: `${OUT}/competition/competition-03-unseal.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/unseal', wait: 1600 },
    { out: `${OUT}/competition/competition-04-reveal.png`, ...DESKTOP, fixture: FIX.early(), steps: REVEAL_STEPS, settle: 900 },
    { out: `${OUT}/competition/competition-05-archive.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/collection', wait: 2200 },
    { out: `${OUT}/competition/competition-06-detail.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/major-18', wait: 1800 },
  ],

  /* ---------- 软件使用说明截图 ---------- */
  manual: () => [
    { out: `${OUT}/manual/manual-01-main.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/', wait: 1900 },
    { out: `${OUT}/manual/manual-02-observatory.png`, ...DESKTOP, fixture: FIX.mid(), steps: PLAY_STEPS, settle: 500 },
    { out: `${OUT}/manual/manual-03-unseal.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/unseal', wait: 1500 },
    { out: `${OUT}/manual/manual-04-reveal.png`, ...DESKTOP, fixture: FIX.early(), steps: REVEAL_STEPS, settle: 900 },
    { out: `${OUT}/manual/manual-05-archive.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/collection', wait: 2200 },
    { out: `${OUT}/manual/manual-06-filter.png`, ...DESKTOP, fixture: FIX.mid(), steps: [{ goto: '/collection', wait: 1500 }, FILTER_STEP(3)], wait: 1600 },
    { out: `${OUT}/manual/manual-07-major-detail.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/major-18', wait: 1700 },
    { out: `${OUT}/manual/manual-08-minor-detail.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/minor-cups-8', wait: 1700 },
    { out: `${OUT}/manual/manual-09-court-detail.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/minor-swords-14', wait: 1700 },
    { out: `${OUT}/manual/manual-10-mobile.png`, ...MOBILE, fixture: FIX.full(), goto: '/collection', wait: 2300 },
  ],

  /* ---------- 软著截图候选 ---------- */
  sc: () => [
    { out: `${OUT}/software-copyright/SC-01-MAIN.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/', wait: 1900 },
    { out: `${OUT}/software-copyright/SC-02-OBSERVATORY.png`, ...DESKTOP, fixture: FIX.mid(), steps: PLAY_STEPS, settle: 500 },
    { out: `${OUT}/software-copyright/SC-03-UNSEAL.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/unseal', wait: 1500 },
    { out: `${OUT}/software-copyright/SC-04-ARCHIVE.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/collection', wait: 2200 },
    { out: `${OUT}/software-copyright/SC-05-MAJOR-DETAIL.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/major-18', wait: 1700 },
    { out: `${OUT}/software-copyright/SC-06-MINOR-DETAIL.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/minor-cups-8', wait: 1700 },
    { out: `${OUT}/software-copyright/SC-07-COURT-DETAIL.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/minor-swords-14', wait: 1700 },
  ],

  /* ---------- 背景变更前后（本地审计图，不提交） ---------- */
  beforeafter: () => [
    { out: `${AUDIT}/main-before.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/', wait: 1800, evalBeforeShot: beforeEval(), settle: 700 },
    { out: `${AUDIT}/main-after.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/', wait: 1800 },
    { out: `${AUDIT}/archive-before.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/collection', wait: 2000, evalBeforeShot: beforeEval(), settle: 700 },
    { out: `${AUDIT}/archive-after.png`, ...DESKTOP, fixture: FIX.mid(), goto: '/collection', wait: 2000 },
    { out: `${AUDIT}/detail-before.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/major-18', wait: 1700, evalBeforeShot: beforeEval(), settle: 700 },
    { out: `${AUDIT}/detail-after.png`, ...DESKTOP, fixture: FIX.full(), goto: '/card/major-18', wait: 1700 },
    { out: `${AUDIT}/mobile-before.png`, ...MOBILE, fixture: FIX.mid(), goto: '/collection', wait: 2000, evalBeforeShot: beforeEval(), settle: 700 },
    { out: `${AUDIT}/mobile-after.png`, ...MOBILE, fixture: FIX.mid(), goto: '/collection', wait: 2000 },
  ],

  /* ---------- Console 门禁：遍历全部路由 ---------- */
  routes: () => [
    { out: '.tools/qa/route-home.png', ...DESKTOP, fixture: FIX.mid(), goto: '/', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-starcatch.png', ...DESKTOP, goto: '/starcatch', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-unseal.png', ...DESKTOP, goto: '/unseal', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-collection.png', ...DESKTOP, goto: '/collection', wait: 1600, consoleGate: true },
    { out: '.tools/qa/route-card-major.png', ...DESKTOP, goto: '/card/major-21', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-card-court.png', ...DESKTOP, goto: '/card/minor-wands-13', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-card-sealed.png', ...DESKTOP, goto: '/card/minor-swords-10', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-card-missing.png', ...DESKTOP, goto: '/card/nope-999', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-starwhisper.png', ...DESKTOP, goto: '/starwhisper', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-settings.png', ...DESKTOP, goto: '/settings', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-about.png', ...DESKTOP, goto: '/about', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-fallback.png', ...DESKTOP, goto: '/no-such-page', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-home-mobile.png', ...MOBILE, goto: '/', wait: 1400, consoleGate: true },
    { out: '.tools/qa/route-archive-mobile.png', ...MOBILE, goto: '/collection', wait: 1600, consoleGate: true },
  ],

  console: () => [
    { out: '.tools/qa/console-main.png', ...DESKTOP, fixture: FIX.full(), goto: '/', wait: 1500, consoleGate: true },
  ],
};

const name = process.argv[2] || 'qa';
const outfile = process.argv[3] || `.tools/jobs-${name}.json`;
const fn = batches[name];
if (!fn) { console.error('unknown batch: ' + name); process.exit(1); }
writeFileSync(outfile, JSON.stringify({ base: BASE, port: 9222, jobs: fn() }, null, 2));
console.log(outfile);
