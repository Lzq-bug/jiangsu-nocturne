import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildSky } from './sky.js';
import { buildLand } from './land.js';
import { buildWaters, buildWaterBed, LightColumns, Reflections, FOG_COLOR, FOG_DENSITY } from './water.js';
import { buildHouses } from './houses.js';
import { buildBridges } from './bridges.js';
import { buildGarden } from './garden.js';
import { buildCompounds } from './compounds.js';
import { buildIslet } from './islet.js';
import { buildBoats } from './boats.js';
import { buildPlants } from './plants.js';
import { buildProps } from './props.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS, BANK, DEP, PLAIN_Y, onLand, DEFAULTS, ISLET } from './data.js';

const canvas = document.getElementById('stage');
// 后台标签里 rAF 会冻住，所以每一步都再挂一个定时器兜底
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(go);
  setTimeout(go, 60);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 4200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.3, 0.5, 0.98);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
const api = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, setWalk };
window.tongli = api;
let ui, sky, land, waters, columns, reflections, houses, bridges, garden, compounds, islet, boats, plants, props, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  lantern: DEFAULTS.lantern / 100, window: DEFAULTS.window / 100, float: DEFAULTS.float / 100,
  ripple: DEFAULTS.ripple / 100, bloom: DEFAULTS.bloom / 100,
  walk: false, reflect: true, labels: true, tour: false, autoQuality: true,
};
/** 三桥各自亮到多少，向 target 缓动；走三桥的次序就是这里的编号次序 */
const chain = { taiping: 0.34, jili: 0.7, changqing: 0.34 };
const chainTarget = { taiping: 0.34, jili: 0.7, changqing: 0.34 };

/* ------------------------------------------------------------------ 尺寸 */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ 地面 */

/** 站脚的高：地上是岸顶，圩上是堤顶，洲上有洲顶，水里就当我们站在船头 */
function groundAt(x, z) {
  if (onLand(x, z)) return BANK;
  if (Math.hypot(x - ISLET.x, z - ISLET.z) < ISLET.r + 8) return ISLET.y;
  for (const b of LAND_EDGES) {
    if (Math.abs(x - b.x) < b.w && Math.abs(z - b.z) < b.d) return DEP;
  }
  if (Math.abs(x) > 900 || Math.abs(z) > 700) return PLAIN_Y;
  return 0;
}
/** 圩岸的包围盒：四条堤的中间点与半跨，够机位站上去 */
const LAND_EDGES = [
  { x: -615, z: -560, w: 300, d: 60 }, { x: 515, z: -604, w: 360, d: 60 },
  { x: -505, z: 634, w: 340, d: 50 }, { x: 425, z: 620, w: 370, d: 60 },
  { x: -960, z: 10, w: 60, d: 440 }, { x: 920, z: -140, w: 60, d: 300 },
];

/* ------------------------------------------------------------------ 机位 */

function resolveStations() {
  for (const s of STATIONS) {
    const [bx, bz] = s.at;
    let by = s.floorY !== undefined ? s.floorY : groundAt(bx, bz);
    if (by < 0.35) by = 0.35;                 // 站在水上就当是船头
    s.pos = [bx, by + (s.hOff ?? 1.7), bz];

    const [lx, lz, lift] = s.look;
    s.look = [lx, groundAt(lx, lz) + (lift ?? 0), lz];

    if (s.mark) {
      const [mx, mz, mlift] = s.mark;
      s.mark = [mx, groundAt(mx, mz) + (mlift ?? 3), mz];
    }
  }
  // 船底那一站跟着船走：把眼位摆到吉利桥下的水面上
  const s = STATIONS.find((x) => x.id === 'chuan');
  if (s && boats) {
    const b = boats.boats[0];
    s.pos = [b.mesh.position.x, b.mesh.position.y + 1.15, b.mesh.position.z];
    s.look = [-40, groundAt(-40, 20) + 4.2, 20];
  }
}

function fovFor(s) {
  if (s.id === 'aerial') return 44;
  if (s.id === 'wuhu' || s.id === 'luoxing') return 56;
  if (s.id === 'chuan' || s.id === 'qiaojie') return 62;
  if (s.id === 'tuisi') return 54;
  return 52;
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const fov = fovFor(s);
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 2.2, fov });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.9 });
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

/* ------------------------------------------------------------------ 招牌动作 */

/**
 * 走三桥：三条船解缆，一走太平、二走吉利、三走长庆，过一桥亮一桥。
 * snap=true 直接把船放到桥上、把三座桥一次点亮——SwiftShader 下一张静帧
 * 只有十几帧，靠 dt 推进的序列根本走不完。
 */
function setWalk(on, { snap = false } = {}) {
  state.walk = on;
  boats.setVoyage(on, { snap });
  if (on) {
    chainTarget.taiping = chainTarget.jili = chainTarget.changqing = 1;
    if (snap) {
      chain.taiping = chain.jili = chain.changqing = 1;
      for (const id of Object.keys(chain)) bridges.byId[id]?.setGlow(chain[id]);
    }
  } else {
    chainTarget.taiping = 0.34; chainTarget.jili = 0.7; chainTarget.changqing = 0.34;
  }
  ui.setToggle('walk', on);
}

function onParam(key, value) {
  switch (key) {
    case 'lantern': state.lantern = value; props.setLamp(value); break;
    case 'window': state.window = value; houses.setWindow(value); break;
    case 'float': state.float = value; props.setFloat(value); break;
    case 'ripple': state.ripple = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value * 1.1; break;
    case 'walk': setWalk(!!value); break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ 画质阶梯 */
const DPR = Math.min(window.devicePixelRatio || 1, 1.25);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水中灯影；这一景的河面全靠那一片倒影，可手动调低沿河灯笼换回画质。',
  ];
  ui.perfHint(notes[level] || '');
}

/* ------------------------------------------------------------------ 主循环 */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  sky.update(t);
  waters.update(t, state.ripple);
  garden.pond.update(t, state.ripple);
  props.update(t);
  boats.update(t, dt);
  plants.windUniforms.forEach((u) => { u.uTime.value = t; });

  // 过桥亮桥：船到桥下 ramp 到满，船过则回落；没走的时候三座桥各留一点底光
  const live = boats.chainLevels();
  for (const id of Object.keys(chain)) {
    const tgt = state.walk ? Math.max(chainTarget[id], live[id]) : chainTarget[id];
    chain[id] += (tgt - chain[id]) * Math.min(1, dt * (tgt > chain[id] ? 1.6 : 0.7));
    bridges.byId[id]?.setGlow(chain[id]);
  }
  for (const b of bridges.list) {
    if (b.id in chain) continue;
    b.setGlow(0.55 + 0.45 * state.lantern);
  }

  columns.update(t, state.ripple, 0.7 + 0.5 * Math.min(1.4, state.lantern + (state.walk ? 0.3 : 0)));
  if (reflections.enabled) reflections.update(t, state.ripple);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 13 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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
      if (fps < 22) lowStreak++; else lowStreak = Math.max(0, lowStreak - 2);
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
    a.download = `同里夜景-${s.short}.png`;
    a.click();
  } catch (e) { console.warn('截图失败', e); }
}

/* ------------------------------------------------------------------ 起动 */
function addRealLights(list) {
  for (const L of list) {
    const p = new THREE.PointLight(new THREE.Color(L.c), L.i, L.d, 2);
    p.position.set(L.x, L.y, L.z);
    scene.add(p);
  }
}

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
  ui.loading(0.04, '把镇子铺到水上…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.1, '升起星月…');
  sky = buildSky(scene);
  scene.fog.color.copy(FOG_COLOR);
  scene.fog.density = FOG_DENSITY;
  await nextFrame();

  ui.loading(0.2, '铺开五湖与镇河…');
  waters = buildWaters(scene);
  columns = new LightColumns(scene, 520);
  columns.mesh.renderOrder = 5;
  reflections = new Reflections(scene, { amp: 0.24, fade: 34 });
  await nextFrame();

  ui.loading(0.32, '垒起七块地与河埠头…');
  land = buildLand(scene);
  buildWaterBed(scene, land.materials.EARTH);
  await nextFrame();

  ui.loading(0.48, '架桥…');
  bridges = buildBridges(scene);
  reflections.add(bridges.group);
  await nextFrame();

  ui.loading(0.6, '沿河起屋…');
  houses = buildHouses(scene, { perIsland: 68 });
  await nextFrame();

  ui.loading(0.72, '退思园贴水…');
  garden = buildGarden(scene);
  reflections.add(garden.group, garden.pondY);
  await nextFrame();

  ui.loading(0.8, '立崇本堂、嘉荫堂、耕乐堂…');
  compounds = buildCompounds(scene);
  reflections.add(compounds.built.chongben.group);
  reflections.add(compounds.built.jiayin.group);
  reflections.add(compounds.built.gengle.group);
  reflections.add(compounds.built.chen.group);
  await nextFrame();

  ui.loading(0.86, '湖心堆一座洲…');
  islet = buildIslet(scene);
  reflections.add(islet.group);
  await nextFrame();

  ui.loading(0.9, '栽柳、樟、竹、梧桐…');
  plants = buildPlants(scene, { wharves: land.wharves });
  await nextFrame();

  ui.loading(0.94, '上灯…');
  boats = buildBoats(scene);
  props = buildProps(scene, { land, houses });
  reflections.add(boats.group);
  reflections.add(props.group);

  // 水面上的每一盏灯都往下拖一道：沿河、桥、埠头、园池、洲渡
  const addColumns = (spots, { y = 0, width = 1.15, depth = 6.5, tint = '#ffc48c', k = 0.62 } = {}) => {
    for (const [x, z] of spots) columns.add(new THREE.Vector3(x, y, z), tint, width, depth, k);
  };
  addColumns(props.waterLamps, { depth: 7.2 });
  addColumns(garden.waterLamps, { y: garden.pondY, width: 0.8, depth: 3.2, k: 0.5 });
  addColumns(islet.waterLamps, { width: 1.2, depth: 8 });
  for (const b of bridges.list) {
    const cos = Math.cos(b.dir), sin = Math.sin(b.dir);
    for (const off of [-b.width / 2, b.width / 2]) {
      columns.add(new THREE.Vector3(b.pos[0] - sin * off, 0, b.pos[1] + cos * off), '#ffbe82', 1.05, 6.2, 0.6);
    }
  }

  addRealLights(props.realLights);
  addRealLights(garden.realLights);
  addRealLights(compounds.lights);
  addRealLights(islet.realLights);

  resolveStations();
  hotspots = new Hotspots(scene, STATIONS, { onPick: (s) => goToStation(STATIONS.indexOf(s)), viewRange: 420 });
  hotspots.labelsVisible = true;

  onParam('lantern', state.lantern);
  onParam('window', state.window);
  onParam('float', state.float);
  onParam('ripple', state.ripple);
  onParam('bloom', state.bloom);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);

  goToStation(0, { animate: false, info: true });
  rig.setFov(fovFor(STATIONS[0]));
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 17000);
  hotspots.setCurrent(STATIONS[0].id);
  await nextFrame();

  composer.render();      // 先编译一遍着色器，幕布才落
  ui.loading(1, '灯上桥了…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  Object.assign(api, { land, waters, houses, bridges, garden, compounds, islet, boats, plants, props, hotspots, columns, reflections, setWalk, chain });
  applyDeepLink();
  requestAnimationFrame(frame);
}

/**
 * 静帧与脚本走位用的深链（query 与 hash 两种写法都读）：
 *   ?st=qiaojie&bare=1 · ?eye=x,y,z&at=x,y,z&fov=62
 *   ?walk=1（三条船泊在三桥上、三桥一次点满）· ?lamp=&window=&float=&noaq=1
 */
function applyDeepLink() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const get = (k) => q.get(k) ?? h.get(k);
  const has = (k) => q.has(k) || h.has(k);

  if (has('bare')) {
    document.body.classList.add('bare');
    hotspots.grp.visible = false;
    document.getElementById('loader').style.display = 'none';
  }
  if (has('noaq')) { onParam('autoQuality', false); ui.setToggle('autoQuality', false); }
  if (has('window')) onParam('window', Number(get('window')) / 100);
  if (has('lamp')) onParam('lantern', Number(get('lamp')) / 100);
  if (has('float')) onParam('float', Number(get('float')) / 100);
  if (has('ripple')) onParam('ripple', Number(get('ripple')) / 100);

  const want = get('st') ?? get('station');
  const idx = want === null ? -1 : STATIONS.findIndex((s) => s.id === want);
  if (has('walk') && get('walk') !== '0') setWalk(true, { snap: true });
  if (idx >= 0) {
    goToStation(idx, { info: has('info'), animate: false });
    if (has('fov')) rig.setFov(Number(get('fov')));
    return;
  }
  if (has('eye')) {
    const eye = get('eye').split(',').map(Number);
    const at = (get('at') || '20,3,20').split(',').map(Number);
    rig.goTo(eye, at, { animate: false, fov: Number(get('fov') || 55) });
  }
}

boot().then(() => {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'w') onParam('walk', !state.walk);
  });
}).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
