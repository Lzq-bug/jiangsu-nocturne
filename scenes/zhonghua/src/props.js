import * as THREE from 'three';
import { M, box, glow, rand, rr, figureGeo, railingGeo } from './kit.js';
import { GROUND_Y as G, HALF_W, COURT_HALF, COURTS, WALLS, WALK_Y, CREST_Y, MOAT } from './data.js';
import * as T from './textures.js';

/* ------------------------------------------------------------------ 巡城人影 */

/**
 * 瓮城不是街市，夜里在墙上走动的是巡卒与提灯的人。路径按可以走的地方给：
 * 中轴御道、三重院子的墙根、城头走道、两条马道、护城河北岸。
 */
const W = G + 0.02;
function ramp(sign) {
  const z0 = WALLS.first.z[0], run = 86, rise = WALK_Y;
  const x = sign * (HALF_W + 8 - 0.9);
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, W + 0.1, z0 + 3),
    new THREE.Vector3(x, W + rise * 0.34, z0 + run * 0.34),
    new THREE.Vector3(x, W + rise * 0.68, z0 + run * 0.68),
    new THREE.Vector3(x, W + rise + 0.1, z0 + run + 1),
    new THREE.Vector3(sign * (HALF_W - 4), W + rise + 0.1, 52),
  ]);
}

export const WALK_PATHS = [
  // 中轴御道，自第一道券门直通城台
  { a: [0, W, -60], b: [0, W, 60] },
  { a: [-1.6, W, 58], b: [-1.6, W, -58] },
  { a: [1.8, W, -50], b: [1.8, W, 46] },
  // 三重院子的墙根
  ...COURTS.flatMap((c) => {
    const cz = (c.z[0] + c.z[1]) / 2, span = c.z[1] - c.z[0];
    return [
      { a: [-COURT_HALF + 4, W, c.z[0] + 2], b: [-COURT_HALF + 4, W, c.z[1] - 2] },
      { a: [COURT_HALF - 4, W, c.z[1] - 2], b: [COURT_HALF - 4, W, c.z[0] + 2] },
      { a: [-COURT_HALF + 7, W, cz], b: [COURT_HALF - 7, W, cz + span * 0.22] },
    ];
  }),
  // 城头：四道垣的顶面走道 + 东西侧垣顶
  ...Object.values(WALLS).map((w) => ({
    a: [-HALF_W + 5, G + CREST_Y + 0.1, (w.z[0] + w.z[1]) / 2],
    b: [HALF_W - 5, G + CREST_Y + 0.1, (w.z[0] + w.z[1]) / 2],
  })),
  ...[-1, 1].map((s) => ({
    a: [s * (HALF_W - 1), G + CREST_Y + 0.1, WALLS.first.z[0] + 4],
    b: [s * (HALF_W - 1), G + CREST_Y + 0.1, WALLS.main.z[0] - 4],
  })),
  // 护城河北岸
  { a: [-150, 3.6, MOAT.centerZ + MOAT.halfWidth + 5], b: [150, 3.6, MOAT.centerZ + MOAT.halfWidth + 5] },
  { a: [110, 3.6, MOAT.centerZ + MOAT.halfWidth + 9], b: [-110, 3.6, MOAT.centerZ + MOAT.halfWidth + 9] },
  // 两条马道：走上城头的队伍
  { curve: ramp(1) },
  { curve: ramp(-1) },
  // 门内中华路
  { a: [-9, W, 70], b: [9, W, 132] },
  { a: [14, W, 128], b: [-14, W, 68] },
];

const LANTERN = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uTime: { value: 0 }, uTex: { value: T.softGlow('255,176,104', 0.08) } },
  vertexShader: `attribute float aPhase; uniform float uTime; varying float vA;
    void main(){ vA = 0.7 + 0.3*sin(uTime*3.4 + aPhase*6.28);
      vec4 mv = modelViewMatrix*vec4(position,1.0);
      gl_PointSize = min(28.0, 110.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform sampler2D uTex; varying float vA;
    void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.58,0.26)*2.2, t.a*vA*0.72); }`,
});

export class Crowd {
  constructor(scene, { paths = WALK_PATHS, max = 320, lanternRate = 0.5 } = {}) {
    this.paths = paths;
    this.max = max;
    this.lanternRate = lanternRate;
    this.agents = [];
    this.d = new THREE.Object3D();
    this.mesh = new THREE.InstancedMesh(
      figureGeo(1),
      new THREE.MeshStandardMaterial({ color: 0x171b26, roughness: 0.93 }),
      max,
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.lPos = new Float32Array(max * 3);
    this.lPhase = new Float32Array(max);
    this.lanternGeo = new THREE.BufferGeometry();
    this.lanternGeo.setAttribute('position', new THREE.BufferAttribute(this.lPos, 3));
    this.lanternGeo.setAttribute('aPhase', new THREE.BufferAttribute(this.lPhase, 1));
    this.lanterns = new THREE.Points(this.lanternGeo, LANTERN);
    this.lanterns.frustumCulled = false;
    this.lanterns.renderOrder = 5;
    scene.add(this.lanterns);

    const lens = paths.map((p) => (p.curve
      ? p.curve.getLength()
      : Math.hypot(p.b[0] - p.a[0], p.b[2] - p.a[2])));
    const total = lens.reduce((a, b) => a + b, 0);
    const cum = [];
    lens.reduce((acc, l) => { const v = acc + l / total; cum.push(v); return v; }, 0);
    for (let i = 0; i < max; i++) {
      const idx = Math.max(0, cum.findIndex((c) => rand() <= c));
      this.agents.push({
        path: paths[idx] || paths[0],
        t: rand(),
        sp: rr(0.004, 0.013) * (rand() > 0.5 ? 1 : -1),
        off: rr(-1.5, 1.5),
        phase: rand() * 6.28,
        scale: rr(0.9, 1.12),
        lamp: rand() < lanternRate,
      });
    }
  }

  place(a, out) {
    const { path } = a;
    if (path.curve) {
      path.curve.getPointAt(Math.min(1, Math.max(0, a.t)), out);
      const tan = path.curve.getTangentAt(Math.min(1, Math.max(0.001, a.t)));
      out.x += -tan.z * a.off * 0.5;
      out.z += tan.x * a.off * 0.5;
      return Math.atan2(tan.z * Math.sign(a.sp) || 1, tan.x * Math.sign(a.sp) || 1);
    }
    const px = path.b[0] - path.a[0], pz = path.b[2] - path.a[2];
    const len = Math.hypot(px, pz) || 1;
    out.set(
      path.a[0] + px * a.t + (-pz / len) * a.off,
      path.a[1] + (path.b[1] - path.a[1]) * a.t,
      path.a[2] + pz * a.t + (px / len) * a.off,
    );
    return Math.atan2(pz * Math.sign(a.sp), px * Math.sign(a.sp));
  }

  update(t, dt, count, eye) {
    const n = Math.max(0, Math.min(this.max, count | 0));
    const d = this.d;
    const v = new THREE.Vector3();
    let li = 0;
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      a.t += dt * a.sp;
      if (a.t > 1) a.t -= 1;
      if (a.t < 0) a.t += 1;
      const heading = this.place(a, v);
      const stride = Math.sin(t * 5.2 + a.phase);
      const near = eye && v.distanceTo(eye) < 6.5;
      d.position.set(v.x, v.y + Math.abs(stride) * 0.05, v.z);
      d.rotation.set(0, -heading + Math.PI / 2, stride * 0.035);
      d.scale.setScalar(near ? 0 : a.scale);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      if (a.lamp && !near && li < this.max) {
        this.lPos.set([v.x + 0.36, v.y + 1.48 + stride * 0.05, v.z], li * 3);
        this.lPhase[li] = a.phase;
        li++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.lanternGeo.setDrawRange(0, li);
    this.lanternGeo.attributes.position.needsUpdate = true;
    this.lanternGeo.attributes.aPhase.needsUpdate = true;
    LANTERN.uniforms.uTime.value = t;
  }
}

/* ------------------------------------------------------------------ 牙旗 */

/**
 * 城头的旗。夜里没有风也得不安分，所以每面旗自己抖：
 * 顶点直接在 JS 里按正弦改，几面旗的量可以忽略。
 */
function flag(width, height, color) {
  const g = new THREE.PlaneGeometry(width, height, 10, 4);
  // 下缘收成牙形（牙旗的缺口）
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (y < -height * 0.38) {
      const notch = Math.abs(((x + width / 2) % (width / 4)) - width / 8) / (width / 8);
      pos.setY(i, y + height * 0.16 * notch);
    }
  }
  g.userData = { base: pos.array.slice(), width, height };
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.82, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.x = width / 2;
  return mesh;
}

export function buildFlags(scene, anchors) {
  const grp = new THREE.Group();
  const cloths = [];
  const poleMat = M.beam;
  const spots = [];
  // 城台四角与两券门之上，加上东西侧垣的中段
  for (const s of [-1, 1]) {
    spots.push([s * (HALF_W - 5), G + CREST_Y, WALLS.main.z[1] - 2]);
    spots.push([s * (HALF_W - 5), G + CREST_Y, WALLS.main.z[0] + 2]);
    spots.push([s * (HALF_W - 1.2), G + CREST_Y, -34]);
    spots.push([s * (HALF_W - 1.2), G + CREST_Y, 8]);
  }
  spots.push([0, G + CREST_Y, WALLS.main.z[1] - 2]);
  spots.push([-26, G + CREST_Y, WALLS.main.z[0] + 2]);
  spots.push([26, G + CREST_Y, WALLS.main.z[0] + 2]);

  spots.forEach(([x, y, z], i) => {
    const h = 6.4 + rand() * 2.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, h, 6), poleMat);
    pole.position.set(x, y + h / 2, z);
    pole.castShadow = true;
    grp.add(pole);
    const cloth = flag(2.6 + rand() * 0.7, 1.6 + rand() * 0.5, i % 3 === 0 ? '#8d2a22' : i % 3 === 1 ? '#b8863c' : '#6d211f');
    cloth.position.set(x + 0.1, y + h - 1.2, z);
    cloth.rotation.y = z > 20 ? 0 : Math.PI;
    grp.add(cloth);
    cloths.push(cloth);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6), glow('#d8ab63', 0.5));
    tip.position.set(x, y + h + 0.2, z);
    grp.add(tip);
  });

  scene.add(grp);
  void anchors;
  return {
    group: grp,
    update(t) {
      for (const c of cloths) {
        const p = c.geometry.attributes.position;
        const base = c.geometry.userData.base;
        const w = c.geometry.userData.width, hh = c.geometry.userData.height;
        for (let i = 0; i < p.count; i++) {
          const bx = base[i * 3], by = base[i * 3 + 1];
          const along = (bx + w / 2) / w;                    // 离旗杆越远抖得越大
          const k = along * along;
          p.setZ(i, Math.sin(t * 2.4 + bx * 1.9 + by * 0.7) * 0.34 * k
            + Math.sin(t * 4.1 + bx * 3.2) * 0.14 * k);
          p.setY(i, by + Math.sin(t * 3.0 + bx * 2.4) * 0.07 * k);
        }
        p.needsUpdate = true;
      }
    },
  };
}

/* ------------------------------------------------------------------ 灯船 */

/** 护城河上巡夜的几只灯船：船体是剪影，看点全在灯与水的接应 */
export function buildFleet(scene, columns) {
  const grp = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x12151f, roughness: 0.9 });
  const boats = [];
  const zLine = MOAT.centerZ;
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.1, 2.1), hullMat);
    hull.position.y = 0.35;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.4, 4), hullMat);
    bow.rotation.z = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(5.0, 0.4, 0);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.5, 1.7), M.dark);
    cabin.position.set(-0.8, 1.35, 0);
    b.add(hull, bow, cabin);

    const lamps = [];
    for (const px of [-2.2, 0.4, 3.2]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), glow(px === 0.4 ? '#ff8a5c' : '#ffc47a', 1.9));
      l.position.set(px, 2.15 + (px === 0.4 ? 0.25 : 0), 0);
      b.add(l);
      lamps.push(l);
    }
    const col = columns.add(new THREE.Vector3(0, 0, 0), '#ffb066', 1.5, 11, 1.1);
    grp.add(b);
    boats.push({
      b, col,
      x: rr(-260, 260), z: zLine + rr(-22, 22),
      sp: rr(3.2, 6.4) * (rand() > 0.5 ? 1 : -1),
      y: 0.1,
    });
  }
  scene.add(grp);
  return {
    group: grp,
    update(t, dt, rate) {
      for (const bt of boats) {
        bt.x += dt * bt.sp * rate;
        if (bt.x > 320) bt.x = -320;
        if (bt.x < -320) bt.x = 320;
        const bob = Math.sin(t * 1.4 + bt.z) * 0.09;
        bt.b.position.set(bt.x, bt.y + bob, bt.z);
        bt.b.rotation.y = bt.sp > 0 ? 0 : Math.PI;
        bt.b.rotation.z = Math.sin(t * 1.1 + bt.x * 0.05) * 0.018;
        columns.setPos(bt.col, new THREE.Vector3(bt.x, 0, bt.z));
      }
    },
  };
}

/* ------------------------------------------------------------------ 护城河桥 */

/**
 * 门外跨外秦淮河的桥，正对券门中轴。中华路上确有此桥，但桥的形制、孔数
 * 与位置都按本场景的构图取，属写意。
 */
export function buildBridge(scene, columns) {
  const grp = new THREE.Group();
  const deckTop = 5.2;
  const z0 = MOAT.centerZ + MOAT.halfWidth + 3.5;      // -72.5
  const z1 = MOAT.centerZ - MOAT.halfWidth - 3.5;      // -155.5
  const len = z0 - z1;
  const deck = new THREE.Mesh(box(11, 0.66, len), M.granite);
  deck.position.set(0, deckTop - 0.33, (z0 + z1) / 2);
  deck.castShadow = deck.receiveShadow = true;
  grp.add(deck);

  const bays = 5;
  for (let i = 1; i < bays; i++) {
    const z = z0 - (len * i) / bays;
    const pier = new THREE.Mesh(box(3.0, deckTop - 0.6, 4.2), M.granite);
    pier.position.set(0, (deckTop - 0.6) / 2, z);
    pier.castShadow = pier.receiveShadow = true;
    grp.add(pier);
  }
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(railingGeo(len, { height: 0.98, spacing: 1.7 }), M.granite);
    rail.rotation.y = Math.PI / 2;
    rail.position.set(s * 5.2, deckTop, (z0 + z1) / 2);
    rail.castShadow = true;
    grp.add(rail);
    // 栏头一盏，桥上才走得成人
    for (let i = 0; i <= 8; i++) {
      const z = z0 - (len * i) / 8;
      columns.add(new THREE.Vector3(s * 5.2, 0, z), i % 4 === 0 ? '#8ff0d2' : '#ffbe72', 1.3, 9, 0.85);
    }
  }
  scene.add(grp);
  return { group: grp, deckTop };
}

/* ------------------------------------------------------------------ 装配 */

export function buildProps(scene, columns, anchors) {
  return {
    crowd: new Crowd(scene),
    flags: buildFlags(scene, anchors),
    fleet: buildFleet(scene, columns),
    bridge: buildBridge(scene, columns),
  };
}
