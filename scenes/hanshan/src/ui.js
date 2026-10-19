import { DEFAULTS, BELL } from './data.js';

const $ = (id) => document.getElementById(id);
const pctFill = (el) => {
  const p = (el.value - el.min) / (el.max - el.min);
  el.style.setProperty('--fill', `${(p * 100).toFixed(1)}%`);
};

export function createUI({ stations, onChange, onSelect, onMode, onTour, onShot, onReset, onStep, onBell }) {
  const params = { ...DEFAULTS };
  const rail = $('stations');
  const info = $('info');
  const help = $('help');
  const panel = $('panel');
  const bell = $('bell');

  const sliders = [
    ['lantern', 's-lantern', 'v-lantern', (v) => `${v}%`, (v) => v / 100],
    ['crowd', 's-crowd', 'v-crowd', (v) => `${v}`, (v) => v],
    ['ripple', 's-ripple', 'v-ripple', (v) => (v / 100).toFixed(2), (v) => v / 100],
    ['boat', 's-boat', 'v-boat', (v) => (v / 100).toFixed(2), (v) => v / 100],
    ['leaf', 's-leaf', 'v-leaf', (v) => (v / 100).toFixed(2), (v) => v / 100],
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
    ['reflect', 'c-reflect'], ['labels', 'c-labels'], ['frost', 'c-frost'],
    ['crows', 'c-crows'], ['tour', 'c-tour'], ['autoQuality', 'c-quality'],
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

  /* ---------------------------------------------------------------- bell */
  const btnOne = $('btn-bell-one'), btnRing = $('btn-bell-ringer'), btnStop = $('btn-bell-stop');
  btnOne.addEventListener('click', () => onBell('one'));
  btnRing.addEventListener('click', () => onBell(btnRing.classList.contains('on') ? 'stop' : 'ring'));
  btnStop.addEventListener('click', () => onBell('stop'));

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
    /** 撞钟计数：ringing 时高亮卡片，并让"止"按钮接管 */
    setBell(count, ringing) {
      $('bell-strike').textContent = String(count);
      $('bell-fill').style.width = `${Math.min(100, (count / BELL.strikes) * 100).toFixed(1)}%`;
      bell.classList.toggle('tolling', !!ringing);
      btnStop.hidden = !ringing;
      btnRing.classList.toggle('on', !!ringing);
      btnRing.textContent = ringing ? '止钟' : '撞满一百八';
    },
    bellNote(msg) { $('bell-note').textContent = msg; },
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
    loaded() { loader.classList.add('done'); },
  };
}
