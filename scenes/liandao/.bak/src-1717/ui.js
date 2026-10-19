import { DEFAULTS, CHIME, GAUGE, WATCH_TONES } from './data.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** 让滑杆左侧的填色跟数值走 */
const pctFill = (el) => {
  const p = (Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min));
  el.style.setProperty('--fill', `${(p * 100).toFixed(1)}%`);
};

/**
 * 界面层：参数面板、潮位卡、潮信卡、景点条、解说卡、帮助、罗盘、载入条。
 * 只管 DOM——潮位、时刻、更数都由 main.js 每帧送进来。
 */
export function createUI({ stations, onChange, onSelect, onMode, onTour, onShot, onReset, onStep, onBell }) {
  const params = { ...DEFAULTS };
  const rail = $('stations');
  const info = $('info');
  const help = $('help');
  const panel = $('panel');
  const card = $('bell');
  const tide = $('tide');
  const gaugeBox = tide.querySelector('.gauge');

  /* ------------------------------------------------------------ 滑杆 */
  // [key, 滑杆 id, 读数 id, 显示格式]；onChange 一律传滑杆原值，换算交给 main.js
  const sliders = [
    ['speed', 's-speed', 'v-speed', (v) => `${v} 分/秒`],
    ['swell', 's-swell', 'v-swell', (v) => `${(v / 100).toFixed(2)}×`],
    ['crowd', 's-crowd', 'v-crowd', (v) => `${v} 人`],
    ['fleet', 's-fleet', 'v-fleet', (v) => `${v}%`],
    ['strings', 's-strings', 'v-strings', (v) => `${v}%`],
    ['glow', 's-glow', 'v-glow', (v) => (v / 100).toFixed(2)],
  ];

  sliders.forEach(([key, sid, vid, fmt]) => {
    const el = $(sid), out = $(vid);
    el.value = params[key];
    out.textContent = fmt(Number(params[key]));
    pctFill(el);
    el.addEventListener('input', () => {
      const raw = Number(el.value);
      out.textContent = fmt(raw);
      pctFill(el);
      params[key] = raw;
      onChange(key, raw, params);
    });
  });

  /* ------------------------------------------------------------ 开关 */
  const toggles = [
    ['reflect', 'c-reflect'], ['labels', 'c-labels'], ['mist', 'c-mist'],
    ['gulls', 'c-gulls'], ['tour', 'c-tour'], ['autoQuality', 'c-quality'],
  ];
  toggles.forEach(([key, cid]) => {
    const el = $(cid);
    el.checked = params[key];
    el.addEventListener('change', () => {
      params[key] = el.checked;
      onChange(key, el.checked, params);
      if (key === 'tour') onTour(el.checked);
    });
  });

  /* ------------------------------------------------------------ 潮位卡 */
  // 刻度按 data.GAUGE 生成：每 step 米一道，整米与平均海面那道长一些
  const tickRail = tide.querySelector('.tk-rail');
  const span = GAUGE.hi - GAUGE.lo;
  const pctOf = (v) => clamp(((v - GAUGE.lo) / span) * 100, 0, 100).toFixed(1);
  // 刻度取整步长的格点（-1.5 … 0 … +1.5），平均海面那道一定在，标尺端点由高/低潮线负责
  for (let v = Math.ceil(GAUGE.lo / GAUGE.step) * GAUGE.step; v <= GAUGE.hi + 1e-6; v += GAUGE.step) {
    const i = document.createElement('i');
    const near = (x) => Math.abs(x - Math.round(x)) < 1e-6;
    i.className = `tk${near(v) && Math.abs(v) < 1e-6 ? ' mean' : (near(v) ? ' m' : '')}`;
    i.style.bottom = `${pctOf(v)}%`;
    tickRail.appendChild(i);
  }
  const gLine = (sel, txt) => {
    const el = tide.querySelector(sel);
    if (el) el.textContent = txt;
  };
  gLine('.g-line.hi b', `高潮 +${GAUGE.hi.toFixed(2)}`);
  gLine('.g-line.lo b', `低潮 ${GAUGE.lo.toFixed(2)}`);
  const tideBar = $('tide-bar');
  const tideClock = $('tide-time'), tideState = $('tide-state');
  const tideValue = $('tide-value'), tideNext = $('tide-next');
  let lastTide = {};

  /* ------------------------------------------------------------ 潮信卡 */
  const btnOne = $('btn-bell-one'), btnRing = $('btn-bell-ringer'), btnStop = $('btn-bell-stop');
  btnOne.addEventListener('click', () => onBell('one'));
  btnRing.addEventListener('click', () => onBell(btnRing.classList.contains('on') ? 'stop' : 'ring'));
  btnStop.addEventListener('click', () => onBell('stop'));
  card.querySelector('.bell-count i').textContent = `/ ${CHIME.strikes} · 共五更`;
  const strikeEl = $('bell-strike'), fillEl = $('bell-fill'), watchEl = $('watch-name');

  /* ------------------------------------------------------------ 景点条 */
  const chips = stations.map((s) => {
    const b = document.createElement('button');
    b.className = 'st';
    b.textContent = s.short;
    b.title = s.name;
    b.addEventListener('click', () => onSelect(s));
    rail.appendChild(b);
    return b;
  });

  /* ------------------------------------------------------------ 模式与按钮 */
  $('mode-pano').addEventListener('click', () => setMode('pano'));
  $('mode-free').addEventListener('click', () => setMode('free'));
  function setMode(m) {
    $('mode-pano').classList.toggle('active', m === 'pano');
    $('mode-free').classList.toggle('active', m === 'free');
    onMode(m);
  }

  if (window.innerWidth < 1180) panel.classList.add('collapsed');
  $('panel-toggle').addEventListener('click', () => panel.classList.toggle('collapsed'));
  $('btn-help').addEventListener('click', () => { help.hidden = false; });
  $('help-close').addEventListener('click', () => { help.hidden = true; });
  help.addEventListener('click', (e) => { if (e.target === help) help.hidden = true; });
  $('btn-shot').addEventListener('click', () => onShot());
  $('btn-reset').addEventListener('click', () => onReset());
  $('btn-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  $('info-close').addEventListener('click', () => { info.hidden = true; });
  $('btn-defaults').addEventListener('click', () => {
    Object.assign(params, DEFAULTS);
    sliders.forEach(([key, sid, vid, fmt]) => {
      const el = $(sid);
      el.value = params[key];
      $(vid).textContent = fmt(Number(params[key]));
      pctFill(el);
      onChange(key, Number(params[key]), params, true);
    });
    toggles.forEach(([key, cid]) => { $(cid).checked = params[key]; onChange(key, params[key], params, true); });
    onTour(params.tour);
  });

  /* ------------------------------------------------------------ 键盘 */
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { help.hidden = true; info.hidden = true; onBell('stop'); }
    else if (k === 'h') help.hidden = !help.hidden;
    else if (k === 'p') setMode($('mode-pano').classList.contains('active') ? 'free' : 'pano');
    else if (k === 'f') $('btn-full').click();
    else if (k === ' ') { e.preventDefault(); $('c-tour').click(); }
    else if (k === 'b') onBell('one');
    else if (k === 'n') onBell('ring');
    else if (k === 'a' || k === 'd') onStep(k === 'd' ? 1 : -1);
  });

  const loader = $('loader'), bar = $('loader-bar'), step = $('loader-step');

  return {
    params,
    setMode,

    setActive(id) {
      stations.forEach((s, i) => chips[i].classList.toggle('active', s.id === id));
    },

    showInfo(s) {
      $('info-title').textContent = s.name;
      $('info-era').textContent = s.era;
      $('info-lead').textContent = s.lead;
      $('info-body').textContent = s.body;
      const ul = $('info-tags');
      ul.textContent = '';
      s.tags.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
      info.hidden = false;
    },
    hideInfo() { info.hidden = true; },

    /**
     * 潮位卡：时刻、潮态、潮位、水位标、距转流。
     * level 是相对平均海面的米数，标尺范围取 GAUGE。
     */
    setClock(hhmm, tideWord, level, nextTurnH) {
      if (lastTide.hhmm !== hhmm) { tideClock.textContent = hhmm; lastTide.hhmm = hhmm; }
      if (lastTide.word !== tideWord) {
        tideState.textContent = tideWord;
        const kind = tideWord.includes('平流') ? 'slack' : (tideWord.includes('涨') ? 'flood' : 'ebb');
        tide.dataset.kind = kind;
        lastTide.word = tideWord;
      }
      const meter = `${level >= 0 ? '+' : '−'}${Math.abs(level).toFixed(2)}`;
      if (lastTide.meter !== meter) { tideValue.textContent = meter; lastTide.meter = meter; }
      const p = clamp(((level - GAUGE.lo) / (GAUGE.hi - GAUGE.lo)) * 100, 0, 100);
      const pctTxt = `${p.toFixed(1)}%`;
      if (lastTide.pct !== pctTxt) {
        tideBar.style.height = pctTxt;
        // 水面那道亮线 + 标尺右边的指针都读这个百分比
        if (gaugeBox) gaugeBox.style.setProperty('--tide', pctTxt);
        lastTide.pct = pctTxt;
      }
      const nextTxt = `距转流 ${Number(nextTurnH).toFixed(1)} 小时`;
      if (lastTide.next !== nextTxt) { tideNext.textContent = nextTxt; lastTide.next = nextTxt; }
    },

    /** 潮信卡：第几更 / 共五更、进度条、当前更的天色 */
    setBell(count, ringing, watch) {
      strikeEl.textContent = String(count);
      fillEl.style.width = `${clamp((count / CHIME.strikes) * 100, 0, 100).toFixed(1)}%`;
      card.classList.toggle('tolling', !!ringing);
      btnStop.hidden = !ringing;
      btnRing.classList.toggle('on', !!ringing);
      const w = watch || WATCH_TONES[Math.max(0, count - 1)];
      if (count === 0 && !ringing) {
        watchEl.textContent = '未起更 · 一夜五更，潮信到拂晓';
        watchEl.style.removeProperty('--hue');
      } else if (w) {
        watchEl.textContent = `${w.name} · 第 ${count} 更`;
        watchEl.style.setProperty('--hue', w.hue);
      }
    },
    bellNote(msg) { $('bell-note').textContent = msg; },

    setFps(v, warn) {
      const el = $('fps');
      el.textContent = `${v} fps`;
      el.classList.toggle('warn', !!warn);
    },
    setCompass(yawDeg) {
      $('compass-rose').setAttribute('transform', `rotate(${Number(yawDeg).toFixed(2)})`);
    },
    perfHint(msg) { $('perf-hint').textContent = msg || ''; },
    loading(p, text) {
      bar.style.width = `${Math.round(p * 100)}%`;
      if (text) step.textContent = text;
    },
    loaded() { loader.classList.add('done'); },
  };
}
