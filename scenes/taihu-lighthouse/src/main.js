import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { initMaterials, declutter } from './kit.js';
import { buildEnvironment } from './environment.js';
import { buildTerrain, elev, isLand } from './terrain.js';
import { buildLighthouse } from './lighthouse.js';
import { buildStructures } from './structures.js';
import { buildProps } from './props.js';
import { buildWater, LightColumns, Reflections, Surf } from './water.js';
import { Hotspots } from './hotspots.js';
import { CameraRig } from './controls.js';
import { createUI } from './ui.js';
import { STATIONS } from './data.js';

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
// 湖面要到地平线：远端面必须比秦淮那种河道场景大一个量级
const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 7000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.55, 0.62, 1.02);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const rig = new CameraRig(camera, canvas);
let ui, env, terrain, light, structures, props, water, surf, columns, reflections, hotspots;
let stationIndex = 0;
let wantShot = false;
let qualityLevel = 0;
const state = { beam: 1, sakura: 1, boats: 1, crowd: 90, ripple: 1, bloom: 0.55, reflect: true, labels: true, tour: false, autoQuality: true };

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
  if (rig.mode === 'pano') rig.goTo(s.pos, s.look, { animate, seconds: 1.9 });
  else rig.goToOrbit(s.pos, s.look, { animate, seconds: 1.6 });
  ui.setActive(s.id);
  hotspots.setCurrent(s.id);
  if (info) ui.showInfo(s);
}

function setMode(m) {
  rig.mode = m;
  rig.travel = null;
  const s = STATIONS[stationIndex];
  if (m === 'free') rig.goToOrbit(s.pos, s.look, { animate: false });
  else rig.goTo(s.pos, s.look, { animate: false });
  ui.setMode(m);
}

/* ------------------------------------------------------------------ params */
function onParam(key, value) {
  switch (key) {
    case 'beam': state.beam = value; break;
    case 'sakura': state.sakura = value; break;
    case 'boats': state.boats = value; break;
    case 'crowd': state.crowd = value; break;
    case 'ripple': state.ripple = value; break;
    case 'bloom': state.bloom = value; bloom.strength = value; break;
    case 'reflect': state.reflect = value; reflections.enabled = value; break;
    case 'labels': state.labels = value; hotspots.labelsVisible = value; break;
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
    '并已关闭水中倒影；如需更高画质可手动调低光束与夜樱强度。',
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
  env.update(t);
  water.update(t, state.ripple);
  surf.update(t, state.ripple);
  light.update(t, state.beam);
  props.update(t, dt, state, camera.position);
  columns.update(t, state.ripple, 0.7 + 0.5 * Math.min(1, state.beam));
  if (reflections.enabled) reflections.update(t, state.ripple);
  hotspots.update(camera, t, { width: window.innerWidth, height: window.innerHeight });
  declutter(camera.position);

  if (state.tour) {
    tourClock += dt;
    if (tourClock > 10.5 && !rig.travel) { tourClock = 0; goToStation(stationIndex + 1); }
  }
  ui.setCompass(THREE.MathUtils.radToDeg(rig.yaw));

  composer.render();
  if (wantShot) { capture(); wantShot = false; }

  // fps + adaptive quality — only sustained stalls count, first seconds are shader warm-up
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
    a.download = `太湖灯塔-${s.short}.png`;
    a.click();
  } catch (e) { /* canvas may be tainted in unusual setups */ }
}

/* --------------------------------------------------- dev-only offscreen captures */
/**
 * 预览浏览器是无头 0×0 视口，画面只能定尺寸离屏渲染，再回传给 tools/collect.mjs 落盘。
 * jobs: [{tag, station}] 用机位，或 [{tag, eye, at, fov}] 自由机位。
 */
async function shotBatch(jobs) {
  const W = 1440, H = 810;
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  const out = [];
  for (const j of jobs) {
    if (j.station != null) {
      rig.mode = 'pano';
      goToStation(j.station, { info: false, animate: false });
    } else {
      rig.mode = 'free';
      rig.goToOrbit(j.eye, j.at, { animate: false });
      rig.setFov(j.fov || 50);
    }
    rig.update(0.016);
    renderer.shadowMap.needsUpdate = true;
    composer.render();
    composer.render();
    await fetch(`http://127.0.0.1:8767/shot/${j.tag}`, { method: 'POST', body: canvas.toDataURL('image/png') });
    out.push(j.tag);
  }
  return out.join(' ');
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
    onReset: () => { goToStation(stationIndex, { info: false }); rig.setFov(rig.mode === 'pano' ? 60 : 55); },
    onStep: (d) => goToStation(stationIndex + d),
  });
  ui.loading(0.04, '铺开太湖夜色…');

  resize();
  initMaterials();
  await nextFrame();

  ui.loading(0.16, '升起星月…');
  env = buildEnvironment(scene);
  await nextFrame();

  ui.loading(0.36, '堆起鼋头渚石咀…');
  terrain = buildTerrain(scene);
  // 机位吸附到地面：贴地之外还要保证落在陆地上，否则镜头会泡在湖里
  const rescued = [];
  for (const s of STATIONS) {
    if (!s.ground) continue;
    let [x, , z] = s.pos;
    if (!isLand(x, z)) {
      outer: for (let r = 6; r < 130; r += 6) {
        for (let a = 0; a < 24; a++) {
          const th = (a / 24) * Math.PI * 2;
          const nx = x + Math.cos(th) * r, nz = z + Math.sin(th) * r;
          if (isLand(nx, nz) && elev(nx, nz) < 22) { x = nx; z = nz; break outer; }
        }
      }
      rescued.push(`${s.id}:${Math.round(x)},${Math.round(z)}`);
    }
    s.pos[0] = x; s.pos[2] = z;
    s.pos[1] = elev(x, z) + s.pos[1];
  }
  if (rescued.length) console.warn('机位落水，已就近挪到陆地 →', rescued.join(' '));
  await nextFrame();

  ui.loading(0.54, '放下太湖水…');
  columns = new LightColumns(scene);
  columns.mesh.renderOrder = 4;
  water = buildWater(scene);
  surf = new Surf(scene);
  reflections = new Reflections(scene);
  reflections.add(terrain.group);
  await nextFrame();

  ui.loading(0.72, '竖起灯塔，点亮旋转光束…');
  light = buildLighthouse(scene);
  reflections.add(light.group);
  await nextFrame();

  ui.loading(0.8, '架长春桥、下码头、点起仙岛灯…');
  structures = buildStructures(scene, columns);
  reflections.add(structures.group);
  await nextFrame();

  ui.loading(0.9, '种下夜樱，放游船进湖…');
  props = buildProps(scene, columns);
  await nextFrame();

  ui.loading(0.86, '安顿热点与解说…');
  hotspots = new Hotspots(scene, STATIONS, {
    onPick: (s) => goToStation(STATIONS.indexOf(s)),
  });
  hotspots.labelsVisible = true;
  rig.goTo(STATIONS[0].pos, STATIONS[0].look, { animate: false });
  rig.setFov(60);
  ui.setActive(STATIONS[0].id);
  ui.showInfo(STATIONS[0]);
  // the opening card explains the scene, then gets out of the way of the view
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

  ui.loading(1, '塔影横湖…');
  await new Promise((r) => setTimeout(r, 260));
  ui.loaded();
  // handle for scripting the camera from the console
  window.taihu = { scene, camera, renderer, composer, rig, bloom, STATIONS, goToStation, setMode, elev, shot: shotBatch, rescued };
  requestAnimationFrame(frame);
}

// hotspot taps come through the rig
function bindTap() {
  rig.onTap = ({ x, y }) => {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const hit = hotspots.pick(ndc, camera);
    if (hit) goToStation(STATIONS.indexOf(hit));
  };
}

boot().then(bindTap).catch((err) => {
  console.error(err);
  const l = document.getElementById('loader');
  if (l) l.querySelector('p').textContent = `场景加载失败：${err.message}`;
});
