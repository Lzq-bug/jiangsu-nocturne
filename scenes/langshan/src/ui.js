import { DEFAULTS } from './data.js';

const $ = (id) => document.getElementById(id);
const pctFill = (el) => {
  const p = (el.value - el.min) / (el.max - el.min);
  el.style.setProperty('--fill', `${(p * 100).toFixed(1)}%`);
};

export function createUI({ stations, onChange, onSelect, onMode, onTour, onRobe, onShot, onReset, onStep }) {
  const params = { ...DEFAULTS };
  const rail = $('stations');
  const info = $('info');
  const help = $('help');
  const panel = $('panel');

  const sliders = [
    ['lantern', 's-lantern', 'v-lantern', (v) => `${v}%`, (v) => v / 100],
    ['robe', 's-robe', 'v-robe', (v) => `${(v / 100).toFixed(2)}`, (v) => v / 100],
    ['ripple', 's-ripple', 'v-ripple', (v) => (v / 100).toFixed(2), (v) => v / 100],
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
    ['reflect', 'c-reflect'], ['labels', 'c-labels'], ['tour', 'c-tour'], ['autoQuality', 'c-quality'],
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

  /** 把滑块拖到某个 robe 值（动画进行中时要跟着走，不然面板和画面对不上） */
  function setRobeSlider(v) {
    const el = $('s-robe');
    if (!el) return;
    const raw = Math.round(v * 100);
    el.value = raw;
    params.robe = raw;
    $('v-robe').textContent = v.toFixed(2);
    pctFill(el);
  }

  $('btn-robe').addEventListener('click', () => onRobe());

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
    if (k === 'escape') { help.hidden = true; info.hidden = true; }
    else if (k === 'h') help.hidden = !help.hidden;
    else if (k === 'p') setMode($('mode-pano').classList.contains('active') ? 'free' : 'pano');
    else if (k === 'f') $('btn-full').click();
    else if (k === ' ') { e.preventDefault(); $('c-tour').click(); }
    else if (k === 'r') onRobe();
    else if (k === 'a' || k === 'd') onStep(k === 'd' ? 1 : -1);
  });

  const loader = $('loader'), bar = $('loader-bar'), step = $('loader-step');
  return {
    params,
    setMode,
    setRobeSlider,
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
    setFps(v, warn) {
      const el = $('fps');
      el.textContent = `${v} fps`;
      el.classList.toggle('warn', !!warn);
    },
    setCompass(yawDeg) {
      $('compass-rose').setAttribute('transform', `rotate(${yawDeg.toFixed(2)})`);
    },
    perfHint(msg) { $('perf-hint').textContent = msg || ''; },
    loading(p, text) {
      bar.style.width = `${Math.round(p * 100)}%`;
      if (text) step.textContent = text;
    },
    loaded() { loader.classList.add('done'); },
  };
}
