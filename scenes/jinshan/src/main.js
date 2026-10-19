import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment, terrainH } from './environment.js';
import { buildQuarter } from './architecture.js';
import { buildProps } from './props.js';
import { buildInteriors } from './interiors.js';
import { buildPortals } from './portals.js';
import { buildWater, LightColumns, Reflections, WaveRings } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { Talu } from './taling.js';
import { STATIONS, CHIME, FACES } from './data.js';

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
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.6, 0.5, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, props, water, columns, reflections, rings, hotspots, quarter, portals, interiors, talu;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = {
  eave: 1, crowd: 70, ripple: 1, boat: 1, incense: 1, glow: 0.6,
  reflect: true, labels: true, mist: true, gulls: true, tour: false, autoQuality: true,
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
/** ground 的机位按地形抬到脚下，站在水边的那几个不抬 */
function pose(s) {
  const pos = [...s.pos];
  const look = [...s.look];
  if (s.ground) pos[1] = terrainH(pos[0], pos[2]) + 1.7;
  if (s.lookGround) look[1] = terrainH(look[0], look[2]) + (s.lookUp ?? 1.6);
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
  if (s.id === 'cishou') ui.chimeNote(`按 B 报一响，按 N 轮满 ${CHIME.strikes} 番。`);
  else if (s.id === 'aerial') ui.chimeNote('在江上听，铃声要慢半拍才到。');
  else ui.chimeNote('铃声自塔身八面起，贴江面推开。');
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
    case 'eave': state.eave = value; break;
    case 'crowd': state.crowd = value; break;
    case 'ripple': state.ripple = value; break;
    case 'boat': state.boat = value; break;
    case 'incense': state.incense = value; break;
    case 'glow': state.glow = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'mist': state.mist = value; env.setMist(value); water.setFrost(value); break;
    case 'gulls': state.gulls = value; env.setBirds(value); break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

function onChime(kind) {
  const t = clock.elapsedTime;
  if (kind === 'one') {
    const f = talu.one(t);
    ui.setChime(talu.lastN + 1, false, f);
  } else if (kind === 'stop') talu.stop();
  else if (kind === 'ring') {
    if (talu.ringing) talu.stop();
    else {
      talu.ringAll(t);
      ui.chimeNote(`正在轮满 ${CHIME.strikes} 面，Esc 止风。`);
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
    '并已关闭水中倒影；塔灯与檐口灯仍按你设定的亮度。',
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
  props.reeds.update(t);
  props.strings.update(t);
  props.fleet.update(t, dt, state.boat);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);
  props.smoke.update(t, dt, state.incense, camera.position);
  water.update(t, state.ripple);

  // 声纹扫过机位时，灯火跟着矮一口
  const dip = 1 - Math.min(0.42, (talu.dim || 0) * 0.42);
  quarter.setEave(state.eave * dip);
  props.strings.uni.uOn.value = Math.min(1, 0.25 + state.eave) * dip;
  columns.update(t, state.ripple, (0.75 + 0.45 * Math.min(1, state.eave)) * dip);
  if (reflections.enabled) reflections.update(t, state.ripple);

  talu.update(t, dt, camera.position);
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
    a.download = `金山寺-${s.short}.png`;
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
    onChime,
  });
  ui.loading(0.04, '铺开长江夜色…');
  ui.setChime(0, false, null);

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起金山与星野…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.34, '垒起寺裹山、架起慈寿塔…');
  quarter = buildQuarter(scene);
  await nextFrame();

  ui.loading(0.54, '点起塔灯与檐口一线…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  props = buildProps(scene, columns, quarter.anchors);
  await nextFrame();

  ui.loading(0.68, '放开塔门、殿门与船舱…');
  interiors = buildInteriors(scene, quarter, props.fleet.board());
  await nextFrame();

  ui.loading(0.78, '放下大江与金山湖…');
  rings = new WaveRings();
  water = buildWater(scene, rings);
  reflections = new Reflections(scene);
  reflections.add(quarter.group);
  await nextFrame();

  ui.loading(0.88, '安顿灯火、夜客与香火…');
  portals = buildPortals(scene, rig, props.fleet.board());
  portals.onSpace = (space) => { hotspots.exteriorShown = space === 'exterior'; };
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;

  talu = new Talu({
    frame: quarter.chime,
    rings,
    props,
    env,
    position: quarter.chime.pos,
    onCount: (c, ringing, face) => ui.setChime(c, ringing, face),
  });
  talu.addFlashTo(scene);

  rig.goTo(pose(STATIONS[0]).pos, STATIONS[0].look, { animate: false });
  rig.setFov(62);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 18000);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  quarter.setEave(state.eave);
  await nextFrame();

  // 先出一帧把 shader 编译掉，再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '八面江风…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  window.jinshan = {
    scene, camera, renderer, composer, rig, bloom, STATIONS, FACES, goToStation, setMode,
    portals, talu, props, columns, env, water, reflections, state,
  };
  // ?st=cishou 直接落到某个机位，便于逐机位截图与回归对比
  const qs = new URLSearchParams(location.search);
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  // ?hide=quarter,mist 关掉若干图层，用来定位过曝与穿帮（调试用，不影响正常浏览）
  const layers = {
    reeds: props.reeds.group, strings: props.strings.group, quarter: quarter.group,
    trees: env.trees.group, mist: env.mist.group, flies: env.flies.mesh,
    smoke: props.smoke.mesh, river: water.mesh, lake: water.lake, pond: water.pond,
    columns: columns.mesh, birds: env.birds.group, sky: env.sky.mesh, stars: env.sky.stars,
    crowd: props.crowd.mesh, reflections: reflections.root, hotspots: hotspots.grp,
    far: env.far.ridges, boats: props.fleet.group, interiors: interiors.tower.group,
  };
  for (const h of (qs.get('hide') || '').split(',')) if (layers[h]) layers[h].visible = false;
  if ((qs.get('hide') || '').includes('reflections')) reflections.enabled = false;
  // ?probe=1 把正前方打到的物体列出来，用来定位机位扎进几何或看空了（调试用）
  if (qs.get('probe')) {
    setTimeout(() => {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = ray.intersectObjects(scene.children, true).slice(0, 6)
        .map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(1)}`);
      const dir = camera.getWorldDirection(new THREE.Vector3());
      console.log('[probe]', JSON.stringify({
        pos: camera.position.toArray().map((v) => +v.toFixed(1)),
        dir: dir.toArray().map((v) => +v.toFixed(2)),
        rig: [rig.pos.toArray().map((v) => +v.toFixed(1)), +THREE.MathUtils.radToDeg(rig.yaw).toFixed(1), +THREE.MathUtils.radToDeg(rig.pitch).toFixed(1)],
        mode: rig.mode, hits,
      }));
    }, 12000);
  }
  // ?chime=1 让塔铃一直轮下去，用来看声纹与面光的静帧
  if (qs.get('chime')) {
    const t = clock.elapsedTime + 0.6;
    talu.ringAll(t);
    for (const age of [0.25, 1.1, 2.2, 3.6]) {
      talu.rings.emit(quarter.chime.pos.x, quarter.chime.pos.z, t - age, 1);
      props.reeds.wave(quarter.chime.pos.x, quarter.chime.pos.z, t - age, FACES[0].hue, 1);
      props.strings.wave(quarter.chime.pos.x, quarter.chime.pos.z, t - age, FACES[2].hue, 1);
      talu.hits.push({ t0: t - age, s: 1 });
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
    // 点塔身上的铃也算报一响
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const bells = quarter.chime.bells.map((b) => b.mesh || b);
    if (ray.intersectObjects(bells, false).length) onChime('one');
  };
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e' || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    portals.use(portals.nearest(camera.position));
  });
}

boot().then(bindTap).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('#loader-step').textContent = `场景加载失败：${err.message}`;
});
