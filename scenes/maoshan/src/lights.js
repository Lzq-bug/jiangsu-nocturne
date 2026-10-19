/**
 * 灯：招牌交互"上灯"的一条上山灯串 + 驳运车 + 香客。
 *
 * 夜景的合法性有出处：《茅山志》卷二十五记"預啟玉錄道場七晝夜"（道场跨夜），
 * 香期自农历腊月二十四至次年三月十八、"每日多时达万人，有时数万人"，
 * 2023 元宵元符万宁宫有"燃灯祈福拜太岁"，2026 年春节景区首次办新春游园灯会。
 * 至于灯的具体色温、灯位排列与山道两侧的灯桩，皆为写意。
 *
 * 成本口径：全山成百盏灯一律走 Points + 加色 Sprite（uWave 在 shader 里判次第），
 * 只有近机位的几十盏是实体宫灯；真实 PointLight 交给 environment.js 的六盏。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, PAL, glow, lit, rand, rr } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { GATE, LAOZI, YINGONG, DINGGONG, HUAYANG, WANSHOU, MEMORIAL, MJJ, PATHS } from './data.js';
import { padTop, heightAt } from './relief.js';

/* 上山次第：牌坊 → 盘山道 → 道祖广场（像）→ 印宫 → 华阳洞 → 顶宫 */
const STAGE = {
  gate: [0.0, 0.08],
  road: [0.08, 0.42],
  laozi: [0.42, 0.56],
  yingong: [0.56, 0.68],
  huayang: [0.68, 0.8],
  dinggong: [0.8, 1.0],
  side: 0.3, // 山脚两侧的万寿宫、碑、纪念馆随盘山道一起亮
};

const mixOrder = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ 灯串 */
class LampField {
  constructor(scene, spec) {
    this.spec = spec;
    this.max = spec.capacity || 1400;
    this.pos = new Float32Array(this.max * 3);
    this.order = new Float32Array(this.max);
    this.size = new Float32Array(this.max);
    this.hue = new Float32Array(this.max * 3);
    this.n = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aOrder', new THREE.BufferAttribute(this.order, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aHue', new THREE.BufferAttribute(this.hue, 3));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uTime: { value: 0 }, uWave: { value: 0 }, uBright: { value: 1 },
        uTex: { value: TX.softGlow('255,205,140', 0.1) }, uFlicker: { value: 1 },
      },
      vertexShader: `
        attribute float aOrder; attribute float aSize; attribute vec3 aHue;
        uniform float uTime, uWave, uBright, uFlicker;
        varying vec3 vHue; varying float vA;
        void main(){
          float on = smoothstep(aOrder, aOrder - 0.035, uWave);
          // 上灯的那一刻多闪一下，之后就稳在风里的轻微摆动
          float rise = smoothstep(0.0, 0.05, uWave - aOrder);
          float flick = 0.86 + 0.14 * sin(uTime * 2.6 + aOrder * 41.0) * uFlicker;
          vA = on * mix(0.35, 1.0, rise) * flick * uBright;
          vHue = aHue;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (1.0 + vA * 0.5) * (420.0 / max(28.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; varying vec3 vHue; varying float vA;
        void main(){
          float t = texture2D(uTex, gl_PointCoord).a;
          gl_FragColor = vec4(vHue, t * vA);
        }`,
    });
    this.uni = m.uniforms;
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.geo = g;
    scene.add(this.points);
  }

  add(x, y, z, order, size = 7, color = PAL.lanternWarm) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.order[i] = order;
    this.size[i] = size;
    const c = new THREE.Color(color);
    this.hue[i * 3] = c.r * 1.9; this.hue[i * 3 + 1] = c.g * 1.9; this.hue[i * 3 + 2] = c.b * 1.9;
    if (this.n === this.max) this.sync();
  }

  sync() {
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aOrder.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aHue.needsUpdate = true;
  }

  setWave(p) { this.uni.uWave.value = p; }
  setBright(v) { this.uni.uBright.value = v; }
  update(t) { this.uni.uTime.value = t; }
}

/* ------------------------------------------------------------------ 实体宫灯 */
function lanternGeo() {
  const parts = [];
  const body = new THREE.CylinderGeometry(0.34, 0.3, 0.72, 10, 1, false);
  body.translate(0, 0.36, 0);
  parts.push(body);
  const cap = new THREE.CylinderGeometry(0.42, 0.3, 0.14, 10);
  cap.translate(0, 0.78, 0);
  parts.push(cap);
  const tassel = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5);
  tassel.translate(0, -0.12, 0);
  parts.push(tassel);
  return mergeGeometries(parts);
}

/** 实体灯用 instanceColor 做次第点亮：只在 wave 变化时重写一遍颜色 */
class RealLanterns {
  constructor(scene, capacity = 260) {
    this.geo = lanternGeo();
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, capacity);
    this.slots = [];
    this.capacity = capacity;
    this.dummy = new THREE.Object3D();
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.wave = -1;
  }
  add(pos, order, scale = 1) {
    if (this.slots.length >= this.capacity) return;
    this.slots.push({ pos, order, scale });
    const i = this.slots.length - 1;
    const d = this.dummy;
    d.position.set(pos[0], pos[1], pos[2]);
    d.scale.setScalar(scale);
    d.rotation.y = rand() * 6.28;
    d.updateMatrix();
    this.mesh.setMatrixAt(i, d.matrix);
    this.mesh.count = this.slots.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  setWave(p) {
    if (Math.abs(p - this.wave) < 0.004) return;
    this.wave = p;
    const c = new THREE.Color();
    for (let i = 0; i < this.slots.length; i++) {
      const on = Math.max(0, Math.min(1, (p - this.slots[i].order) / 0.05));
      c.setStyle(PAL.lanternWarm).multiplyScalar(0.06 + 1.5 * on * on);
      this.mesh.setColorAt(i, c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ 驳运车 */
class Shuttle {
  constructor(scene, terrain, spec) {
    this.spec = spec;
    this.terrain = terrain;
    this.cars = [];
    const bodyGeo = mergeGeometries([
      new THREE.BoxGeometry(2.2, 1.5, 4.6).translate(0, 1.4, 0),
      new THREE.BoxGeometry(2.0, 0.9, 1.4).translate(0, 2.5, -1.3),
    ]);
    const shell = lit('#3b4250', { rough: 0.6, metal: 0.3, emissive: '#0b0e14', ei: 0.4 });
    for (let i = 0; i < spec.cars; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, shell));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), glow(spec.headColor, 2.2));
      head.position.set(0, 1.2, 2.4);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), glow(spec.tailColor, 1.8));
      tail.position.set(0, 1.3, -2.4);
      g.add(head, tail);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TX.softGlow('255,215,160', 0.14), color: 0xffffff, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.8,
      }));
      halo.scale.set(12, 12, 1);
      halo.position.set(0, 1.4, 2.6);
      g.add(halo);
      scene.add(g);
      this.cars.push({ g, halo, t: i / spec.cars, dir: 1 });
    }
  }
  update(dt, bright) {
    const n = this.cars.length;
    this.cars.forEach((c, i) => {
      c.t += dt * this.spec.speed / 1500 * (i % 2 === 0 ? 1 : -1);
      if (c.t > 0.985) c.t = 0.015;
      if (c.t < 0.015) c.t = 0.985;
      const at = this.terrain.at('road', Math.max(0.01, Math.min(0.99, c.t)), -1.6, 0);
      if (!at) return;
      c.g.position.set(at.x, at.y, at.z);
      c.g.rotation.y = at.yaw + (i % 2 === 0 ? 0 : Math.PI);
      c.halo.material.opacity = 0.55 * bright;
    });
    void n;
  }
}

/* ------------------------------------------------------------------ 香客 */
class Pilgrims {
  constructor(scene, spots) {
    const geo = mergeGeometries([
      new THREE.CylinderGeometry(0.17, 0.26, 1.1, 6).translate(0, 0.6, 0),
      new THREE.SphereGeometry(0.16, 8, 6).translate(0, 1.28, 0),
    ]);
    const mat = lit('#2a2f3a', { rough: 0.9, emissive: '#0a0d12', ei: 0.5 });
    this.mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const d = new THREE.Object3D();
    this.items = [];
    spots.forEach((s, i) => {
      const [x, z, order] = s;
      const y = heightAt(x, z);
      d.position.set(x, y, z);
      d.rotation.set(0, rand() * 6.28, 0);
      d.scale.setScalar(rr(0.9, 1.15));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.items.push({ i, x, y, z, order, phase: rand() * 6.28 });
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
    // 手上一盏小灯，跟着次第亮
    this.holds = new LampField(scene, { capacity: spots.length * 2 });
    this.items.forEach((it) => this.holds.add(it.x, it.y + 1.15, it.z, it.order, 3.4, PAL.lampGlow));
  }
  update(t) { this.holds.uni.uTime.value = t; }
  setWave(p) { this.holds.setWave(p); }
  setBright(v) { this.holds.setBright(v); }
}

/* ------------------------------------------------------------------ 组装 */
export function buildLights(scene, terrain) {
  const lamps = new LampField(scene, { capacity: 1600 });
  const real = new RealLanterns(scene, 320);
  const anchors = { pilgrimSpots: [] };

  // ① 牌坊与山门广场：两侧灯桩 + 牌坊下的六盏大灯
  const gp = padTop(GATE.pad);
  for (let i = 0; i <= GATE.lanterns; i++) {
    const t = i / GATE.lanterns;
    const z = GATE.z + 60 - t * 150;
    for (const s of [-1, 1]) {
      const x = GATE.x + s * 26;
      const y = heightAt(x, z);
      lamps.add(x, y + 5.4, z, mixOrder(...STAGE.gate, t), 12);
      real.add([x, y + 5.1, z], mixOrder(...STAGE.gate, t), 1.5);
      if (i % 4 === 0) anchors.pilgrimSpots.push([x + s * 3, z, mixOrder(...STAGE.gate, t)]);
    }
  }
  for (const s of [-1, 1]) {
    real.add([GATE.x + s * 7, gp + GATE.paifang.h - 1.4, GATE.z + GATE.paifang.dz], STAGE.gate[1], 2.1);
  }

  // ② 盘山道：每隔十余米一盏，左右交替；之字弯的腰上最密
  const road = PATHS.find((p) => p.id === 'road');
  const steps = Math.round(1400 / 16);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const side = i % 2 === 0 ? 1 : -1;
    const at = terrain.at('road', Math.min(0.998, t), side * (road.width / 2 + 1.2));
    if (!at) continue;
    const order = mixOrder(...STAGE.road, t);
    lamps.add(at.x, at.y + 4.9, at.z, order, 11);
    if (i % 3 === 0) real.add([at.x, at.y + 4.6, at.z], order, 1.3);
    if (i % 7 === 0) anchors.pilgrimSpots.push([at.x - side * 2.6, at.z, order]);
  }

  // ③ 道祖广场与老子像：环坛十盏 + 像身脚下一圈 + 两侧殿檐
  const lp = padTop(LAOZI.pad);
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.06 + 0.88 * (i / 13));
    const r = 20;
    const x = LAOZI.x + Math.sin(a) * r, z = LAOZI.z + Math.cos(a) * r;
    const order = mixOrder(...STAGE.laozi, i / 13);
    lamps.add(x, heightAt(x, z) + 4.4, z, order, 13, '#ffca86');
    real.add([x, heightAt(x, z) + 4.1, z], order, 1.7);
    if (i % 2 === 0) anchors.pilgrimSpots.push([x + Math.sin(a) * 3.4, z + Math.cos(a) * 3.4, order]);
  }
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * 2 * (i / 12);
    lamps.add(LAOZI.x + Math.sin(a) * 10.2, lp + 7.6, LAOZI.z + Math.cos(a) * 10.2, STAGE.laozi[0] + 0.02, 9, '#ffe0b4');
  }

  // ④ 印宫：檐下一排 + 三天门两盏 + 阶道两侧
  const yp = padTop(YINGONG.pad);
  YINGONG.halls.forEach((s, hi) => {
    const n = Math.max(3, Math.round(s.w / 3.4));
    for (let i = 0; i < n; i++) {
      const x = YINGONG.x - s.w / 2 + (s.w * (i + 0.5)) / n;
      const order = mixOrder(...STAGE.yingong, (hi + i / n) / (YINGONG.halls.length + 2));
      lamps.add(x, yp + s.h * 0.78, YINGONG.z + s.dz + s.d / 2 + 0.8, order, 10);
      real.add([x, yp + s.h * 0.74, YINGONG.z + s.dz + s.d / 2 + 0.8], order, 1.15);
    }
  });
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const at = terrain.at('palace-steps', Math.min(0.99, t), (i % 2 ? 1 : -1) * 4.2);
    if (at) lamps.add(at.x, at.y + 1.5, at.z, mixOrder(0.5, 0.58, t), 7, '#ffb06a');
  }

  // ⑤ 华阳洞：洞口两盏 + 崖前香案 + 阶道
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const at = terrain.at('stair', 0.52 + t * 0.16, (i % 2 ? 1 : -1) * 2.8);
    if (at) lamps.add(at.x, at.y + 2.2, at.z, mixOrder(...STAGE.huayang, t), 8, PAL.lanternJade);
  }
  const hp = padTop(HUAYANG.pad);
  for (const s of [-1, 1]) lamps.add(HUAYANG.x + s * 5.4, hp + 2.2, HUAYANG.z + 4, STAGE.huayang[1], 12, '#9ff0d8');

  // ⑥ 顶宫：殿檐、广场、石坊、香炉，最后亮
  const dp = padTop(DINGGONG.pad);
  DINGGONG.halls.forEach((s, hi) => {
    const n = Math.max(3, Math.round(s.w / 3.2));
    for (let i = 0; i < n; i++) {
      const x = DINGGONG.x - s.w / 2 + (s.w * (i + 0.5)) / n;
      const order = mixOrder(...STAGE.dinggong, (hi * 0.7 + i / n) / (DINGGONG.halls.length + 1));
      lamps.add(x, dp + s.h * 0.8, DINGGONG.z + s.dz + s.d / 2 + 0.9, order, 12);
      real.add([x, dp + s.h * 0.76, DINGGONG.z + s.dz + s.d / 2 + 0.9], order, 1.25);
    }
  });
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const order = mixOrder(...STAGE.dinggong, 0.86 + t * 0.12);
    for (const s of [-1, 1]) {
      lamps.add(DINGGONG.x + s * (10 + t * 24), dp + 3.6, DINGGONG.z + DINGGONG.plaza.dz - t * 30, order, 11);
      real.add([DINGGONG.x + s * (10 + t * 24), dp + 3.3, DINGGONG.z + DINGGONG.plaza.dz - t * 30], order, 1.4);
    }
  }
  // 登山神道两侧的石灯，一路排到顶宫台下
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const at = terrain.at('stair', Math.min(0.995, t), (i % 2 ? 1 : -1) * 3.2);
    if (!at) continue;
    lamps.add(at.x, at.y + 1.7, at.z, mixOrder(0.62, 0.96, t), 7.5);
  }

  // ⑦ 山脚三处：红庙、纪念碑、纪念馆——跟着盘山道亮起来
  const shore = [WANSHOU, MEMORIAL, MJJ];
  shore.forEach((site) => {
    const y = site.pad ? padTop(site.pad) : heightAt(site.x, site.z);
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * 2 * (i / 12);
      const r = 16 + (i % 3) * 5;
      const x = site.x + Math.sin(a) * r, z = site.z + Math.cos(a) * r;
      lamps.add(x, Math.max(heightAt(x, z), y) + 3.6, z, STAGE.side, 10,
        site === WANSHOU ? '#ff8a5c' : PAL.lanternWarm);
    }
  });

  const cars = new Shuttle(scene, terrain, { cars: 3, speed: 11, headColor: '#ffe0b0', tailColor: '#ff5a3c' });
  const pilgrims = new Pilgrims(scene, anchors.pilgrimSpots.slice(0, 120));

  lamps.sync();
  return {
    lamps, real, cars, pilgrims,
    setWave(p) {
      lamps.setWave(p);
      real.setWave(p);
      pilgrims.setWave(p);
    },
    setBright(v) {
      lamps.setBright(v);
      pilgrims.setBright(v);
      real.mesh.visible = v > 0.04;
    },
    update(t, dt, bright) {
      lamps.update(t);
      pilgrims.update(t);
      cars.update(dt, bright);
    },
  };
}

