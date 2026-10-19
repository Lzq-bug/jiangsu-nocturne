import { DEFAULTS, SEASONS } from './data.js';

const $ = (id) => document.getElementById(id);
const pctFill = (el) => {
  const p = (el.value - el.min) / (el.max - el.min);
  el.style.setProperty('--fill', `${(p * 100).toFixed(1)}%`);
};

export function createUI({ stations, onChange, onSelect, onMode, onTour, onShot, onReset, onStep, onSeason }) {
  const params = { ...DEFAULTS };
  const rail = $('stations');
  const info = $('info');
  const help = $('help');
  const panel = $('panel');
  const card = $('seasons');

  const sliders = [
    ['lantern', 's-lantern', 'v-lantern', (v) => `${v}%`, (v) => v / 100],
    ['bamboo', 's-bamboo', 'v-bamboo', (v) => (v / 100).toFixed(2), (v) => v / 100],
    ['mist', 's-mist', 'v-mist', (v) => (v / 100).toFixed(2), (v) => v / 100],
    ['moon', 's-moon', 'v-moon', (v) => (v / 100).toFixed(2), (v) => v / 100],
    ['window', 's-window', 'v-window', (v) => (v / 100).toFixed(2), (v) => v / 100],
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
    ['labels', 'c-labels'], ['snow', 'c-snow'], ['wind', 'c-wind'],
    ['tour', 'c-tour'], ['autoQuality', 'c-quality'],
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

  /* ------------------------------------------------------------ 四季 */
  const btns = SEASONS.map((s) => {
    const b = document.createElement('button');
    b.className = 'sea';
    b.textContent = s.name;
    b.title = `${s.hill} · ${s.note}`;
    b.dataset.season = s.id;
    b.addEventListener('click', () => onSeason(s.id, 'manual'));
    card.querySelector('.sea-btns').appendChild(b);
    return b;
  });
  const btnAuto = document.createElement('button');
  btnAuto.className = 'sea auto';
  btnAuto.textContent = '随游线';
  btnAuto.title = '走到哪座山，就换成那一季的月色';
  btnAuto.addEventListener('click', () => onSeason('auto', 'manual'));
  card.querySelector('.sea-btns').appendChild(btnAuto);

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
    onSeason('auto', 'manual');
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    const idx = ['', '1', '2', '3', '4'].indexOf(e.key);
    if (k === 'escape') { help.hidden = true; info.hidden = true; }
    else if (k === 'h') help.hidden = !help.hidden;
    else if (k === 'p') setMode($('mode-pano').classList.contains('active') ? 'free' : 'pano');
    else if (k === 'f') $('btn-full').click();
    else if (k === ' ') { e.preventDefault(); $('c-tour').click(); }
    else if (k === 'x') $('c-snow').click();
    else if (k === 'w') $('c-wind').click();
    else if (idx >= 1) onSeason(SEASONS[idx - 1].id, 'manual');
    else if (e.key === '0') onSeason('auto', 'manual');
    else if (k === 'a' || k === 'd') onStep(k === 'd' ? 1 : -1);
  });

  const loader = $('loader'), bar = $('loader-bar'), step = $('loader-step');
  return {
    params,
    setMode,
    setActive(id) {
      stations.forEach((s, i) => chips[i].classList.toggle('active', s.id === id));
    },
    /** 四季卡：当前季高亮，并把这一季的月色文案写在下面 */
    setSeason(id, touched = false) {
      const s = SEASONS.find((x) => x.id === id);
      btns.forEach((b) => b.classList.toggle('active', !!s && b.dataset.season === s.id));
      btnAuto.classList.toggle('active', id === 'auto');
      $('season-name').textContent = s ? `${s.name} · ${s.hill}` : '随游线换挡';
      $('season-note').textContent = s ? s.note : '走到哪座山，就换成那一季的月色。';
      card.classList.toggle('touched', !!touched);
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
