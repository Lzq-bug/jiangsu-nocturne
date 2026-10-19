import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials } from './kit.js';
import { buildEnvironment } from './environment.js';
import { buildQuarter, LAYOUT } from './architecture.js';
import { buildProps } from './props.js';
import { buildInteriors } from './interiors.js';
import { buildPortals } from './portals.js';
import { buildWater, LightColumns, Reflections, PondRings } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { NightGarden } from './performance.js';
import { STATIONS, SHOW } from './data.js';

const canvas = document.getElementById('stage');
// rAF is frozen in a background tab, so each build step also has a timer fallback
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 1000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.46, 0.68, 1.04);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, props, water, columns, reflections, rings, hotspots, quarter, portals, interiors, show;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  lantern: 1, ripple: 1, tempo: 1, crowd: 70, bloom: 0.46,
  reflect: true, labels: true, mist: true, title: true, tour: false, autoQuality: true,
};

/* ------------------------------------------------------------------ sizing */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ stations */
function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.7 });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.5 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
  const act = show && show.item;
  if (act && act.place === s.id) billHint(act);
  else ui.billNote('按 N 开戏，逐点轮演；按 B 在小山丛桂轩投一箭。');
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ 戏报 */
function refreshBill() {
  const item = show.item;
  const p = show.progress();
  ui.setBill({
    index: show.i, item, playing: show.playing,
    show: p.show, clock: show.gardenClock(),
  });
}

function billHint(item) {
  ui.billNote(`${item.placeName}：${item.kind}，压过了檐下的灯才听得清。`);
}

function onShow(kind) {
  const t = clock.elapsedTime;
  if (kind === 'start') show.start(t);
  else if (kind === 'stop') show.stop();
  else if (kind === 'toggle') show.toggle(t);
  else if (kind === 'next') {
    show.next(t);
    const item = show.item;
    if (item) {
      const i = STATIONS.findIndex((s) => s.id === item.place);
      if (i >= 0) goToStation(i, { info: false });
    }
  }
  refreshBill();
}

function onThrow() {
  const item = show.item;
  if (item && item.place !== 'xiaoshan') ui.billNote('投壶在小山丛桂轩，戏到那一处才轮得着。');
  const hit = props.hu.throwOne(clock.elapsedTime);
  ui.billNote(hit ? '一箭入壶，轩前有人低声叫好。' : '箭落在壶口外，差半尺。');
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; props.field.setDensity(value); props.lotus.setDensity(value); props.strings.uni.uOn.value = Math.min(1, 0.25 + value); break;
    case 'crowd': state.crowd = value; break;
    case 'ripple': state.ripple = value; break;
    case 'tempo': state.tempo = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'mist': state.mist = value; env.setMist(value); break;
    case 'title': state.title = value; props.titles.setEnabled(value); break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ quality ladder */
const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭池中倒影；园灯与戏台上的身段仍按你设定的密度。',
  ];
  ui.perfHint(notes[level] || '');
}

function crowdTarget() {
  const cap = [220, 170, 120][Math.min(2, qualityLevel)];
  return Math.min(state.crowd, cap);
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t, dt);
  show.update(t, dt, state.tempo);
  const item = show.item;
  props.field.update(t);
  props.lotus.update(t);
  props.strings.uni.uTime.value = t;
  props.stage.update(t, dt, item ? item.place : null);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);
  props.hu.update(t, dt);
  props.titles.update(dt);
  water.update(t, state.ripple);
  columns.update(t, state.ripple, 0.75 + 0.45 * Math.min(1, state.lantern));
  if (reflections.enabled) reflections.update(t, state.ripple);
  interiors.update(t);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  env.declutter(camera.position);
  portals.update(t, camera.position);

  // 一盏暖光跟着当前点位走，戏没开就只留极弱的一线
  const at = item ? LAYOUT.stage[item.place] : null;
  if (at) {
    env.stageLight.position.set(at.x, at.y + 2.6, at.z);
    env.stageLight.color.set(item.lamp);
    env.stageLight.intensity = 12 + 5 * Math.sin(t * 2.2);
  } else {
    env.stageLight.intensity = 0;
  }

  if (show.playing) refreshBill();
  if (state.tour) {
    tourClock += dt;
    if (tourClock > 11 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
  }
  ui.setCompass(THREE.MathUtils.radToDeg(rig.yaw));

  composer.render();
  if (wantShot) { capture(); wantShot = false; }

  frames++; fpsAcc += dt;
  if (fpsAcc > 0.75) {
    const fps = Math.round(frames / fpsAcc);
    ui.setFps(fps, fps < 30);
    frames = 0; fpsAcc = 0;
    if (state.autoQuality && t > 5) {
      if (fps < 20) lowStreak++; else lowStreak = Math.max(0, lowStreak - 2);
      if (lowStreak >= 8 && qualityLevel < 2) { applyQuality(qualityLevel + 1); lowStreak = 0; }
    }
  }
  requestAnimationFrame(frame);
}

function capture() {
  const s = STATIONS[stationIndex];
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `网师夜花园-${s.short}.png`;
    a.click();
  } catch (e) { /* canvas may be tainted in unusual setups */ }
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  rings = new PondRings();
  ui = createUI({
    stations: STATIONS,
    onChange: onParam,
    onSelect: (s) => goToStation(STATIONS.indexOf(s)),
    onMode: setMode,
    onTour: (v) => onParam('tour', v),
    onShot: () => { wantShot = true; },
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 62 : 55); },
    onStep: (d) => goToStation(stationIndex + d),
    onShow,
    onThrow,
  });
  ui.loading(0.04, '铺开彩霞池夜色…');
  ui.setBill({ index: -1, item: null, playing: false, show: 0, clock: { text: '—', batch: 0 } });

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起那轮低月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.38, '起宅、垒岸、架桥…');
  quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.56, '点亮檐下与廊间…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  props = buildProps(scene, columns, quarter.anchors, LAYOUT);
  await nextFrame();

  ui.loading(0.70, '撑起堂屋与书斋…');
  interiors = buildInteriors(scene);
  await nextFrame();

  ui.loading(0.80, '放下半亩池水…');
  water = buildWater(scene, rings);
  reflections = new Reflections(scene);
  reflections.add(quarter.group);
  await nextFrame();

  ui.loading(0.90, '安顿听客与身段…');
  show = new NightGarden({
    rings,
    stageAt: (place) => LAYOUT.stage[place] || null,
    onItem: (item) => {
      props.crowd.retarget(item ? item.place : null);
      if (item) props.titles.show(item.place, item.lines, item.title);
      else props.titles.show(null, [], '');
      refreshBill();
      if (item) billHint(item);
    },
    onLine: (line, idx, item) => {
      if (!item) return;
      props.titles.show(item.place, item.lines.slice(0, idx + 1), item.title);
      ui.billNote(line || `${item.placeName}：${item.kind}`);
    },
    onEnd: () => ui.billNote('本场散场，灯次第收小，池面又平了。'),
  });
  portals = buildPortals(scene, rig);
  portals.onSpace = (space) => { hotspots.exteriorShown = space === 'exterior'; };
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;

  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false });
  rig.setFov(62);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // one warm-up render so shaders compile before the curtain lifts
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '十步一戏…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  // handle for scripting the camera and reading scene stats from the console
  window.wangshi = {
    scene, camera, renderer, composer, rig, bloom, STATIONS, SHOW, LAYOUT,
    goToStation, setMode, portals, show, props, columns, env, water, reflections, state,
  };
  // ?st=yanying 直接落到某个点位，便于逐点位截图与回归对比
  const qs = new URLSearchParams(location.search);
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  // ?show=8 让戏开到第几出（无头截图里场景时间走得极慢，先预置进度）
  const sw = qs.get('show');
  if (sw !== null) {
    show.start(clock.elapsedTime + 0.5);
    show.seek(Math.max(0, Math.min(SHOW.length - 1, Number(sw))), clock.elapsedTime + 0.5);
    for (const age of [0.3, 1.1, 2.2]) rings.emit(2.0, 8.6, clock.elapsedTime - age, 0.8);
    refreshBill();
  }
  requestAnimationFrame(frame);
}

// hotspot taps come through the rig
function bindTap() {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const door = portals.pick(ndc, camera);
    if (door) { portals.use(door); return; }
    const hit = hotspots.pick(ndc, camera);
    if (hit) { goToStation(STATIONS.indexOf(hit)); return; }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(props.hu.group, true).length) onThrow();
  };
  // E walks through whatever doorway you are standing in front of
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e' || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    portals.use(portals.nearest(camera.position));
  });
}

boot().then(bindTap).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
