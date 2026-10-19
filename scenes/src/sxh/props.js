import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, box, rand, rr, stringPath, figureGeo } from '../kit.js';
import { LanternField, Crowd } from '../props.js';
import { S, moonPuddle } from './parts.js';
import { LAKE, channelAt, STATIONS } from './data.js';
import { archLayout, deckY, BRIDGE } from './bridge.js';
import * as T from '../textures.js';

const LAMP_COLORS = ['#ffbe72', '#ff9a63', '#ffd7a0', '#ff8a5c'];

/* ------------------------------------------------------------------ 灯串 */
function lightStrings(scene, pairs, columns) {
  const grp = new THREE.Group();
  const linePos = [], bulbPos = [], bulbCol = [], bulbSize = [], bulbPhase = [];
  const warm = new THREE.Color('#ffd39a'), red = new THREE.Color('#ff8f66'), jade = new THREE.Color('#9ff0d6');
  pairs.forEach((pair, k) => {
    const pts = stringPath(pair[0], pair[1], 0.9 + rand() * 0.5, 26);
    for (let i = 0; i < pts.length - 1; i++) {
      linePos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
    for (let i = 2; i < pts.length - 1; i += 2) {
      const p = pts[i];
      bulbPos.push(p.x, p.y - 0.26, p.z);
      const c = (i + k) % 9 === 0 ? jade : (i + k) % 3 === 0 ? red : warm;
      bulbCol.push(c.r * 2.3, c.g * 2.3, c.b * 2.3);
      bulbSize.push(1.3 + rand() * 0.7);
      bulbPhase.push(rand());
    }
    const mid = pts[Math.floor(pts.length / 2)];
    columns.add(mid.clone().setY(0.12), '#ffc37a', 1.6, 9, 0.6);
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x141a28, fog: false })));
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bulbPos, 3));
  bg.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(bulbCol), 3));
  bg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(bulbSize), 1));
  bg.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(bulbPhase), 1));
  const uni = {
    uTime: { value: 0 }, uOn: { value: 1 },
    uTex: { value: T.softGlow('255,208,155', 0.05) },
  };
  const bm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: uni,
    vertexShader: `attribute float aSize; attribute vec3 aCol; attribute float aPhase;
      uniform float uTime; uniform float uOn; varying vec3 vC; varying float vA;
      void main(){ vC = aCol; vA = uOn*(0.7+0.3*sin(uTime*2.9+aPhase*6.28));
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = min(38.0, aSize*250.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA*0.4); }`,
  });
  const bulbs = new THREE.Points(bg, bm);
  bulbs.frustumCulled = false;
  bulbs.renderOrder = 5;
  grp.add(bulbs);
  scene.add(grp);
  return { grp, uni };
}

/** 桥上的灯串：中亭到四隅亭，正好把"五亭"缝在一起 */
function bridgeStringPairs() {
  const pairs = [];
  const apexY = deckY(0) + 4.6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * 11.6, z = sz * 3.6;
      pairs.push([
        new THREE.Vector3(sx * 2.6, apexY, sz * 2.2),
        new THREE.Vector3(x * 0.82, deckY(x * 0.82) + 3.6, z * 0.82),
      ]);
      pairs.push([
        new THREE.Vector3(x, deckY(x) + 3.2, z),
        new THREE.Vector3(x, deckY(x) + 3.2, -z),
      ]);
    }
  }
  return pairs;
}

/* ------------------------------------------------------------------ 画舫 */
function boatGeo() {
  const parts = [];
  parts.push(box(2.3, 0.72, 8.6, 0, 0.36, 0));
  const bow = new THREE.ConeGeometry(1.25, 2.6, 4, 1);
  bow.rotateX(-Math.PI / 2);
  bow.scale(0.9, 0.55, 1);
  bow.translate(0, 0.42, 5.5);
  parts.push(bow);
  const stern = new THREE.ConeGeometry(1.0, 1.5, 4, 1);
  stern.rotateX(Math.PI / 2);
  stern.scale(0.9, 0.5, 1);
  stern.translate(0, 0.4, -5.2);
  parts.push(stern);
  // 舱：一长条敞篷，两侧矮舷
  parts.push(box(1.9, 1.15, 3.8, 0, 1.25, 0.6));
  parts.push(box(0.16, 0.5, 4.2, 0.95, 1.9, 0.6));
  parts.push(box(0.16, 0.5, 4.2, -0.95, 1.9, 0.6));
  for (let i = 0; i < 4; i++) {
    const rib = box(2.0, 0.1, 0.12, 0, 2.16, -1.3 + i * 1.3);
    parts.push(rib);
  }
  const roof = new THREE.CylinderGeometry(1.15, 1.15, 4.4, 10, 1, false, 0, Math.PI);
  roof.rotateX(Math.PI / 2);
  roof.translate(0, 2.2, 0.6);
  parts.push(roof);
  // 船头灯棚两柱
  for (const s of [-1, 1]) parts.push(box(0.1, 1.5, 0.1, s * 0.7, 1.4, 3.5));
  parts.push(box(1.7, 0.12, 0.14, 0, 2.2, 3.5));
  return mergeGeometries(parts);
}

class Fleet {
  constructor(scene, columns) {
    this.columns = columns;
    this.grp = new THREE.Group();
    this.boats = [];
    const geo = boatGeo();
    const N = 6;
    for (let i = 0; i < N; i++) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(geo, i % 2 ? M.beam : S.deck);
      hull.castShadow = true;
      b.add(hull);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.24, 9, 7), glow('#ffbe72', 2.0));
      lantern.position.set(0, 2.0, 3.5);
      b.add(lantern);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: T.softGlow('255,190,120', 0.06), transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false,
      }));
      halo.scale.set(4.6, 4.6, 1);
      halo.position.copy(lantern.position);
      b.add(halo);
      const crew = new THREE.Mesh(figureGeo(0.95), new THREE.MeshStandardMaterial({ color: 0x1a1f2c, roughness: 0.92 }));
      crew.position.set(0, 0.75, -3.6);
      crew.rotation.y = Math.PI;
      b.add(crew);
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.4, 6), M.beam);
      oar.position.set(0.7, 1.0, -4.4);
      oar.rotation.set(0.5, 0, 0.5);
      b.add(oar);
      // 船上的暖光落进水里
      const col = columns.add(new THREE.Vector3(0, 0.12, 0), '#ffb066', 1.0, 7.5, 0.85);
      const { cx, w } = channelAt(0);
      const z0 = rr(-130, 160);
      this.boats.push({
        obj: b, phase: rand() * 6.28, sp: rr(0.5, 1.15) * (rand() > 0.5 ? 1 : -1),
        lane: (i % 3 - 1) * rr(5, 9) + rr(-2, 2), col,
        z0, z1: z0 + rr(-60, 60), cx: cx + rr(-6, 6), w,
      });
      b.position.set(cx, 0.12, z0);
      this.grp.add(b);
    }
    scene.add(this.grp);
  }
  update(t, dt, speed) {
    for (const b of this.boats) {
      const zLo = Math.min(b.z0, b.z1) - 34, zHi = Math.max(b.z0, b.z1) + 34;
      b.obj.position.z += dt * b.sp * 6.2 * speed;
      if (b.obj.position.z > zHi || b.obj.position.z < zLo) b.sp *= -1;
      const { cx } = channelAt(b.obj.position.z);
      const target = cx + b.lane;
      b.obj.position.x += (target - b.obj.position.x) * Math.min(1, dt * 0.9);
      b.obj.position.y = 0.1 + Math.sin(t * 1.5 + b.phase) * 0.05;
      b.obj.rotation.z = Math.sin(t * 1.2 + b.phase) * 0.022;
      b.obj.rotation.y = b.sp > 0 ? Math.PI : 0;
      b.obj.rotation.x = Math.sin(t * 0.9 + b.phase) * 0.012;
      this.columns.setPos(b.col, b.obj.position);
    }
  }
}

/* ------------------------------------------------------------------ 十五洞月影 */
function archMoons(scene) {
  const grp = new THREE.Group();
  const items = [];
  for (const a of archLayout()) {
    // 一洞一月：直径压到洞宽的三分之一不到，否则读成水面补丁
    const r = THREE.MathUtils.clamp(a.r * 0.34, 0.26, 0.62);
    const bright = a.index === 7 ? 0.95 : 0.72 - Math.abs(a.index - 7) * 0.03;
    const p = moonPuddle(r, bright);
    p.material.opacity = 0.46;
    p.position.set(a.cx, 0.05, a.r * 0.5);
    grp.add(p);
    items.push({ p, phase: rand() * 6.28, base: 0.05 });
  }
  scene.add(grp);
  return {
    grp,
    update(t, ripple) {
      for (const it of items) {
        it.p.position.y = it.base + Math.sin(t * 1.3 + it.phase) * 0.04 * ripple;
        it.p.scale.setScalar(1 + Math.sin(t * 0.9 + it.phase) * 0.12);
        it.p.material.opacity = 0.3 + 0.22 * Math.abs(Math.sin(t * 0.7 + it.phase));
      }
    },
  };
}

/* ------------------------------------------------------------------ 湖灯 */
function lotusLamps(scene) {
  const N = 96;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
  const cs = [new THREE.Color('#ffd28f'), new THREE.Color('#ff8f6a'), new THREE.Color('#9ff0d6')];
  const zLo = LAKE.zFrom + 30, zHi = LAKE.zTo - 30, span = zHi - zLo;
  for (let i = 0; i < N; i++) {
    const z = zLo + rand() * span;
    const { cx, w } = channelAt(z);
    pos.set([cx + rr(-w + 4, w - 4), 0.16, z], i * 3);
    const c = cs[(rand() * 3) | 0];
    col.set([c.r * 2.5, c.g * 2.5, c.b * 2.5], i * 3);
    size[i] = rr(0.75, 1.5);
    ph[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const uni = {
    uTime: { value: 0 }, uFlow: { value: 1 },
    uTex: { value: T.softGlow('255,200,140', 0.1) },
    uSpan: { value: span }, uLo: { value: zLo },
  };
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: uni,
    vertexShader: `attribute float aSize; attribute vec3 aCol; attribute float aPhase;
      uniform float uTime; uniform float uFlow; uniform float uSpan; uniform float uLo;
      varying vec3 vC; varying float vA;
      void main(){ vec3 p = position;
        p.z = mod(p.z - uLo + uTime*0.55*uFlow, uSpan) + uLo;
        p.x += sin(uTime*0.4+aPhase*6.28)*0.7;
        p.y += sin(uTime*1.5+aPhase*6.28)*0.05;
        vC = aCol; vA = 0.66+0.34*sin(uTime*2.0+aPhase*6.28);
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        gl_PointSize = min(28.0, aSize*190.0/max(1.0,-mv.z)); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA*0.8); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  scene.add(pts);
  return { pts, uni: m.uniforms };
}

/* ------------------------------------------------------------------ 装配 */
export function buildProps(scene, columns, anchors) {
  const field = new LanternField(scene, columns);
  // 机位跟前挂一盏宫灯，全景模式下就是一根顶到镜头的柱子
  const nearStation = (p) => STATIONS.some((s) => Math.hypot(p.x - s.pos[0], p.y - s.pos[1], p.z - s.pos[2]) < 3.6);
  const pick = (list) => list.filter((p) => !nearStation(p));
  pick(anchors.eaves).forEach((p, i) => field.add(p, {
    color: LAMP_COLORS[i % 4], size: rr(0.82, 1.1), column: i % 4 === 0, columnDepth: 8,
  }));
  pick(anchors.lampPosts).forEach((p) => field.add(p, { color: '#ff9d5e', size: 1.05, shape: 'hex', column: true, columnDepth: 9 }));
  pick(anchors.windowGlow).forEach((p) => field.add(p, { color: '#ffdca8', size: 0.72, shape: 'hex' }));
  pick(anchors.archLamps).forEach((p, i) => field.add(p, { color: '#ffb066', size: 0.75, column: i % 3 === 0, columnDepth: 6 }));
  pick(anchors.bridgeLamps).forEach((p) => field.add(p, { color: '#ffe0b0', size: 1.0, shape: 'hex', column: true, columnDepth: 8 }));
  field.build();

  const strings = lightStrings(scene, bridgeStringPairs(), columns);
  const fleet = new Fleet(scene, columns);
  const moons = archMoons(scene);
  const lakeLamps = lotusLamps(scene);

  const hs = BRIDGE.halfSpan;
  const paths = [...anchors.crowdPaths];
  paths.push({ a: [-hs, deckY(-hs) + 0.5, 0], b: [hs, deckY(hs) + 0.5, 0] });
  paths.push({ a: [-hs, deckY(-hs) + 0.5, 3.4], b: [hs, deckY(hs) + 0.5, 3.4] });
  for (const z of [40, -95, -168]) {
    const { cx, w } = channelAt(z);
    const x = cx + (z > 0 ? -1 : 1) * (w + 6);
    paths.push({ a: [x, groundAt(x, z), z - 16], b: [x + 6, groundAt(x + 6, z), z + 16] });
  }
  const bridgeAt = (u, off) => {
    const x = -hs + 2 * hs * u;
    return { x, y: deckY(x) + 0.55, z: off * 2.2, heading: x > 0 ? Math.PI : 0 };
  };
  const crowd = new Crowd(scene, { paths, bridgeAt, bridgeEvery: 5, lanternRate: 0.35 });
  return { field, strings, fleet, crowd, moons, lakeLamps };
}

function groundAt(x, z) {
  const { cx, w } = channelAt(z);
  const d = Math.abs(x - cx) - w;
  return d < 0 ? 0.6 : Math.min(LAKE.bankY, LAKE.bankY * Math.pow(Math.min(1, d / 3.4), 0.72)) + 1.6;
}
