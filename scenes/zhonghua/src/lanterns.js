import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, rr, stringPath, glow } from './kit.js';
import { GROUND_Y as G, WALK_Y, ARRAY_PHASES, HALF_W, COURTS } from './data.js';
import * as T from './textures.js';

/* ------------------------------------------------------------------ 排期 */

/** 三重瓮城 + 城台，各占一段进度 */
const GROUPS = ARRAY_PHASES.map((p, i) => ({
  id: i + 1, to: p.at, from: i === 0 ? 0 : ARRAY_PHASES[i - 1].at,
  label: p.label,
}));

/** 一段里三件事依次登场：洞里起火 → 院里悬灯 → 城头连成一条 */
const SUB = [0.4, 0.4, 0.2];

/** 第 group 段里、第 slot 类灯的第 i 盏（共 n 盏）该在进度轴上的位置 */
function slotTime(group, slot, i, n) {
  const g = GROUPS[group - 1];
  const base = g.from + (g.to - g.from) * SUB.slice(0, slot).reduce((a, b) => a + b, 0);
  const width = (g.to - g.from) * SUB[slot];
  return base + width * (n <= 1 ? 0.4 : 0.05 + 0.9 * (i / (n - 1)));
}

/* ------------------------------------------------------------------ 灯身 */

const roundGeo = new THREE.SphereGeometry(0.42, 12, 9);
roundGeo.scale(1, 0.86, 1);
const hexGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.74, 6);
const capGeo = new THREE.CylinderGeometry(0.2, 0.26, 0.14, 8);
const poleGeo = new THREE.CylinderGeometry(0.055, 0.075, 1, 5);

function lampMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uWave: { value: 0 }, uLit: { value: 1 }, uTime: { value: 0 }, uMap: { value: map },
    },
    vertexShader: `
      attribute float aStart; attribute float aPhase;
      uniform float uWave; uniform float uLit;
      varying vec3 vC; varying float vOn; varying float vPh; varying vec2 vUv;
      void main(){
        vOn = smoothstep(aStart, aStart + 0.045, uWave) * uLit;
        vPh = aPhase; vC = instanceColor; vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uTime;
      varying vec3 vC; varying float vOn; varying float vPh; varying vec2 vUv;
      void main(){
        vec3 p = texture2D(uMap, vUv).rgb;
        float flick = 0.86 + 0.14 * sin(uTime * 3.1 + vPh * 6.28);
        // 熄着时不是一块死黑：只留一线墙体反上来的灰，形还认得出但不抢画面
        vec3 c = vC * p * mix(0.022, 1.6, vOn) * mix(0.5, flick, vOn);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

class LampLayer {
  constructor(scene, max = 900) {
    this.max = max;
    this.items = [];
    this.d = new THREE.Object3D();
    const paper = T.lanternPaper();
    this.materials = {
      round: lampMaterial(paper),
      hex: lampMaterial(paper),
      cap: lampMaterial(paper),
    };
    this.meshes = {};
    for (const [key, src] of [['round', roundGeo], ['hex', hexGeo], ['cap', capGeo]]) {
      const geo = src.clone();
      geo.setAttribute('aStart', new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
      const m = new THREE.InstancedMesh(geo, this.materials[key], max);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      m.frustumCulled = false;
      m.count = 0;
      this.meshes[key] = m;
      scene.add(m);
    }

    const haloMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uTime: { value: 0 }, uWave: { value: 0 }, uLit: { value: 1 },
        uTex: { value: T.softGlow('255,192,124', 0.06) },
      },
      vertexShader: `
        attribute float aStart; attribute float aPhase; attribute vec3 aCol; attribute float aSize;
        uniform float uWave; uniform float uTime; uniform float uLit;
        varying vec3 vC; varying float vA;
        void main(){
          float on = smoothstep(aStart, aStart + 0.045, uWave) * uLit;
          vC = aCol;
          vA = on * (0.7 + 0.3 * sin(uTime * 2.4 + aPhase * 6.28));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(110.0, aSize * 430.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA * 0.16); }`,
    });
    this.haloGeo = new THREE.BufferGeometry();
    this.halo = new THREE.Points(this.haloGeo, haloMat);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 5;
    scene.add(this.halo);
    this.haloMat = haloMat;

    // 城头与马道上的灯要有杆子才站得住
    this.poles = [];
  }

  add(p, { color, size = 1, shape = 'round', start = 1, pole = 0 } = {}) {
    if (this.items.length >= this.max) return;
    this.items.push({ p: p.clone(), color: new THREE.Color(color), size, shape, start });
    if (pole > 0) this.poles.push([p.clone(), pole]);
  }

  build() {
    const per = { round: 0, hex: 0, cap: 0 };
    const tmp = new THREE.Color();
    const hp = [], hc = [], hs = [], hph = [], hst = [];
    for (const it of this.items) {
      const key = it.shape === 'hex' ? 'hex' : 'round';
      const m = this.meshes[key];
      const i = per[key]++;
      this.d.position.copy(it.p);
      this.d.scale.setScalar(it.size);
      this.d.rotation.set(0, rand() * 3.14, 0);
      this.d.updateMatrix();
      m.setMatrixAt(i, this.d.matrix);
      tmp.copy(it.color).multiplyScalar(1 + rand() * 0.5);
      m.setColorAt(i, tmp);
      m.geometry.attributes.aStart.setX(i, it.start);
      m.geometry.attributes.aPhase.setX(i, rand());

      const cm = this.meshes.cap, ci = per.cap++;
      this.d.position.copy(it.p).setY(it.p.y + it.size * 0.46);
      this.d.scale.setScalar(it.size * 0.8);
      this.d.rotation.set(0, 0, 0);
      this.d.updateMatrix();
      cm.setMatrixAt(ci, this.d.matrix);
      cm.setColorAt(ci, tmp.copy(it.color).multiplyScalar(0.42));
      cm.geometry.attributes.aStart.setX(ci, it.start);
      cm.geometry.attributes.aPhase.setX(ci, rand());

      hp.push(it.p.x, it.p.y, it.p.z);
      hc.push(it.color.r * 2.6, it.color.g * 2.6, it.color.b * 2.6);
      hs.push(it.size * 2.9);
      hph.push(rand());
      hst.push(it.start);
    }
    for (const m of Object.values(this.meshes)) {
      m.count = m === this.meshes.cap ? per.cap : m === this.meshes.round ? per.round : per.hex;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
      m.geometry.attributes.aStart.needsUpdate = true;
      m.geometry.attributes.aPhase.needsUpdate = true;
    }
    const g = this.haloGeo;
    g.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(hc, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(hs, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(hph, 1));
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(hst, 1));
    this.total = this.items.length;

    if (this.poles.length) {
      const parts = this.poles.map(([p, h]) => {
        const c = poleGeo.clone();
        c.scale(1, h, 1);
        c.translate(p.x, p.y - h / 2, p.z);
        return c;
      });
      const mesh = new THREE.Mesh(mergeGeometries(parts), glow('#2a2418', 0.9));
      mesh.castShadow = false;
      this.poleMesh = mesh;
    }
  }

  setWave(v) {
    for (const m of Object.values(this.materials)) m.uniforms.uWave.value = v;
    this.haloMat.uniforms.uWave.value = v;
  }
  setLit(v) {
    for (const m of Object.values(this.materials)) m.uniforms.uLit.value = v;
    this.haloMat.uniforms.uLit.value = v;
  }
  update(t) {
    for (const m of Object.values(this.materials)) m.uniforms.uTime.value = t;
    this.haloMat.uniforms.uTime.value = t;
  }
}

/* ------------------------------------------------------------------ 火光片 */

/**
 * 一批加法混合的四边形：藏兵洞底的火、洞口的光、门口地上溢出的一片。
 * 每片带自己的点亮时刻，所以点亮序列仍然只是一个 float。
 */
class GlowQuads {
  constructor(scene, { tex, gain = 1, renderOrder = 5 }) {
    this.pos = []; this.uv = []; this.st = []; this.ph = []; this.col = []; this.idx = [];
    this.uni = {
      uWave: { value: 0 }, uTime: { value: 0 }, uLit: { value: 1 },
      uTex: { value: tex }, uGain: { value: gain },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false, uniforms: this.uni,
      vertexShader: `
        attribute float aStart; attribute float aPhase; attribute vec3 aCol;
        uniform float uWave; uniform float uTime; uniform float uLit;
        varying vec2 vUv; varying float vOn; varying vec3 vC;
        void main(){
          vUv = uv; vC = aCol;
          float on = smoothstep(aStart, aStart + 0.06, uWave) * uLit;
          vOn = on * (0.84 + 0.16 * sin(uTime * 2.9 + aPhase * 6.28));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform float uGain;
        varying vec2 vUv; varying float vOn; varying vec3 vC;
        void main(){ float m = texture2D(uTex, vUv).a; gl_FragColor = vec4(vC * m * uGain, m * vOn); }`,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);
  }
  /** center + right·a + up·b，right/up 已经是半幅 */
  add(center, right, up, color, start) {
    const i = this.pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.pos.push(
        center.x + right.x * a + up.x * b,
        center.y + right.y * a + up.y * b,
        center.z + right.z * a + up.z * b,
      );
      this.uv.push((a + 1) / 2, (b + 1) / 2);
      this.col.push(color.r, color.g, color.b);
      this.st.push(start);
      this.ph.push(rand());
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  build() {
    const g = this.mesh.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(this.st, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.ph, 1));
    g.setIndex(this.idx);
  }
  setWave(v) { this.uni.uWave.value = v; }
  setLit(v) { this.uni.uLit.value = v; }
  update(t) { this.uni.uTime.value = t; }
}

/* ------------------------------------------------------------------ 灯阵 */

const WARM = ['#ffbe72', '#ffd08a', '#ff9a63', '#ff7a52'];
const pick = (i) => WARM[i % WARM.length];

/**
 * 瓮城灯阵。整套序列被压成一个标量 uWave（0→1）：每盏灯、每片火光都带
 * 自己的起点时刻，亮灭交给 shader 里的 smoothstep，推进时只改一个 uniform，
 * 几百盏灯不需要逐盏回写 instance 数据。
 */
export class LanternArray {
  constructor(scene, columns, anchors) {
    this.scene = scene;
    this.columns = columns;
    this.lamps = new LampLayer(scene);
    this.caveBack = new GlowQuads(scene, { tex: T.softGlow('255,206,150', 0.3), gain: 2.1, renderOrder: 6 });
    this.mouth = new GlowQuads(scene, { tex: T.softGlow('255,196,128', 0.14), gain: 1.5, renderOrder: 6 });
    this.spill = new GlowQuads(scene, { tex: T.softGlow('255,186,116', 0.06), gain: 1.2 });
    this.wave = 0;
    this.columnItems = [];
    this.build(anchors);
  }

  build(a) {
    this.buildCaves(a.caves);
    this.buildCourts(a.courts);
    this.buildPlatform(a.platform);
    this.buildPassages(a.passages);
    this.buildCrest(a.wallRuns);
    this.buildRamps(a.ramps);
    this.buildMoat();
    this.lamps.build();
    this.caveBack.build();
    this.mouth.build();
    this.spill.build();
    if (this.lamps.poleMesh) this.scene.add(this.lamps.poleMesh);
    if (this.ropeMesh) this.scene.add(this.ropeMesh);
  }

  /** 藏兵洞：洞口两侧各一盏、洞底一团火、门口地上溢开一片 */
  buildCaves(caves) {
    const byGroup = new Map();
    for (const c of caves) {
      if (!byGroup.has(c.group)) byGroup.set(c.group, []);
      byGroup.get(c.group).push(c);
    }
    for (const [group, list] of byGroup) {
      // 下层先亮、上层后亮；同层从中轴往两翼推
      list.sort((p, q) => (p.tier - q.tier) || (Math.abs(p.x) - Math.abs(q.x)) || (p.z - q.z));
      const n = list.length;
      list.forEach((c, i) => {
        const start = slotTime(group, 0, i, n);
        c.lampStart = start;
        const color = c.tier ? '#ffd08a' : '#ff9a63';
        this.outfitCave(c, c.x, c.z, c.nx, c.nz, c.y, start, color);
        // 垣体两面都被打通的洞，外侧那一面同样挂灯——门外望过去才有戏
        if (c.pierces) {
          this.outfitCave(c, c.x - c.nx * c.wt, c.z - c.nz * c.wt, -c.nx, -c.nz, c.y, start, color);
        }
      });
    }
  }

  outfitCave(c, mx, mz, nx, nz, my, start, color) {
    const alongX = nz !== 0;                       // 洞口朝南北时，两盏灯往左右分
    const ox = alongX ? c.w / 2 + 0.4 : 0.42;
    const oz = alongX ? 0.42 : c.w / 2 + 0.4;
    for (const s of [-1, 1]) {
      this.lamps.add(new THREE.Vector3(mx + s * ox, my + c.h + 0.55, mz + s * oz), {
        color, size: 0.92, shape: 'hex', start,
      });
    }
    const half = new THREE.Vector3(nz, 0, -nx);
    const out = new THREE.Vector3(nx, 0, nz);
    if (nx === c.nx && nz === c.nz) {
      // 只有真正的洞底才铺火光
      this.caveBack.add(
        new THREE.Vector3(c.x - c.nx * (c.depth - 0.5), c.y + c.h * 0.52, c.z - c.nz * (c.depth - 0.5)),
        new THREE.Vector3(c.nz, 0, -c.nx).multiplyScalar(c.w * 0.5), new THREE.Vector3(0, c.h * 0.48, 0),
        new THREE.Color(color).multiplyScalar(1.6), start,
      );
    }
    this.mouth.add(
      new THREE.Vector3(mx + out.x * 0.4, my + c.h * 0.44, mz + out.z * 0.4),
      half.clone().multiplyScalar(c.w * 0.62), new THREE.Vector3(0, c.h * 0.5, 0),
      new THREE.Color('#ffca8e').multiplyScalar(1.5), start,
    );
    if (!c.tier) {
      this.spill.add(
        new THREE.Vector3(mx + out.x * 2.3, my + 0.05, mz + out.z * 2.3),
        half.clone().multiplyScalar(c.w * 1.0), out.clone().multiplyScalar(2.5),
        new THREE.Color(color).multiplyScalar(1.7), start,
      );
    }
  }

  /** 三重瓮城：横拉在院子上空的绳灯 */
  buildCourts(courts) {
    const ropeY = 9.6;
    this.ropePaths = [];
    for (const court of courts) {
      const ropes = 6;
      const paths = [];
      const zFrom = court.z[0] + 2.5, zTo = court.z[1] - 6;   // 别一路拉到对面墙根
      for (let r = 0; r < ropes; r++) {
        const z = zFrom + (zTo - zFrom) * (r / (ropes - 1));
        paths.push(stringPath(
          new THREE.Vector3(court.x[0], G + ropeY + rr(-0.3, 0.3), z),
          new THREE.Vector3(court.x[1], G + ropeY + rr(-0.3, 0.3), z),
          1.4 + rand() * 0.9, 26,
        ));
      }
      this.ropePaths.push(...paths);
      const per = Math.ceil((paths[0].length - 2) / 2);
      let k = 0;
      for (const path of paths) {
        const ropeIdx = Math.floor(k / per);
        for (let i = 1; i < path.length - 1; i += 2, k++) {
          this.lamps.add(path[i].clone().setY(path[i].y - 0.66), {
            color: pick(k + court.id), size: 0.95 + (i % 3) * 0.1,
            shape: i % 4 === 1 ? 'round' : 'hex',
            start: slotTime(court.id, 1, ropeIdx, ropes),
          });
        }
      }
    }
    const seg = [];
    for (const path of this.ropePaths) {
      for (let i = 0; i < path.length - 1; i++) seg.push(path[i].x, path[i].y, path[i].z, path[i + 1].x, path[i + 1].y, path[i + 1].z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.ropeMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x141a28, fog: false }));
  }

  /** 城台空台面：原城楼没有复建，灯阵就排在这块地上 */
  buildPlatform(pf) {
    const cols = 9, rows = 4;
    const pts = [];
    for (let r = 0; r < rows; r++) {
      const z = pf.z[0] + 2.8 + (pf.z[1] - pf.z[0] - 5.6) * (r / (rows - 1));
      for (let c = 0; c < cols; c++) {
        const x = pf.x[0] + 7 + (pf.x[1] - pf.x[0] - 14) * (c / (cols - 1));
        pts.push(new THREE.Vector3(x, pf.y + 5.9 + (c % 2) * 0.8, z));
      }
    }
    pts.forEach((p, i) => {
      this.lamps.add(p, {
        color: pick(i), size: 1.2, shape: i % 3 ? 'round' : 'hex',
        start: slotTime(4, 1, i, pts.length), pole: p.y - pf.y - 0.1,
      });
    });
  }

  /** 四道券洞各悬三盏，券脸外圈再描一圈——门外望过去，门洞本身就是一只光环 */
  buildPassages(passages) {
    for (const p of passages) {
      for (let i = 0; i < 3; i++) {
        const start = slotTime(p.group, 0, i, 3);
        if (i === 1) p.lampStart = start;
        this.lamps.add(new THREE.Vector3(0, G + p.h - 1.6, p.cz + (i - 1) * (p.t / 3.4)), {
          color: '#ffd7a0', size: 0.96, shape: 'hex', start,
        });
      }
      const r = p.w / 2 + 0.95;
      const n = 9;
      for (const face of [-1, 1]) {
        const z = p.cz + face * (p.t / 2 + 0.34);
        for (let i = 0; i <= n; i++) {
          const a = Math.PI * (i / n);
          this.lamps.add(new THREE.Vector3(
            Math.cos(a) * r,
            G + p.spring + Math.sin(a) * r,
            z,
          ), {
            color: i % 2 ? '#ffb066' : '#ffd7a0', size: 0.62, shape: 'hex',
            start: slotTime(p.group, 0, i, n + 1),
          });
        }
      }
    }
  }

  /** 城头灯带：沿各道垣的垛口线，自中轴向两翼连过去 */
  buildCrest(runs) {
    const step = 7.2;
    for (const run of runs) {
      for (const face of run.faces) {
        const n = Math.max(2, Math.round(run.len / step));
        for (let i = 0; i <= n; i++) {
          const t = i / n, d = Math.abs(t - 0.5) * 2;
          const p = run.axis === 'x'
            ? new THREE.Vector3(-run.len / 2 + run.len * t, run.y + 1.5, face)
            : new THREE.Vector3(face, run.y + 1.5, run.cz - run.len / 2 + run.len * t);
          this.lamps.add(p, {
            color: i % 5 === 0 ? '#8ff0d2' : '#ffbe72', size: 1.15, shape: 'hex',
            start: slotTime(4, 2, Math.round(d * n), n + 1), pole: 1.5,
          });
        }
      }
    }
  }

  /** 马道坡上的灯，一路跟着坡度升上去 */
  buildRamps(ramps) {
    for (const r of ramps) {
      const n = 13;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const z = r.z0 + (r.z1 - r.z0) * t;
        this.lamps.add(new THREE.Vector3(r.x, G + WALK_Y * t + 1.5, z), {
          color: '#ffb066', size: 0.82, shape: 'hex',
          start: slotTime(4, 2, Math.round(t * n), n + 1), pole: 1.5,
        });
      }
    }
  }

  /** 护城河里的灯影光柱：水面接住的那一半。得落在河面上——贴着墙根会被垣体自己挡住 */
  buildMoat() {
    for (let i = 0; i <= 24; i++) {
      const x = -HALF_W + (HALF_W * 2 * i) / 24;
      const t = Math.abs(x) / HALF_W;
      const idx = this.columns.add(
        new THREE.Vector3(x, 0, -80 - 6 * (1 - t)),
        i % 5 === 0 ? '#8ff0d2' : '#ffb066', 2.4, 17, 1.15,
      );
      this.columnItems.push({ idx, start: GROUPS[3].from + (GROUPS[3].to - GROUPS[3].from) * (0.18 + 0.72 * t) });
    }
    for (let i = 0; i <= 12; i++) {
      const x = -300 + (600 * i) / 12;
      const idx = this.columns.add(new THREE.Vector3(x, 0, -76), '#ff9d5e', 1.6, 11, 0.7);
      this.columnItems.push({ idx, start: 0.04 + 0.3 * (i / 12) });
    }
    this.columns.flush();
  }

  /** 相机走到哪重瓮城，序列就该至少推进到那一重的末端 */
  static groupForZ(z) {
    for (let i = COURTS.length - 1; i >= 0; i--) {
      if (z >= COURTS[i].z[0] - 2) return i + 1;
    }
    return 0;
  }

  setWave(v) {
    this.wave = v;
    this.lamps.setWave(v);
    this.caveBack.setWave(v);
    this.mouth.setWave(v);
    this.spill.setWave(v);
    for (const c of this.columnItems) this.columns.setOn(c.idx, v >= c.start);
  }
  setLit(v) {
    this.lamps.setLit(v);
    this.caveBack.setLit(v);
    this.mouth.setLit(v);
    this.spill.setLit(v);
  }
  update(t) {
    this.lamps.update(t);
    this.caveBack.update(t);
    this.mouth.update(t);
    this.spill.update(t);
  }
  static phaseLabel(v) {
    for (const p of ARRAY_PHASES) if (v >= p.at - 0.004) return p.label;
    return '未起灯';
  }
}

export { GROUPS };
