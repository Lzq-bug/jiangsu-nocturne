import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter, lit } from './kit.js';
import { buildSky } from './sky.js';
import { buildTerrain } from './terrain.js';
import { buildWaters, buildBeds, LightColumns, Reflections } from './water.js';
import { buildHill } from './rockery.js';
import { buildArchitecture } from './buildings.js';
import { buildPlants } from './plants.js';
import { buildProps } from './props.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, RESERVOIR, groundAt, clamp01 } from './data.js';

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
renderer.toneMappingExposure = 1.42;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.4, 12000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.34, 0.55, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
/** handle for scripting the camera from the console and from tools/shoot.mjs */
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, set, shot };
window.huaguo = api;
let ui, sky, terrain, hill, arch, plants, props, water, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  veil: 1, tower: 1, climb: 1, cloud: 0.62, ripple: 1, wind: 1,
  bloom: 0.34, carvings: true, reflect: true, labels: true, tour: false, autoQuality: true,
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
/**
 * 机位不写死高度：除了海上与鸟瞰那两个真的悬在水与云里，其余全部按
 * groundAt 取站处地面，桥上那一个改用桥面实高。改了山形，人不会悬空。
 */
function syncStations() {
  const deck = arch.built.bridge.deckY;
  for (const s of STATIONS) {
    if (!s.stand) continue;
    const [x, z, eye] = s.stand;
    const y = s.id === 'gate' ? deck : groundAt(x, z);
    s.pos = [x, y + eye, z];
  }
  // 洞内那一眼要在腔子里，洞槛高度由岩体给
  const inner = STATIONS.find((s) => s.id === 'inner');
  if (inner && hill) {
    const [x, z, eye] = inner.stand;
    inner.pos = [x, hill.mouth.y + eye, z];
  }
}

function fovFor(s) {
  if (s.id === 'aerial') return 42;
  if (s.id === 'sea') return 46;
  if (s.id === 'peak') return 62;
  if (s.id === 'curtain' || s.id === 'inner' || s.id === 'gate') return 60;
  if (s.id === 'pagoda') return 50;
  return 56;
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = fovFor(s);
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 2.4, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 2.1 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false, fov: fovFor(s) });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'veil':
      state.veil = value;
      hill.veil.setOpen(clamp01(1 - value));
      hill.veil.setFlow(Math.min(1, Math.max(0, value)));
      break;
    case 'tower': state.tower = value; props.setTower(value); break;
    case 'climb': state.climb = value; props.setClimb(value); break;
    case 'cloud': state.cloud = value; sky.setCloud(value); break;
    case 'ripple': state.ripple = value; break;
    case 'wind':
      state.wind = value;
      for (const u of plants.windUniforms) u.uWind.value = value;
      break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'carvings': state.carvings = value; props.setCarvings(value); break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/** 给深链与控制台用：一次把参数落到界面与画面上 */
function set(key, value) {
  if (!(key in state)) return;
  state[key] = value;
  if (ui) ui.sync(key, value);
  onParam(key, value);
}

/* ------------------------------------------------------------------ quality ladder */
const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关掉水库里的塔影；这座山要看的是一径灯和两面海，倒影不是非有不可。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ loop */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  sky.update(t);
  water.update(t, state.ripple);
  hill.veil.update(t, Math.min(1, state.veil));
  props.update(t, 1);
  columns.update(t, state.ripple, 0.72 + 0.5 * Math.min(1.4, state.climb));
  if (reflections.enabled) reflections.update(t, state.ripple);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 13 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
  }
  ui.setCompass(THREE.MathUtils.radToDeg(rig.yaw));

  composer.render();
  if (wantShot) { shot(); wantShot = false; }

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

function shot() {
  const s = STATIONS[stationIndex];
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `花果山夜景-${s.short}.png`;
    a.click();
  } catch (e) { console.warn('截图失败', e); }
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  ui = createUI({
    stations: STATIONS,
    onChange: onParam,
    onSelect: (s) => goToStation(STATIONS.indexOf(s)),
    onMode: setMode,
    onTour: (v) => onParam('tour', v),
    onShot: () => { wantShot = true; },
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? fovFor(STATIONS[stationIndex]) : 50); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.05, '铺开夜色…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起月与星…');
  sky = buildSky(scene);
  await nextFrame();

  ui.loading(0.3, '把山从海里立起来…');
  terrain = buildTerrain(scene);
  columns = new LightColumns(scene, 420);
  columns.mesh.name = 'columns';
  columns.mesh.renderOrder = 5;
  water = buildWaters(scene);
  buildBeds(scene, lit('#0a1116', { rough: 0.98, side: THREE.DoubleSide }));
  reflections = new Reflections(scene, { waterY: RESERVOIR.y, amp: 0.22, fade: 30 });
  await nextFrame();

  ui.loading(0.5, '垒西壁、开人字洞…');
  hill = buildHill(scene);
  await nextFrame();

  ui.loading(0.64, '架桥、立宫、起宋塔…');
  arch = buildArchitecture(scene);
  reflections.add(arch.group);
  await nextFrame();

  ui.loading(0.78, '栽松万个…');
  plants = buildPlants(scene);
  await nextFrame();

  ui.loading(0.9, '点一径山灯…');
  props = buildProps(scene, {
    anchors: [...arch.anchors, ...hill.anchors],
    carvings: arch.carvings.concat(hill.carvings),
    towerTiers: arch.towerTiers,
    shoreLamps: terrain.shoreLamps,
    townLamps: terrain.townLamps,
    causewayLamps: terrain.causewayLamps,
    bridge: arch.built.bridge,
  });
  for (const [x, y, z, color, w, d] of props.waterLamps) {
    columns.add([x, y, z], color, w, d);
  }
  // 海上那几点渔火也拖一道短柱，水面才不空
  for (const f of props.fish) columns.add([f.sprite.position.x, 0.4, f.sprite.position.z], '#cfe6f2', 1.6, 12, 0.5);
  syncStations();
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
    viewRange: 900,
  });
  hotspots.labelsVisible = true;
  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false, fov: fovFor(STATIONS[0]) });
  rig.setFov(fovFor(STATIONS[0]));
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 15000);
  hotspots.setCurrent(STATIONS[0].id);
  onParam('veil', state.veil);
  onParam('tower', state.tower);
  onParam('climb', state.climb);
  onParam('cloud', state.cloud);
  onParam('wind', state.wind);
  onParam('carvings', state.carvings);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  await nextFrame();

  // one warm-up render so the shaders compile before the curtain lifts
  composer.render();
  ui.loading(1, '山海一夜…');
  await new Promise((r) => setTimeout(r, 240));
  ui.loaded();
  Object.assign(api, { hill, arch, props, hotspots, terrain, sky, water, columns });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * 深链：#station=curtain&bare 与 ?st=curtain&bare=1 都吃；
 * 场景自有参数 veil / tower / climb / cloud / ripple / wind / bloom 直接给数，
 * 且必须连当前值一起落位——SwiftShader 下一张静帧只有十几帧，靠时间推不动。
 */
function applyDeepLink() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const get = (k) => (q.has(k) ? q.get(k) : h.has(k) ? h.get(k) : null);
  const num = (k) => { const v = get(k); return v === null ? null : Number(v); };

  if (get('bare') !== null && get('bare') !== '0') {
    document.body.classList.add('bare');
    hotspots.grp.visible = false;
    document.getElementById('loader').style.display = 'none';
  }
  for (const [key, scale] of [['veil', 1], ['tower', 1], ['climb', 1], ['cloud', 1], ['ripple', 1], ['wind', 1], ['bloom', 1]]) {
    const v = num(key);
    if (v !== null) set(key, v * scale);
  }
  // 定位画面 bug 用：?clear=ff00ff 把清屏色改掉，?hide=liandao,isles 直接关掉整组东西
  if (get('bloomoff') === '1') bloom.enabled = false;
  const clear = get('clear');
  if (clear) renderer.setClearColor(`#${clear}`, 1);
  const hide = get('hide');
  if (hide) {
    for (const n of hide.split(',')) {
      const o = scene.getObjectByName(n.trim());
      if (o) o.visible = false; else console.warn('没有这个对象名：', n);
    }
  }
  for (const key of ['carvings', 'reflect', 'labels']) {
    const v = get(key);
    if (v !== null) set(key, v !== '0');
  }
  const want = get('st') || get('station');
  const idx = want === null ? -1 : STATIONS.findIndex((s) => s.id === want);
  if (idx >= 0) { goToStation(idx, { info: false, animate: false }); return; }
  const eye = get('eye');
  if (eye) {
    const at = (get('at') || '-400,300,150').split(',').map(Number);
    rig.goTo(eye.split(',').map(Number), at, { animate: false, fov: num('fov') || 55 });
  }
}

boot().then(() => {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
}).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
