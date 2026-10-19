import { DEFAULTS, SHOW } from './data.js';

const $ = (id) => document.getElementById(id);
const pctFill = (el) => {
  const p = (el.value - el.min) / (el.max - el.min);
  el.style.setProperty('--fill', `${(p * 100).toFixed(1)}%`);
};

export function createUI({ stations, onChange, onSelect, onMode, onTour, onShot, onReset, onStep, onShow, onThrow }) {
  const params = { ...DEFAULTS };
  const rail = $('stations');
  const info = $('info');
  const help = $('help');
  const panel = $('panel');
  const bill = $('bill');

  const sliders = [
    ['lantern', 's-lantern', 'v-lantern', (v) => `${v}%`, (v) => v / 100],
    ['crowd', 's-crowd', 'v-crowd', (v) => `${v}`, (v) => v],
    ['ripple', 's-ripple', 'v-ripple', (v) => (v / 100).toFixed(2), (v) => v / 100],
    ['tempo', 's-tempo', 'v-tempo', (v) => (v / 100).toFixed(2), (v) => v / 100],
    ['bloom', 's-bloom', 'v-bloom', (v) => (v / 100).toFixed(2), (v) => v / 100],
  ];

  sliders.forEach(([key, sid, vid, fmt, scale]) => {
    const el = $(sid), out = $(vid);
    el.value = params[key];
    out.textContent = fmt(Number(params[key]));
    pctFill(el);
    el.addEventListener('input', () => {
      const raw = Number(el.value);
      out.textContent = fmt(raw);
      pctFill(el);
      params[key] = raw;
      onChange(key, scale(raw), params);
    });
  });

  const toggles = [
    ['reflect', 'c-reflect'], ['labels', 'c-labels'], ['mist', 'c-mist'],
    ['title', 'c-title'], ['tour', 'c-tour'], ['autoQuality', 'c-quality'],
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

  /* ---------------------------------------------------------------- 戏报 */
  const btnNext = $('btn-bill-next'), btnRing = $('btn-bill-ring'), btnStop = $('btn-bill-stop');
  btnNext.addEventListener('click', () => onShow('next'));
  btnRing.addEventListener('click', () => onShow(btnRing.classList.contains('on') ? 'stop' : 'start'));
  btnStop.addEventListener('click', () => onShow('stop'));
  $('bill-total').textContent = `/${SHOW.length}`;

  const chips = stations.map((s) => {
    const b = document.createElement('button');
    b.className = 'st';
    b.textContent = s.short;
    b.title = s.name;
    b.addEventListener('click', () => onSelect(s));
    rail.appendChild(b);
    return b;
  });

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
    sliders.forEach(([key, sid, vid, fmt, scale]) => {
      const el = $(sid);
      el.value = params[key];
      $(vid).textContent = fmt(Number(params[key]));
      pctFill(el);
      onChange(key, scale(Number(params[key])), params, true);
    });
    toggles.forEach(([key, cid]) => { $(cid).checked = params[key]; onChange(key, params[key], params, true); });
    onTour(params.tour);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { help.hidden = true; info.hidden = true; onShow('stop'); }
    else if (k === 'h') help.hidden = !help.hidden;
    else if (k === 'p') setMode($('mode-pano').classList.contains('active') ? 'free' : 'pano');
    else if (k === 'f') $('btn-full').click();
    else if (k === ' ') { e.preventDefault(); $('c-tour').click(); }
    else if (k === 'b') onThrow();
    else if (k === 'n') onShow('toggle');
    else if (k === 'm') onShow('next');
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
    /** 戏报卡：当前第几出、在哪个点位、园中时刻与进度 */
    setBill({ index, item, playing, show, clock }) {
      $('bill-item').textContent = String(index + 1);
      $('bill-total').textContent = `/${SHOW.length}`;
      $('bill-now').textContent = item ? `${item.title} · ${item.kind}` : '未开戏';
      $('bill-place').textContent = item
        ? `${item.placeName}　园中时刻 ${clock.text} · 第 ${clock.batch} 拨`
        : '按 N 开戏，逐点轮演';
      $('bill-fill').style.width = `${(playing ? show * 100 : 0).toFixed(1)}%`;
      bill.classList.toggle('tolling', !!playing);
      btnStop.hidden = !playing;
      btnRing.classList.toggle('on', !!playing);
      btnRing.textContent = playing ? '止戏' : '开戏';
    },
    billNote(msg) { $('bill-note').textContent = msg; },
    setFps(v, warn) {
      const el = $('fps');
      el.textContent = `${v} fps`;
      el.classList.toggle('warn', !!warn);
    },
    setCompass(yawDeg) {
      $('compass-rose').setAttribute('transform', `rotate(${(yawDeg).toFixed(2)})`);
    },
    perfHint(msg) { $('perf-hint').textContent = msg || ''; },
    loading(p, text) {
      bar.style.width = `${Math.round(p * 100)}%`;
      if (text) step.textContent = text;
    },
    loaded() {
      loader.classList.add('done');
      if (location.hash.includes('bare')) document.body.classList.add('bare');
    },
  };
}
