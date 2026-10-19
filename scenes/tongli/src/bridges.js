import * as THREE from 'three';
import { mergeAll, mesh, lit, glow, meterBox, nanCheck } from './kit.js';
import * as T from './textures.js';
import { BRIDGES, CANAL, BANK } from './data.js';

/**
 * 桥。镇河是缝，桥就是针脚——所以这一景里桥不是点缀，是结构。
 *
 * 两种形制：
 *   arch 单孔石拱：券洞是半圆到略拱，桥面起拱，两边石级上下；
 *          净空留够摇橹船的篷顶，夜里船从桥洞底下穿过去。
 *   beam 石梁平桥：窄弄河上两三块长条石压过去，桥面是平的。
 * 形制按江南水乡通例摆，具体某座桥是哪一种、跨径多少，除三桥外都无可核来源。
 *
 * 每座桥自己一组几何，并且各自有一份发光材质——走三桥的次第点亮靠的就是这个：
 * 灯一盏一盏从太平桥起到长庆桥止，不能把全镇的桥合成一块板。
 */

const STONE = lit('#7d858c', { map: T.paving({ meters: 1.5, base: '#737b82' }), rough: 0.92 });
const RAIL = lit('#949ba0', { map: T.paving({ meters: 1.8, base: '#888f94' }), rough: 0.88, side: THREE.DoubleSide });

const LAMP_HUE = '#ffc48a';

/** 券洞轮廓：脚下起拱，上半个圆 */
function archHole(halfWidth, springY, topY, baseY) {
  const p = new THREE.Path();
  const r = halfWidth;
  p.moveTo(-r, baseY);
  p.lineTo(-r, springY);
  p.absarc(0, springY, r, Math.PI, 0, true);
  p.lineTo(r, baseY);
  p.closePath();
  return p;
}

/** 桥面母线：两端落在岸顶，中间起拱 */
function deckY(x, half, rise) {
  const t = Math.min(1, Math.abs(x) / half);
  return BANK + 0.1 + rise * (1 - t * t * (1.05 - 0.18 * t * t));
}

function railing(span, width, rise, out) {
  const half = span / 2;
  const parts = [];
  const n = Math.max(4, Math.round(span / 1.15));
  for (const sz of [-1, 1]) {
    const z = sz * (width / 2 - 0.16);
    for (let i = 0; i <= n; i++) {
      const x = -half + (span * i) / n;
      const y = deckY(x, half, rise);
      const post = meterBox(0.2, 0.94, 0.2, x, y, z);
      parts.push(post);
      const cap = new THREE.CylinderGeometry(0.12, 0.14, 0.16, 7);
      cap.translate(x, y + 1.0, z);
      parts.push(cap);
      if (i < n) {
        const x2 = -half + (span * (i + 1)) / n;
        const y2 = deckY(x2, half, rise);
        const L = Math.hypot(x2 - x, y2 - y);
        const panel = meterBox(L, 0.44, 0.11, (x + x2) / 2, (y + y2) / 2 + 0.26, z);
        panel.rotateZ(Math.atan2(y2 - y, x2 - x));
        parts.push(panel);
      }
    }
    // 桥头两根望柱立高一点，挂灯笼用
    for (const sx of [-1, 1]) {
      const x = sx * half;
      parts.push(meterBox(0.26, 1.5, 0.26, x, deckY(x, half, rise) - 0.2, z));
      out.tops.push([x, deckY(x, half, rise) + 1.35, z]);
    }
  }
  return parts;
}

function archBridge(span, width, rise) {
  const half = span / 2;
  const shape = new THREE.Shape();
  const nCurve = 34;
  shape.moveTo(-half - 0.9, -2.4);
  shape.lineTo(-half - 0.9, deckY(-half, half, rise));
  for (let i = 0; i <= nCurve; i++) {
    const x = -half + (2 * half * i) / nCurve;
    shape.lineTo(x, deckY(x, half, rise) + 0.3);
  }
  shape.lineTo(half + 0.9, deckY(half, half, rise));
  shape.lineTo(half + 0.9, -2.4);
  shape.closePath();
  const archR = Math.min(span * 0.34, (BANK + rise) * 0.8);
  const springY = 0.55;
  shape.holes.push(archHole(archR, springY, deckY(0, half, rise) - 0.4, -2.4));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 22, steps: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -width / 2);
  nanCheck(g, STONE);

  const railOut = { tops: [] };
  const rails = railing(span, width, rise, railOut);
  // 桥堋上贴一道券脸，夜里读得出"拱"
  const face = [];
  for (const sz of [-1, 1]) {
    const ring = new THREE.TorusGeometry(archR + 0.26, 0.15, 5, 16, Math.PI);
    ring.rotateX(Math.PI / 2);
    ring.rotateZ(Math.PI / 2);
    ring.translate(0, 0.55, sz * (width / 2 - 0.02));
    face.push(ring);
  }
  const stair = [];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = sx * (half + 1.0 + k * 0.72);
      const y = deckY(sx * half, half, rise) - 0.45 - k * 0.62;
      if (y < BANK - 0.9) break;
      stair.push(meterBox(0.78, 0.6, width + 0.4, x, y, 0));
    }
  }
  return { body: [g, ...stair], rail: [...rails, ...face], tops: railOut.tops };
}

function beamBridge(span, width, rise) {
  const half = span / 2;
  const piers = [];
  const nPier = span > 13 ? 2 : (span > 8 ? 1 : 0);
  const y = BANK + 0.2;
  const body = [meterBox(span + 1.2, 0.55, width, 0, y, 0)];
  for (let k = 0; k < nPier; k++) {
    const x = nPier === 1 ? 0 : -half + span * (k + 1) / (nPier + 1);
    piers.push(meterBox(1.5, y + 2.6, 1.1, x, -2.4, 0));
    // 分水尖
    const cut = new THREE.CylinderGeometry(0.75, 0.75, 1.1, 3);
    cut.rotateX(-Math.PI / 2);
    cut.translate(x, 0.4, width * 0.28);
    piers.push(cut);
  }
  // 桥面石板：三条长石
  const deck = [];
  for (let k = 0; k < 3; k++) {
    deck.push(meterBox(span, 0.2, width / 3 - 0.08, 0, y + 0.55 + 0.1, -width / 2 + (width / 3) * (k + 0.5)));
  }
  const railOut = { tops: [] };
  const rails = [];
  for (const sz of [-1, 1]) {
    const z = sz * (width / 2 - 0.12);
    const n = Math.max(3, Math.round(span / 1.4));
    for (let i = 0; i <= n; i++) {
      const x = -half + (span * i) / n;
      rails.push(meterBox(0.16, 0.72, 0.16, x, y + 0.75, z));
      if (i < n) {
        rails.push(meterBox(span / n - 0.16, 0.34, 0.09, x + span / (2 * n), y + 1.06, z));
      }
    }
    for (const sx of [-1, 1]) railOut.tops.push([sx * half, y + 1.5, z]);
  }
  return { body: [...body, ...deck, ...piers], rail: rails, tops: railOut.tops };
}

/* ------------------------------------------------------------------ 主入口 */

export function buildBridges(scene) {
  const group = new THREE.Group();
  group.name = 'bridges';
  const list = [];

  for (const b of BRIDGES) {
    const dir = b.dir ?? 0;
    const span = b.span ?? 16;
    const width = b.width ?? 3.6;
    const rise = b.rise ?? (b.type === 'beam' ? 0.4 : 2.4);
    const made = b.type === 'beam' ? beamBridge(span, width, rise) : archBridge(span, width, rise);

    const body = mesh(mergeAll(made.body), STONE);
    body.receiveShadow = true;
    const rail = mesh(mergeAll(made.rail), RAIL);

    const grp = new THREE.Group();
    grp.add(body, rail);
    grp.name = `bridge-${b.id}`;

    /* ---- 桥上的灯笼：一对在桥头，桥心里再挂一串 */
    const lampGeos = [];
    const haloSpots = [];
    for (const [tx, ty, tz] of made.tops) {
      lampGeos.push(lampGeo(0.34, tx, ty, tz));
      haloSpots.push([tx, ty + 0.3, tz]);
    }
    const nHang = Math.max(0, Math.round(span / 3.2) - 1);
    for (let i = 0; i < nHang; i++) {
      const x = -span / 2 + (span * (i + 1)) / (nHang + 1);
      const y = deckY(x, span / 2, rise) + 2.05;
      lampGeos.push(lampGeo(0.3, x, y, 0));
      haloSpots.push([x, y + 0.2, 0]);
    }
    const lampMat = glow(LAMP_HUE, 1.35);
    const lamps = mesh(lampGeos.length ? mergeAll(lampGeos) : new THREE.BufferGeometry(), lampMat);
    lamps.name = 'bridge-lamps';
    grp.add(lamps);

    const halos = haloGroup(haloSpots, 2.1);
    halos.name = 'bridge-halos';
    grp.add(halos);

    // 桥洞下的光：一道加性的横条，让券洞里读出拱
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(2, span * 0.62), 0.55),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffbf7e').multiplyScalar(0.55), transparent: true, opacity: 0.72, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    );
    under.name = 'bridge-beam';
    under.position.set(0, 0.34, 0);
    under.rotation.x = -Math.PI / 2;
    grp.add(under);

    grp.position.set(b.at[0], 0, b.at[1]);
    grp.rotation.y = dir;
    group.add(grp);

    list.push({
      id: b.id, name: b.name || b.id, over: b.over, type: b.type, group: grp,
      pos: [b.at[0], b.at[1]], dir, span, width, rise,
      deckAt: (x) => deckY(x, span / 2, rise),
      setGlow(v) {
        const on = v > 0.02;
        lamps.visible = on;
        halos.visible = on;
        under.visible = on;
        lamps.material = glow(LAMP_HUE, 0.4 + 1.2 * v);
        halos.material.opacity = 0.2 + 0.8 * v;
        halos.scale.setScalar(0.6 + 0.6 * v);
        under.material.opacity = 0.1 + 0.62 * v;
      },
    });
  }

  scene.add(group);
  return { group, list, byId: Object.fromEntries(list.map((b) => [b.id, b])) };
}

/** 一盏桥灯的壳：灯笼形，随材质发光 */
function lampGeo(r, x, y, z) {
  const g = new THREE.SphereGeometry(r, 8, 6);
  g.scale(1, 1.25, 1);
  g.translate(x, y, z);
  const cap = new THREE.CylinderGeometry(r * 0.42, r * 0.5, 0.14, 6);
  cap.translate(x, y + r * 1.3, z);
  const top = new THREE.CylinderGeometry(r * 0.1, r * 0.1, 0.4, 5);
  top.translate(x, y + r * 1.3 + 0.26, z);
  return mergeAll([g, cap, top]);
}

/** 一团团加性的光晕：一整个 Points，桥上所有灯共用 */
function haloGroup(spots, scale = 2.2) {
  const pos = new Float32Array(spots.length * 3);
  for (let i = 0; i < spots.length; i++) pos.set(spots[i], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    map: T.softGlow('255,196,124', 0.05), size: scale * 1.9, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const p = new THREE.Points(g, m);
  p.renderOrder = 6;
  return p;
}
