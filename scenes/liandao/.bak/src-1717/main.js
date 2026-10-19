import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment, terrainH, shoreZat } from './environment.js';
import { buildQuarter, LAYOUT } from './architecture.js';
import { buildProps } from './props.js';
import { buildInteriors } from './interiors.js';
import { buildPortals } from './portals.js';
import { buildWater, LightColumns, Reflections, WaveRings } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { Kaiyu } from './kaiyu.js';
import { STATIONS, CHIME, DEFAULTS } from './data.js';
import { tideAt, tideWord, sceneHour, hhmm, nextTurn } from './tide.js';

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
const camera = new THREE.PerspectiveCamera(60, 1, 0.15, 4200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.74, 0.55, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, quarter, props, water, columns, reflections, rings, hotspots, portals, interiors, kaiyu;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { ...DEFAULTS };

/** 潮位是全场唯一的公共变量：水、船、滩、灯、机位都读它 */
const clockTide = { hour: DEFAULTS.startHour || sceneHour(0, state.speed), level: 0 };

/* ------------------------------------------------------------------ 机位 */
/** ground 的机位按地形抬到脚下，deck/crown 从曲线取样，edge 的机位站在今晚的水线上 */
function pose(s) {
  let pos = s.pos ? [...s.pos] : [s.x ?? 0, 0, s.z ?? 0];
  let look = [...s.look];
  if (s.edge) {
    const z = shoreZat(pos[0], clockTide.level) - 2.2;
    pos = [pos[0], Math.max(1.7, clockTide.level + 1.7), z];
    look = [look[0], clockTide.level + 1.1, look[2]];
  } else if (s.ground) {
    pos[1] = terrainH(pos[0], pos[2]) + 1.7;
  } else if (s.deck != null && LAYOUT.walk.curve) {
    const p = LAYOUT.walk.curve.getPoint(s.deck);
    pos = [p.x, p.y + 1.6, p.z];
  } else if (s.crown != null && LAYOUT.dyke.curve) {
    const p = LAYOUT.dyke.curve.getPoint(s.crown);
    pos = [p.x, p.y + 1.7, p.z];
  }
  return { pos, look };
}

function goToStation(i, { info = true, animate = true } = {}) {
  stationIndex = (i + STATIONS.length) % STATIONS.length;
  const s = STATIONS[stationIndex];
  const p = pose(s);
  if (rig.mode === 'pano') rig.goTo(p.pos, p.look, { animate, seconds: 1.9 });
  else rig.goToOrbit(p.pos, p.look, { animate, seconds: 1.5 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
  if (s.edge) ui.bellNote('站在水线上：潮还在动，脚下这道边也在动。');
  else if (s.id === 'harbor') ui.bellNote(`按 B 报一更，按 N 轮满五更、候潮开渔。`);
  else if (s.id === 'lighthouse') ui.bellNote('点塔门口的光环，或走近按 E，可以上到灯室。');
  else ui.bellNote('潮信自灯塔脚下起，推过港池与海湾。');
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
    case 'speed': state.speed = value; break;
    case 'swell': state.swell = value; break;
    case 'crowd': state.crowd = value; break;
    case 'fleet': state.fleet = value; break;
    case 'strings': state.strings = value; break;
    case 'glow': state.glow = value; bloom.strength = value / 100; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
    case 'mist': state.mist = value; env.setMist(value); water.setFrost(value); break;
    case 'gulls': state.gulls = value; env.setGulls(value); break;
    case 'tour': state.tour = value; rig.autoRotate = value; tourClock = value ? 8 : 0; break;
    case 'autoQuality': state.autoQuality = value; if (!value) ui.perfHint(''); break;
    default: break;
  }
}

function onBell(kind) {
  const t = clock.elapsedTime;
  if (kind === 'one') {
    const w = kaiyu.one(t);
    ui.setBell(kaiyu.count + 1, false, w);
  } else if (kind === 'stop') {
    kaiyu.stop();
    ui.setBell(kaiyu.count, false, null);
  } else if (kind === 'ring') {
    if (kaiyu.ringing) { kaiyu.stop(); ui.setBell(kaiyu.count, false, null); }
    else {
      kaiyu.ringAll(t);
      ui.bellNote(`正在轮满五更（约 ${CHIME.strikes * CHIME.interval + 4} 秒），潮位随之走完这一涨。`);
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
    '并已关闭水中倒影；堤灯与船灯仍按你设定的亮度。',
  ];
  ui.perfHint(notes[level] || '');
}

function crowdTarget() {
  const cap = [260, 190, 130][Math.min(2, qualityLevel)];
  return Math.min(state.crowd, cap);
}

/* ------------------------------------------------------------------ 主循环 */
const clock = new THREE.Clock();
let frames = 0, fpsAcc = 0, tourClock = 0, lowStreak = 0;

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  clockTide.hour = sceneHour(t, state.speed);
  clockTide.level = tideAt(clockTide.hour);

  rig.update(dt);
  followTideLine(dt);

  env.update(t, dt, clockTide.hour, clockTide.level);
  props.umbrellas.update(t, clockTide.level);
  props.crowd.update(t, dt, state.autoQuality ? crowdTarget() : state.crowd, camera.position);
  props.strings.update(t);
  props.flags.update(t, dt);
  props.spray.update(t, clockTide.level);
  props.fleet.update(t, dt, state.fleet / 100, clockTide.level, clockTide.hour);
  water.update(t, state.swell / 100, clockTide.level);

  // 潮信推过港池时，堤灯与光柱一起矮一口
  const dip = 1 - Math.min(0.4, (kaiyu.dim || 0) * 0.4);
  quarter.setStrip((state.strings / 100) * dip);
  props.strings.uni.uOn.value = Math.min(1, 0.2 + state.strings / 100) * dip;
  columns.update(t, state.swell / 100, (0.7 + 0.5 * Math.min(1, state.strings / 100)) * dip);
  if (reflections.enabled) reflections.update(t, clockTide.level);

  kaiyu.update(t, dt, camera.position);
  interiors.update(t, clockTide.level);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);
  portals.update(t, camera.position, clockTide.level);

  ui.setClock(hhmm(clockTide.hour), tideWord(clockTide.hour), clockTide.level, nextTurn(clockTide.hour));

  // 跟机的冷光：夜里保住礁石这圈的质感
  const f0 = env.lights[1];
  f0.position.set(camera.position.x - 5, camera.position.y + 8, camera.position.z - 6);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 12 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
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

/** edge 机位：潮在走，站着的人跟着水线挪，不然一会儿淹了一会儿干了 */
function followTideLine(dt) {
  const s = STATIONS[stationIndex];
  if (!s || !s.edge || rig.travel || rig.mode !== 'pano') return;
  const z = shoreZat(s.x, clockTide.level) - 2.2;
  const y = Math.max(1.7, clockTide.level + 1.7);
  const k = Math.min(1, dt * 1.2);
  rig.pos.z += (z - rig.pos.z) * k;
  rig.pos.y += (y - rig.pos.y) * k;
  rig.pitch = Math.max(rig.pitch, -0.06);
}

function capture() {
  const s = STATIONS[stationIndex];
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `连岛-${s.short}.png`;
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 60 : 55); },
    onStep: (d) => goToStation(stationIndex + d),
    onBell,
  });
  ui.loading(0.04, '把海州湾的水面铺平…');
  ui.setBell(0, false, null);

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起岛脊与星野…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.32, '垒起西大堤、锚定灯塔与港池…');
  quarter = buildQuarter(scene, env);
  await nextFrame();

  // 栈道与大堤的机位标记跟着曲线走，别写死高程
  for (const s of STATIONS) {
    if (s.deck != null && LAYOUT.walk.curve) {
      const p = LAYOUT.walk.curve.getPoint(s.deck);
      s.mark = [p.x, p.y + 3.2, p.z];
    } else if (s.crown != null && LAYOUT.dyke.curve) {
      const p = LAYOUT.dyke.curve.getPoint(s.crown);
      s.mark = [p.x, p.y + 3.6, p.z];
    }
  }

  ui.loading(0.5, '排开停泊区的五百副桅杆…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  props = buildProps(scene, columns, quarter.anchors, quarter);
  await nextFrame();

  ui.loading(0.64, '点亮口门的红绿灯桩…');
  interiors = buildInteriors(scene, props.fleet.lead());
  await nextFrame();

  ui.loading(0.74, '放上涨落三米三的潮水…');
  rings = new WaveRings();
  water = buildWater(scene, rings);
  reflections = new Reflections(scene);
  reflections.add(quarter.group);
  await nextFrame();

  ui.loading(0.86, '安顿夜客、鸥鸟与海雾…');
  portals = buildPortals(scene, rig, props.fleet.lead());
  portals.onSpace = (space) => { hotspots.exteriorShown = space === 'exterior'; };
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;

  kaiyu = new Kaiyu({
    frame: quarter.chime,
    rings,
    props,
    env,
    position: LAYOUT.chime.pos,
    onCount: (c, ringing, watch) => ui.setBell(c, ringing, watch),
    onRelease: () => props.fleet.depart(clockTide.hour),
  });
  kaiyu.addFlashTo(scene);

  clockTide.hour = sceneHour(0, state.speed);
  clockTide.level = tideAt(clockTide.hour);
  rig.goTo(pose(STATIONS[0]).pos, pose(STATIONS[0]).look, { animate: false });
  rig.setFov(60);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  setTimeout(() => ui.hideInfo(), 18000);
  hotspots.setCurrent(STATIONS[0].id);
  renderer.setPixelRatio(DPR);
  composer.setPixelRatio(DPR);
  quarter.setStrip(state.strings / 100);
  await nextFrame();

  // 先出一帧把 shader 编译掉，再揭幕
  composer.render();
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  renderer.shadowMap.autoUpdate = false;

  ui.loading(1, '休渔期最后一夜…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  window.liandao = {
    scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode,
    portals, kaiyu, LAYOUT, props, columns, env, water, reflections, state, tide: clockTide,
  };
  // ?st=lighthouse 直接落到某个机位，便于逐机位截图与回归对比
  const qs = new URLSearchParams(location.search);
  const q = qs.get('st');
  if (q) {
    const i = STATIONS.findIndex((s) => s.id === q);
    if (i >= 0) goToStation(i, { animate: false });
  }
  // ?tide=hi|lo 把场景时钟挪到高潮/低潮，用来核对水线、滩涂与缆绳
  if (qs.get('tide') === 'hi') { clockTide.hour = 1.5; clockTide.level = tideAt(1.5); }
  if (qs.get('tide') === 'lo') { clockTide.hour = 7.9; clockTide.level = tideAt(7.9); }
  // ?hide=crowd,mist 关掉若干图层，用来定位过曝与穿帮（调试用，不影响正常浏览）
  const layers = {
    crowd: props.crowd.mesh, strings: props.strings.group, umbrellas: props.umbrellas.group,
    fleet: props.fleet.group, spray: props.spray.mesh, flags: props.flags.group,
    quarter: quarter.group, dyke: quarter.dyke, harbour: quarter.harbourLights,
    trees: env.trees.group, mist: env.mist.group, gulls: env.gulls.mesh,
    water: water.mesh, foam: water.foam, columns: columns.mesh,
    sky: env.sky.mesh, stars: env.sky.stars, reflections: reflections.root,
    hotspots: hotspots.grp, range: env.range.group,
  };
  for (const h of (qs.get('hide') || '').split(',')) if (layers[h]) layers[h].visible = false;
  if ((qs.get('hide') || '').includes('reflections')) reflections.enabled = false;
  // ?watch=1 让潮信一直轮下去，用来看波环与船队解缆的静帧
  if (qs.get('watch')) {
    const t = clock.elapsedTime + 0.6;
    kaiyu.ringAll(t);
    for (const age of [0.3, 1.2, 2.4]) {
      kaiyu.rings.emit(LAYOUT.chime.pos.x, LAYOUT.chime.pos.z, t - age, 1);
      props.strings.wave(LAYOUT.chime.pos.x, LAYOUT.chime.pos.z, t - age, '#9fd8ff', 1);
      kaiyu.hits.push({ t0: t - age, s: 1 });
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
    // 点灯塔的灯笼也算报一更
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const lamps = (quarter.chime.lamps || []).map((b) => b.mesh || b);
    if (lamps.length && ray.intersectObjects(lamps, false).length) onBell('one');
  };
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e' || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    portals.use(portals.nearest(camera.position));
  });
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', () => { if (ui) resize(); });

boot().then(bindTap).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('#loader-step').textContent = `场景加载失败：${err.message}`;
});
