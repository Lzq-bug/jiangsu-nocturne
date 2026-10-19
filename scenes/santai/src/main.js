import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment, terrainH } from './environment.js';
import { buildQuarter, LAYOUT } from './architecture.js';
import { buildProps } from './props.js';
import { buildInteriors } from './interiors.js';
import { buildPortals } from './portals.js';
import { buildWater, LightColumns, Reflections, WaveRings } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { Huaxin } from './huaxin.js';
import { STATIONS, CHIME } from './data.js';

const canvas = document.getElementById('stage');
// 后台标签页里 rAF 会冻住，所以每一步都留一个定时器兜底
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
const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 1800);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.62, 0.5, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, props, water, columns, reflections, rings, hotspots, quarter, portals, interiors, huaxin;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  strip: 1, crowd: 70, ripple: 1, train: 1, petal: 1, glow: 0.62,
  reflect: true, labels: true, mist: true, birds: true, tour: false, autoQuality: true,
};

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

/* ------------------------------------------------------------------ 机位 */
/** ground 的机位按地形抬到脚下，deck 的机位直接从廊桥曲线取样 */
function pose(s) {
  let pos = [...s.pos];
  let look = [...s.look];
  if (s.ground) pos[1] = terrainH(pos[0], pos[2]) + 1.7;
  else if (s.deck != null && LAYOUT.bridge.curve) {
    const p = LAYOUT.bridge.curve.getPoint(s.deck);
    pos = [p.x, p.y + 1.65, p.z];
  }
  // 看地上或水面的目标：y 也交给地形，机位就不会扎进坡里
  if (s.lookGround) look[1] = terrainH(look[0], look[2]) + (s.lookUp ?? 1.6);
  else if (s.deck != null && LAYOUT.bridge.curve) look[1] = pos[1] + (s.lookDrop ?? -1.2);
  return { pos, look };
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const p = pose(s);
  if (rig.mode === 'pano') rig.goTo(p.pos, p.look, { animate, seconds: 1.8 });
  else rig.goToOrbit(p.pos, p.look, { animate, seconds: 1.5 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
  if (s.id === 'tower') ui.bellNote(`按 B 报一候，按 N 轮满 ${CHIME.strikes} 番。`);
  else if (s.id === 'natian') ui.bellNote('花色要等灯串扫过去才显出来。');
  else ui.bellNote('风声自天和塔起，贴花田推开。');
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  const p = pose(s);
  if (m === 'free') rig.goToOrbit(p.pos, p.look, { animate: false });
  else rig.goTo(p.pos, p.look, { animate: false });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ 参数 */
function onParam(key, value) {
  switch (key) {
    case 'strip': state.strip = value; break;
    case 'crowd': state.crowd = value; break;
    case 'ripple': state.ripple = value; break;
    case 'train': state.train = value; break;
    case 'petal': state.petal = value; break;
    case 'glow': state.glow = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'mist': state.mist = value; env.setMist(value); water.setFrost(value); break;
    case 'birds': state.birds = value; env.setBirds(value); break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

function onBell(kind) {
  const t = clock.elapsedTime;
  if (kind === 'one') {
    const f = huaxin.one(t);
    ui.setBell(huaxin.count + 1, false, f);
  } else if (kind === 'stop') huaxin.stop();
  else if (kind === 'ring') {
    if (huaxin.ringing) huaxin.stop();
    else {
      huaxin.ringAll(t);
      ui.bellNote(`正在轮满 ${CHIME.strikes} 番，Esc 止风。`);
    }
  }
}

/* ------------------------------------------------------------------ 画质挡位 */
const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
function applyQuality(level) {
  qualityLevel = level;
  renderer.setPixelRatio(level >= 1 ? 1 : DPR);
  reflections.enabled = state.reflect && level < 2;
  const notes = [
    '',
    '已自动降低渲染分辨率以保持流畅。',
    '并已关闭水中倒影；灯带与花田仍按你设定的亮度。',
  ];
  ui.perfHint(notes[level] || '');
}

function crowdTarget() {
  const cap = [220, 170, 120][Math.min(2, qualityLevel)];
  return Math.min(state.crowd, cap);
}

/* ------------------------------------------------------------------ 主循环 */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  rig.update(dt);
  env.update(t, dt);
  props.field.update(t);
  props.strings.update(t);
  props.fleet.update(t, dt, state.train);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);
  props.leaves.update(t, dt, state.petal, camera.position);
  water.update(t, state.ripple);

  // 波扫过机位时，灯带与光柱一起矮一口
  const dip = 1 - Math.min(0.45, (huaxin.dim || 0) * 0.45);
  quarter.setStrip(state.strip * dip);
  props.strings.uni.uOn.value = Math.min(1, 0.25 + state.strip) * dip;
  columns.update(t, state.ripple, (0.75 + 0.45 * Math.min(1, state.strip)) * dip);
  if (reflections.enabled) reflections.update(t, state.ripple);

  huaxin.update(t, dt, camera.position);
  interiors.update(t);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);
  portals.update(t, camera.position);

  // 跟机的暖光：夜里保住脚下这圈细节
  const f0 = env.lights[1];
  f0.position.set(camera.position.x + 6, camera.position.y + 7, camera.position.z + 6);

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
    a.download = `三台山-${s.short}.png`;
    a.click();
  } catch (e) { /* 某些环境下 canvas 会被判定为污染 */ }
}

/* ------------------------------------------------------------------ 启动 */
async function boot() {
  ui = createUI({
    stations: STATIONS,
    onChange: onParam,
    onSelect: (s) => goToStation(STATIONS.indexOf(s)),
    onMode: setMode,
    onTour: (v) => onParam('tour', v),
    onShot: () => { wantShot = true; },
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 62 : 55); },
    onStep: (d) => goToStation(stationIndex + d),
    onBell,
  });
  ui.loading(0.04, '铺开骆马湖夜色…');
  ui.setBell(0, false, null);

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起三峰与星野…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.34, '架起空中廊桥、垒起天和塔…');
  quarter = buildQuarter(scene);
  await nextFrame();

  // 廊桥机位的标记点跟着曲线走，别写死高程
  for (const s of STATIONS) {
    if (s.deck != null && LAYOUT.bridge.curve) {
      const p = LAYOUT.bridge.curve.getPoint(s.deck);
      s.mark = [p.x, p.y + 3.4, p.z];
    }
  }

  ui.loading(0.52, '缝上 612 块衲田…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  props = buildProps(scene, columns, quarter.anchors, quarter);
  await nextFrame();

  ui.loading(0.66, '点起塔下长明灯…');
  interiors = buildInteriors(scene, props.fleet.moored(0));
  await nextFrame();

  ui.loading(0.76, '放下镜湖与天鹅湖…');
  rings = new WaveRings();
  water = buildWater(scene, rings);
  reflections = new Reflections(scene);
  reflections.add(quarter.group);
  await nextFrame();

  ui.loading(0.88, '安顿灯火、夜客与落瓣…');
  portals = buildPortals(scene, rig, props.fleet.moored(0));
  portals.onSpace = (space) => { hotspots.exteriorShown = space === 'exterior'; };
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;

  huaxin = new Huaxin({
    frame: quarter.chime,
    rings,
    props,
    env,
    position: LAYOUT.chime.pos,
    onCount: (c, ringing, flower) => ui.setBell(c, ringing, flower),
  });
  huaxin.addFlashTo(scene);

  rig.goTo(pose(STATIONS[0]).pos, STATIONS[0].look, { animate: false });
  rig.setFov(62);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 16000);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  quarter.setStrip(state.strip);
  await nextFrame();

  // 先出一帧把 shader 编译掉，再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '廿四番花信风…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  window.santai = {
    scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode,
    portals, huaxin, LAYOUT, props, columns, env, water, reflections, state,
  };
  // ?st=tower 直接落到某个机位，便于逐机位截图与回归对比
  const qs = new URLSearchParams(location.search);
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  // ?hide=quarter,mist 关掉若干图层，用来定位过曝与穿帮（调试用，不影响正常浏览）
  const layers = {
    field: props.field.group, strings: props.strings.group, quarter: quarter.group,
    trees: env.trees.group, mist: env.mist.group, flies: env.flies.mesh,
    petals: props.leaves.mesh, water: water.mesh, pond: water.pond,
    columns: columns.mesh, birds: env.birds.group, sky: env.sky.mesh, stars: env.sky.stars,
    crowd: props.crowd.mesh, reflections: reflections.root, hotspots: hotspots.grp,
  };
  for (const h of (qs.get('hide') || '').split(',')) if (layers[h]) layers[h].visible = false;
  if ((qs.get('hide') || '').includes('reflections')) reflections.enabled = false;
  // ?chime=1 让花信一直轮下去，用来看花波与铃架摆动的静帧
  if (qs.get('chime')) {
    const t = clock.elapsedTime + 0.6;
    huaxin.ringAll(t);
    for (const age of [0.2, 0.9, 1.9, 3.4]) {
      huaxin.rings.emit(LAYOUT.chime.pos.x, LAYOUT.chime.pos.z, t - age, 1);
      props.field.wave(LAYOUT.chime.pos.x, LAYOUT.chime.pos.z, t - age, '#ff8fae', 1);
      huaxin.hits.push({ t0: t - age, s: 1 });
    }
  }
  requestAnimationFrame(frame);
}

function bindTap() {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const door = portals.pick(ndc, camera);
    if (door) { portals.use(door); return; }
    const hit = hotspots.pick(ndc, camera);
    if (hit) { goToStation(STATIONS.indexOf(hit)); return; }
    // 点铃架也算报一候
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const bells = quarter.chime.bells.map((b) => b.mesh || b);
    if (ray.intersectObjects(bells, false).length) onBell('one');
  };
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
