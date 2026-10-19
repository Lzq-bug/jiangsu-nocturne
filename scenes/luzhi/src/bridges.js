import * as THREE from 'three';
import { RIVER, INLET, BRIDGES } from './data.js';
import { M, mesh, box, nanCheck, plaqueMat, haloGeo, haloMat, clamp01, smooth } from './kit.js';

/**
 * 七十二顶半 — the bridges.
 *
 * Local frame for every bridge: the deck crosses the water along local Z, the
 * 跨径 is measured along Z too, and the barrel is extruded along X by `width`
 * (which is the road width, and also the length of the tunnel a boat goes
 * through). Main-river bridges are placed as built; inlet bridges are turned 90°
 * so one code path serves a north-south channel.
 *
 * The arch is a real circular segment: R = (a² + h²) / 2h with a = 跨径/2 and
 * h = 矢高, so the face a boat looks up at is an arc, not a stretched 半圆.
 */

const MAIN_DECK = 24;     // 市河上：桥面连同桥坡，落到两岸石堤
const INLET_DECK = 20;    // 水巷上：同上
const SPRING_Y = 1.05;    // 拱脚标高（在水里，靠水面上一点）

function arcRing(span, rise, springY = SPRING_Y) {
  const a = span / 2;
  const R = (a * a + rise * rise) / (2 * rise);
  return { R, cy: springY + rise - R, half: Math.asin(Math.min(1, a / R)), a, springY };
}

/** intrados shell — the arc swept along X, so the moon has a tunnel to sit in */
function arcTube(ring, width, seg = 24, only = null) {
  const { R, cy, half } = ring;
  const t0 = only ? only[0] : 0, t1 = only ? only[1] : 1;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = t0 + (t1 - t0) * (i / seg);
    const ang = -half + 2 * half * t;
    const z = Math.sin(ang) * R;
    const y = cy + Math.cos(ang) * R;
    for (const x of [-width / 2, width / 2]) {
      pos.push(x, y, z);
      uv.push(z / 1.4, (y - SPRING_Y) / 1.4 + (x > 0 ? 0.5 : 0));
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return nanCheck(g, 'arcTube');
}

/** the spandrel face: a rectangle with the arch(es) cut out */
function archFace(deck, deckY, rings, bottomY) {
  const s = new THREE.Shape();
  s.moveTo(-deck / 2, bottomY);
  s.lineTo(deck / 2, bottomY);
  s.lineTo(deck / 2, deckY);
  s.lineTo(-deck / 2, deckY);
  s.closePath();
  for (const ring of rings) {
    const hole = new THREE.Path();
    hole.moveTo(ring.z - ring.a, ring.springY);
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const ang = -ring.half + 2 * ring.half * t;
      hole.lineTo(ring.z + Math.sin(ang) * ring.R, ring.cy + Math.cos(ang) * ring.R);
    }
    hole.lineTo(ring.z + ring.a, ring.springY);
    hole.closePath();
    s.holes.push(hole);
  }
  const g = new THREE.ShapeGeometry(s, 12);
  return nanCheck(g, 'archFace');
}

/** deck height along the crossing */
function deckY(z, deck, crownY, landY) {
  const t = Math.min(1, Math.abs(z) / (deck / 2));
  return crownY - (crownY - landY) * Math.pow(t, 1.55);
}

export function buildBridges(scene, columns) {
  const group = new THREE.Group();
  group.name = 'bridges';
  const items = [];

  for (const b of BRIDGES) {
    const isBeam = b.kind === 'beam';
    const deck = b.cross === 'main' ? MAIN_DECK : INLET_DECK;
    const landY = RIVER.bankTopY + 0.35;
    const crownY = isBeam ? landY + 0.55 : SPRING_Y + b.rise + 0.4;
    const yOf = (z) => (isBeam ? crownY : deckY(z, deck, crownY, landY));

    const g = new THREE.Group();
    g.name = `bridge-${b.id}`;

    const stone = [];        // 墩、台、栏板
    const warm = [];         // 桥面条石
    const heads = [];        // 灯头
    const lamps = [];        // local [x,y,z]
    const rings = [];

    if (b.kind === 'half') {
      /* 那半座 — 一头有坡有栏，另一头断在拱顶 */
      const ring = arcRing(b.span, b.rise);
      ring.z = 0;
      rings.push(ring);
      g.add(new THREE.Mesh(arcTube(ring, b.width, 24, [0.5, 1]), M.stone));
      for (const s of [-1, 1]) {
        const face = archFaceHalf(ring, b.width, s);
        face.translate(s * b.width / 2, 0, 0);
        stone.push(face);
      }
      //  surviving deck: from the near ramp up to the crown
      const n = 9, z1 = 0.4, z0 = -deck / 2;
      const dz = (z1 - z0) / n;
      for (let i = 0; i < n; i++) slab(warm, b.width, z0 + (i + 0.5) * dz, dz, yOf);
      //  断口：拱顶处剩下的半截条石歪着
      const brk = box(b.width * 0.9, 0.36, 2.2, 0, -0.18, 0, 2.4);
      brk.rotateX(-0.22); brk.rotateZ(0.09); brk.translate(0, yOf(0.6), 1.1);
      warm.push(nanCheck(brk, 'half-break'));
      //  单侧栏板与望柱
      for (const sx of [-1, 1]) {
        for (let i = 0; i <= 5; i++) {
          const z = z0 + (i / 5) * (z1 - z0);
          post(stone, sx * (b.width / 2 - 0.1), yOf(z), z);
        }
      }
      const yl = yOf(z0 * 0.55);
      heads.push(lampHead(0, yl + 1.2, z0 * 0.55));
      lamps.push([0, yl + 1.2, z0 * 0.55]);
      abutment(stone, b.width, z0, -1);
    } else if (isBeam) {
      /* 石梁平桥 — 条石压在矮墩上，几乎不起拱 */
      const n = 4, opening = b.span;
      for (let i = 1; i < n; i++) {
        const z = -opening / 2 + i * (opening / n);
        boxPush(stone, 0.8, SPRING_Y + 2.4, 0.8, 0, -1.3, z, 3);
        boxPush(stone, 1.3, 0.34, 1.3, 0, SPRING_Y + 1.9, z, 3);
      }
      const dz = deck / 8;
      for (let i = 0; i < 8; i++) slab(warm, b.width, -deck / 2 + (i + 0.5) * dz, dz, yOf);
      for (const s of [-1, 1]) abutment(stone, b.width, s * deck / 2, s);
      for (const sx of [-1, 1]) {
        for (let i = 0; i <= 8; i++) {
          const z = -deck / 2 + (i / 8) * deck;
          post(stone, sx * (b.width / 2 - 0.09), crownY, z, 0.74);
        }
        boxPush(stone, 0.13, 0.11, deck, sx * (b.width / 2 - 0.09), crownY + 0.78, 0, 2);
      }
      for (const sx of [-1, 1]) {
        heads.push(lampHead(sx * (b.width / 2 - 0.09), crownY + 1.16, 0));
        lamps.push([sx * (b.width / 2 - 0.09), crownY + 1.16, 0]);
      }
    } else {
      /* 拱桥 — 单孔或两孔 */
      const twin = b.kind === 'twin';
      const pierW = 1.6;
      if (twin) {
        for (const s of [-1, 1]) {
          const r = arcRing(b.span / 2 - pierW / 2, b.rise);
          r.z = s * (b.span / 4 + pierW / 4);
          rings.push(r);
          g.add(new THREE.Mesh(arcTube(r, b.width, 18), M.stone));
        }
        boxPush(stone, b.width * 0.86, SPRING_Y + 1.8, pierW, 0, -1.4, 0, 3);
        for (const s of [-1, 1]) {   // 分水尖
          boxPush(stone, b.width * 0.5, 1.2, 1.1, 0, -1.1, s * (pierW / 2 + 0.4), 3);
        }
      } else {
        const r = arcRing(b.span, b.rise);
        r.z = 0;
        rings.push(r);
        g.add(new THREE.Mesh(arcTube(r, b.width, 24), M.stone));
      }
      for (const s of [-1, 1]) {
        const face = archFace(deck, crownY - 0.34, rings, -1.6);
        face.rotateY(Math.PI / 2);
        face.translate(s * b.width / 2, 0, 0);
        stone.push(face);
      }
      const n = 20, dz = deck / n;
      for (let i = 0; i < n; i++) slab(warm, b.width, -deck / 2 + (i + 0.5) * dz, dz, yOf);
      // 桥坡石级：两端各六级
      for (const s of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const z = s * (deck * 0.34 + (i + 0.5) * (deck * 0.16 / 6) * 6 * 0.16);
          step(warm, b.width, z, yOf);
        }
      }
      for (const s of [-1, 1]) abutment(stone, b.width, s * deck / 2, s);
      // 栏板 + 望柱
      const pn = 8;
      for (const sx of [-1, 1]) {
        for (let i = 0; i < pn; i++) {
          const z = -deck / 2 + (i + 0.5) * (deck / pn);
          const y = yOf(z);
          boxPush(stone, 0.15, 0.5, deck / pn * 1.02, sx * (b.width / 2 - 0.1), y + 0.34, z, 2.4);
        }
        for (let i = 0; i <= pn; i++) {
          const z = -deck / 2 + i * (deck / pn);
          post(stone, sx * (b.width / 2 - 0.1), yOf(z), z);
          if (i === 0 || i === pn || i === pn / 2) {
            const y = yOf(z) + 1.22;
            heads.push(lampHead(sx * (b.width / 2 - 0.1), y, z));
            lamps.push([sx * (b.width / 2 - 0.1), y, z]);
          }
        }
      }
      if (b.name) {
        for (const s of [-1, 1]) {
          const p = new THREE.PlaneGeometry(2.3, 0.66);
          p.rotateY(Math.PI / 2);
          p.translate(s * (b.width / 2 + 0.05), crownY + 0.5, 0);
          g.add(new THREE.Mesh(p, plaqueMat(b.name)));
        }
      }
    }

    if (stone.length) g.add(mesh(stone, M.stone));
    if (warm.length) g.add(mesh(warm, M.stoneWarm));
    if (heads.length) {
      // 一桥一盏材质：次第点亮要能单独压暗，克隆不额外编译着色器
      const lampMat = M.bridgeLamp.clone();
      lampMat.name = `bridge-lamp-${b.id}`;
      const m = mesh(heads, lampMat, `lamps-${b.id}`);
      g.add(m);
      heads.material = lampMat;
      items.lampMat = lampMat;
    }

    const cx = b.cross === 'main' ? b.at : (INLET.x0 + INLET.x1) / 2;
    const cz = b.cross === 'main' ? 0 : b.at;
    g.position.set(cx, 0, cz);
    if (b.cross === 'inlet') g.rotation.y = Math.PI / 2;
    g.updateMatrixWorld(true);
    group.add(g);

    // 只有真正在水面上的灯才拖得动光柱
    const waterHalf = b.cross === 'main' ? 7.4 : 4.4;
    const cols = [];
    for (const [lx, ly, lz] of lamps) {
      if (Math.abs(lz) > waterHalf) { cols.push(-1); continue; }
      const v = new THREE.Vector3(lx, ly, lz);
      g.localToWorld(v);
      cols.push(columns.add(v, '#ffbe7a', 1.5, 10 + ly * 0.6, 1.3));
    }

    const halo = new THREE.Points(haloGeo(lamps, 4.4), haloMat('255,192,122'));
    halo.name = 'media-halo';
    g.add(halo);

    let light = null;
    if (['w1', 'w3', 'i1'].includes(b.id)) {
      light = new THREE.PointLight(0xffbb7d, 260, 42, 2);
      light.position.set(0, crownY + 1.6, 0);
      g.add(light);
    }

    const rec = {
      spec: b, group: g, halo, cols, light, crownY, lit: 0,
      lampMat: items.lampMat || null,
    };
    items.push(rec);
  }

  scene.add(group);

  // 第二遍：把每桥的灯材质找回来（mesh 在 items 里存过克隆体）
  group.traverse((o) => {
    if (o.isMesh && /^lamps-/.test(o.name || '')) {
      const id = o.name.slice(6);
      const it = items.find((x) => x.spec.id === id);
      if (it) it.lampMat = o.material;
    }
  });

  return {
    group,
    items,
    count: items.length,
    setProgress(p) {
      const n = items.length;
      const scaled = clamp01(p) * n;
      items.forEach((it, i) => { it.lit = smooth(clamp01(scaled - i)); });
    },
    /** 直接给某一号桥落位（静帧用） */
    snap(i, on = true) {
      if (!items[i]) return;
      items[i].lit = on ? 1 : 0;
    },
    update(t, level) {
      items.forEach((it, k) => {
        const v = it.lit * level;
        it.halo.material.uniforms.uTime.value = t;
        it.halo.material.uniforms.uLevel.value = 0.06 + 0.94 * v;
        if (it.lampMat) it.lampMat.emissiveIntensity = 0.10 + 1.15 * v;
        for (const c of it.cols) if (c >= 0) columns.setOn(c, v > 0.10);
        if (it.light) {
          it.light.intensity = 260 * v * (0.93 + 0.07 * Math.sin(t * 2.3 + k * 1.7));
          it.light.visible = v > 0.05;
        }
      });
    },
  };
}

/* ------------------------------------------------------------------ parts */

function boxPush(list, w, h, d, x, yBottom, z, uv = 3) {
  list.push(box(w, h, d, x, yBottom, z, uv));
}

function slab(list, width, z, dz, yOf) {
  const y = yOf(z);
  const yAhead = yOf(z + dz);
  const slope = Math.atan2(yAhead - y, dz);
  const g = box(width, 0.34, dz * 1.03, 0, -0.17, 0, 2.6);
  g.rotateX(-slope);
  g.translate(0, y, z);
  list.push(nanCheck(g, 'slab'));
}

function step(list, width, z, yOf) {
  const y = yOf(z);
  const g = box(width, 0.2, 0.46, 0, -0.42, 0, 2.2);
  g.translate(0, y, z);
  list.push(nanCheck(g, 'step'));
}

function post(list, x, y, z, h = 0.98) {
  list.push(box(0.2, h, 0.2, x, y + 0.3, z, 2));
}

function lampHead(x, y, z) {
  const head = new THREE.SphereGeometry(0.19, 10, 8);
  head.scale(1, 1.26, 1);
  head.translate(x, y, z);
  return nanCheck(head, 'lampHead');
}

function abutment(list, width, z, dir) {
  list.push(box(width + 0.7, 3.4, 1.3, 0, -0.6, z + dir * 0.5, 3));
}

/** the broken bridge keeps only one half of the ring on each face */
function archFaceHalf(ring, width, s) {
  const g = archFace(8, ring.cy + ring.R + 0.4, [ring], -1.6);
  g.rotateY(Math.PI / 2);
  return g;
}
