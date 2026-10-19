import * as THREE from 'three';
import { SHOWS } from './data.js';
import { rand, rr } from './kit.js';
import { LAYOUT, projectionSurfaces } from './architecture.js';
import * as T from './textures.js';
import { WATER_Y } from './water.js';

/**
 * 问雅光影：每一站一段可点的投影。
 * 面上的动效由一块加法混合的投影机幕布画（uMode 选节目），
 * 场外的动效（提灯走廊、水面涟漪、笛声起腔）由 hooks 做。
 */

const PROJECTOR_VERT = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const PROJECTOR_FRAG = `
  uniform float uTime; uniform float uMix; uniform float uMode; uniform vec3 uTint;
  varying vec2 vUv;

  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
  }

  /* 0 画屏：月从纸上升起，下半页的水波自己动起来 */
  void ink(out vec3 col, out float a){
    vec2 p = vUv;
    float rise = clamp((p.y - 0.18) * 1.1, 0.0, 1.0);
    vec2 mp = vec2(0.30 + 0.16 * rise, 0.24 + 0.5 * rise);
    float d = length((p - mp) * vec2(1.6, 1.0));
    float moon = smoothstep(0.11, 0.035, d);
    // 水波只在下半，横纹随时间爬
    float w = 0.0;
    if (p.y < 0.52) {
      float k = (0.52 - p.y) * 26.0;
      w = pow(sin(k + uTime * 1.5 + sin(p.x * 7.0 + uTime * 0.7) * 1.3) * 0.5 + 0.5, 3.0);
      w *= smoothstep(0.0, 0.3, 0.52 - p.y);
    }
    float shimmer = n2(p * vec2(9.0, 5.0) + vec2(uTime * 0.06, -uTime * 0.14));
    col = vec3(0.78, 0.86, 1.0) * moon * 1.5 + vec3(0.42, 0.56, 0.72) * w * 0.5;
    col += vec3(0.30, 0.36, 0.46) * shimmer * w * 0.5;
    a = max(moon, w * 0.7) * 0.9;
  }

  /* 1 竹影：几枝影子被风在墙上写一遍 */
  void bamboo(out vec3 col, out float a){
    vec2 p = vUv * vec2(2.4, 1.0);
    float sway = sin(uTime * 0.5) * 0.04 + n2(vec2(uTime * 0.12, 0.0)) * 0.05;
    float m = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float x = 0.14 + fi * 0.22 + sway * (1.0 + fi * 0.3);
      float stem = smoothstep(0.02, 0.0, abs(p.x - x - sin(p.y * 2.0 + fi) * 0.02));
      float leaf = 0.0;
      for (int k = 0; k < 7; k++) {
        float fk = float(k);
        vec2 lp = p - vec2(x + 0.05 * (mod(fk, 2.0) * 2.0 - 1.0), 0.1 + fk * 0.12);
        float ang = (mod(fk, 2.0) * 2.0 - 1.0) * 0.7 + sin(uTime * 0.6 + fi) * 0.12;
        float ca = cos(ang), sa = sin(ang);
        lp = vec2(lp.x * ca - lp.y * sa, lp.x * sa + lp.y * ca);
        leaf += smoothstep(0.055, 0.0, abs(lp.y)) * smoothstep(0.14, 0.0, abs(lp.x - 0.07));
      }
      m = max(m, stem * 0.7 + leaf);
    }
    col = vec3(0.16, 0.30, 0.22) * m;
    a = m * 0.75;
  }

  /* 2 游廊：一道暖光沿廊推过去 */
  void corridor(out vec3 col, out float a){
    float head = fract(uTime * 0.12);
    float d = abs(vUv.x - head);
    float band = exp(-pow(d / 0.08, 2.0));
    float tail = smoothstep(0.42, 0.0, head - vUv.x) * 0.28;
    float rib = pow(sin(vUv.x * 96.0 + uTime * 0.6) * 0.5 + 0.5, 6.0) * 0.25;
    col = vec3(1.0, 0.72, 0.36) * (band + tail + rib * band);
    a = clamp(band * 0.9 + tail, 0.0, 1.0);
  }

  /* 3 雨打芭蕉：斜落的雨丝 + 叶面泛光 */
  void rain(out vec3 col, out float a){
    vec2 p = vUv * vec2(6.0, 1.6);
    float streak = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float x = fract(p.x * (1.0 + fi * 0.3) + fi * 0.37);
      float y = fract(p.y * (1.4 + fi * 0.2) + uTime * (1.6 + fi * 0.5));
      streak += smoothstep(0.02, 0.0, abs(x - 0.5)) * smoothstep(0.62, 0.0, abs(y - 0.5)) * (0.5 - fi * 0.12);
    }
    float leaf = n2(vUv * vec2(3.0, 2.0) + vec2(0.0, uTime * 0.05));
    float glowB = smoothstep(0.55, 0.95, leaf) * 0.35;
    col = vec3(0.62, 0.76, 0.92) * streak + vec3(0.34, 0.56, 0.40) * glowB;
    a = clamp(streak * 0.7 + glowB, 0.0, 1.0);
  }

  /* 4 长窗收影：一格一格依次灭下去 */
  void grid(out vec3 col, out float a){
    vec2 g = vUv * vec2(6.0, 1.0);
    float cell = floor(g.x);
    float seq = mod(cell * 0.19, 1.0);
    float t = fract(uTime * 0.1 + seq);
    float on = smoothstep(0.72, 0.28, t);
    float bar = smoothstep(0.06, 0.0, abs(fract(g.x) - 0.5) - 0.4);
    float warm = pow(sin(vUv.y * 3.14159), 0.7);
    col = vec3(1.0, 0.74, 0.42) * on * warm * (0.4 + bar * 0.6);
    a = on * warm * 0.85;
  }

  /* 5 扇里半月 + 6 城廓一线，共用一个横向渐变壳 */
  void crescent(out vec3 col, out float a){
    vec2 p = (vUv - 0.5) * vec2(1.6, 1.0);
    float d = length(p - vec2(0.06, 0.16));
    float disc = smoothstep(0.2, 0.14, d);
    float bite = smoothstep(0.19, 0.13, length(p - vec2(0.15, 0.2)));
    float m = clamp(disc - bite, 0.0, 1.0);
    float lane = exp(-pow((vUv.y - 0.34) / 0.06, 2.0)) * 0.4;
    col = vec3(0.86, 0.92, 1.0) * m * 1.4 + vec3(0.6, 0.62, 0.7) * lane;
    a = clamp(m + lane, 0.0, 1.0);
  }
  void skyline(out vec3 col, out float a){
    float band = exp(-pow((vUv.y - 0.42) / 0.05, 2.0));
    float windows = step(0.86, h(floor(vec2(vUv.x * 90.0, 4.0)))) * band;
    col = vec3(0.9, 0.66, 0.34) * windows * 1.4 + vec3(0.34, 0.44, 0.6) * band * 0.5;
    a = band * 0.55 + windows * 0.5;
  }

  void main(){
    vec3 col = vec3(0.0); float a = 0.0;
    int m = int(uMode + 0.5);
    if (m == 0) ink(col, a);
    else if (m == 1) bamboo(col, a);
    else if (m == 2) corridor(col, a);
    else if (m == 3) rain(col, a);
    else if (m == 4) grid(col, a);
    else if (m == 5) crescent(col, a);
    else skyline(col, a);
    gl_FragColor = vec4(col * uTint, a * uMix);
  }`;

const MODE = {
  ink: 0, bamboo: 1, corridor: 2, rain: 3, finale: 4, moon: 5, plantain: 3, skyline: 6,
};

export function createShow({ scene, env, props, water, columns, kun }) {
  const root = new THREE.Group();
  root.name = 'projections';
  scene.add(root);

  // 幕布：贴在各面墙前，随节目换 uMode
  const screens = projectionSurfaces().map((s) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uMix: { value: 0 }, uMode: { value: 0 },
        uTint: { value: new THREE.Color('#ffffff') },
      },
      vertexShader: PROJECTOR_VERT,
      fragmentShader: PROJECTOR_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    mat.toneMapped = false;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    mesh.renderOrder = 6;
    mesh.visible = false;
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = s.yaw || 0;
    root.add(mesh);
    return { ...s, mesh, mat };
  });

  const nearestScreen = (kind) => screens.find((sc) => sc.kind === kind);

  // 水面用的月光增强 + 涟漪，由节目开关
  const moonLane = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('206,226,250', 0.1), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  moonLane.material.toneMapped = false;
  moonLane.scale.set(26, 8, 1);
  moonLane.position.set(2, WATER_Y + 0.3, 2);
  moonLane.visible = false;
  root.add(moonLane);

  // 灯位走廓用的行进光
  const traveller = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,196,124', 0.16), transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  }));
  traveller.material.toneMapped = false;
  traveller.scale.set(5.2, 5.2, 1);
  traveller.visible = false;
  root.add(traveller);

  let active = null;      // { id, t0, dur, name }
  let rainUntil = -1;
  let lampRestore = null;

  const HOOKS = {
    ink(t, k) {
      const s = nearestScreen('ink');
      if (s) { s.mat.uniforms.uMode.value = MODE.ink; s.mesh.visible = k > 0.02; }
      env.accents[0].intensity = 62 + 90 * k;
    },
    bamboo(t, k) {
      const s = nearestScreen('plantain') || nearestScreen('ink');
      if (s) { s.mat.uniforms.uMode.value = MODE.bamboo; s.mesh.visible = k > 0.02; }
    },
    corridor(t, k, self) {
      const s = nearestScreen('corridor');
      if (s) { s.mat.uniforms.uMode.value = MODE.corridor; s.mesh.visible = k > 0.02; }
      // 提灯引路：廊灯按行进位置依次点亮
      const n = props.langLamps.length;
      const head = (t * 0.12) % 1;
      props.langLamps.forEach((l, i) => {
        const f = i / (n - 1);
        const on = head - f > -0.04 && head - f < 0.34;
        props.setLampOn(l, on);
      });
      const [x, z] = pathAt(LAYOUT.corridor, head);
      traveller.position.set(x, 2.5, z);
      traveller.visible = true;
      self.corridor = true;
    },
    moonrise(t, k) {
      water.uniforms.uGlow.value = 1 + 1.5 * k;
      moonLane.visible = k > 0.02;
      moonLane.material.opacity = 0.25 + 0.5 * k;
      const s = nearestScreen('moon');
      if (s) { s.mat.uniforms.uMode.value = MODE.moon; s.mesh.visible = k > 0.02; }
    },
    bridge(t, k) {
      const s = nearestScreen('corridor');
      if (s) { s.mat.uniforms.uMode.value = MODE.corridor; s.mesh.visible = k > 0.03; s.mat.uniforms.uMix.value = k * 0.4; }
      if (rand() < 0.25 * k) water.rings.emit(29 + rr(-3, 3), 14 + rr(-4, 4), t, rr(0.3, 0.7));
    },
    lotuslight(t, k) {
      props.field.wind.value = 1 + 0.9 * k;
      if (rand() < 0.2 * k) water.rings.emit(-6 + rr(-9, 9), -2 + rr(-7, 7), t, rr(0.2, 0.5));
    },
    boatlamp(t, k, self) {
      const s = nearestScreen('moon');
      if (s) { s.mat.uniforms.uMode.value = MODE.crescent; s.mesh.visible = k > 0.02; }
      if (!self.started) { self.started = true; if (kun && kun.ready) kun.sing('xiangzhou'); }
      env.accents[1].intensity = 46 + 70 * k;
    },
    moongate(t, k) {
      if (rand() < 0.16 * k) water.rings.emit(32 + rr(-5, 5), 0 + rr(-5, 5), t, rr(0.25, 0.6));
      env.accents[1].intensity = 46 + 40 * k;
    },
    rain(t, k, self) {
      const s = nearestScreen('plantain');
      if (s) { s.mat.uniforms.uMode.value = MODE.rain; s.mesh.visible = k > 0.02; }
      if (!self.started) { self.started = true; rainUntil = t + (SHOWS.rain ? SHOWS.rain.seconds : 12); if (kun) kun.rain(); }
      water.rings.rain(24, 33, 6, 3, t);
      water.rings.rain(22, 35, 5, 2, t);
    },
    fanlight(t, k) {
      const s = nearestScreen('moon');
      if (s) { s.mat.uniforms.uMode.value = MODE.crescent; s.mesh.visible = k > 0.02; }
      if (rand() < 0.2 * k) water.rings.emit(-52 + rr(-8, 8), 12 + rr(-6, 6), t, rr(0.2, 0.5));
    },
    finale(t, k) {
      const s = nearestScreen('finale');
      if (s) { s.mat.uniforms.uMode.value = MODE.grid; s.mesh.visible = k > 0.02; }
      env.accents[2].intensity = 58 + 120 * k;
    },
    skyline(t, k) {
      const s = nearestScreen('moon');
      if (s) { s.mat.uniforms.uMode.value = MODE.skyline; s.mesh.visible = k > 0.02; }
      moonLane.visible = k > 0.02;
      moonLane.position.set(-40, WATER_Y + 0.4, -6);
      moonLane.material.opacity = 0.2 + 0.4 * k;
      env.accents[1].intensity = 46 + 60 * k;
    },
  };

  function pathAt(points, f) {
    const total = points.length - 1;
    const f2 = Math.max(0, Math.min(0.999, f)) * total;
    const i = Math.floor(f2), k = f2 - i;
    const [x0, z0] = points[i], [x1, z1] = points[Math.min(total, i + 1)];
    return [x0 + (x1 - x0) * k, z0 + (z1 - z0) * k];
  }

  function off() {
    for (const s of screens) { s.mesh.visible = false; s.mat.uniforms.uMix.value = 0; }
    moonLane.visible = false;
    traveller.visible = false;
    water.uniforms.uGlow.value = 1;
    props.field.wind.value = 1;
    env.accents[0].intensity = 62;
    env.accents[1].intensity = 46;
    env.accents[2].intensity = 58;
    if (lampRestore) { props.setDensity(lampRestore); lampRestore = null; }
    if (kun) kun.stopRain();
    active = null;
  }

  return {
    get activeId() { return active ? active.id : null; },
    get name() { return active ? active.name : '未起'; },
    run(id, t, density = 1) {
      const def = SHOWS[id];
      if (!def || !HOOKS[id]) { off(); return null; }
      off();
      lampRestore = density;
      active = { id, name: def.name, t0: t, dur: def.seconds, hook: HOOKS[id], started: false };
      props.boost(0.85);
      return active;
    },
    stop() { off(); },
    progress(t) { return active ? Math.max(0, Math.min(1, (t - active.t0) / active.dur)) : 0; },
    update(t, dt) {
      for (const s of screens) if (s.mesh.visible) s.mat.uniforms.uTime.value = t;
      if (rainUntil > 0 && t < rainUntil) {
        water.rings.rain(24, 33, 7, 2, t);
      } else if (rainUntil > 0 && t >= rainUntil) rainUntil = -1;
      if (!active) return;
      const p = (t - active.t0) / active.dur;
      if (p >= 1) { off(); return; }
      // 起—峰—收，三段包络
      const k = Math.sin(Math.PI * Math.min(1, Math.max(0, p))) ** 0.7;
      for (const s of screens) if (s.mesh.visible) s.mat.uniforms.uMix.value = k;
      active.hook(t, k, active);
      void dt;
    },
  };
}
