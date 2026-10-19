import * as THREE from 'three';
import { LANE, CANAL, YARD } from './data.js';
import { M, mesh, box, slopeRoof, rand, rr, pick, signMat } from './kit.js';
import * as T from './textures.js';

/**
 * 一横巷 — the lane itself: two rows of 河房/民居 along X, a stone pavement
 * between them, lanterns under the eaves, banners over the doors.
 * Everything merges per material: the lane is one long night, not a thousand
 * draw calls.
 *
 * `facing` is the normal of the facade: -1 for the river row (its front looks
 * inland, toward -Z), +1 for the opposite row (front toward +Z).
 */

const B = (list, w, h, d, x, yBottom, z) => list.push(box(w, h, d, x, yBottom, z));

/** roof section across the depth: eave → 举折 → ridge → eave, as [z, y] pairs */
function roofProfile(depth, eaveY, ridgeY, overhang = 0.7) {
  const half = depth / 2 + overhang;
  const N = 4;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([-half * (1 - t), eaveY + (ridgeY - eaveY) * Math.pow(t, 1.5)]);
  }
  for (let i = N - 1; i >= 0; i--) {
    const t = i / N;
    pts.push([half * (1 - t), eaveY + (ridgeY - eaveY) * Math.pow(t, 1.5)]);
  }
  return pts;
}

/**
 * 马头墙 — the gable wall that stands above the roof at each end of a house and
 * steps down toward the eaves. Both halves are built from the same profile the
 * roof uses, raised a little so the wall keeps its head above the tiles.
 */
function hammerhead(wall, tile, x, zc, depth, baseY, eaveY, ridgeY) {
  const half = depth / 2;
  const segs = 4;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const z0 = i * (half / segs), z1 = (i + 1) * (half / segs);
      const t = 1 - (i / segs);
      const top = eaveY + (ridgeY + 0.75 - eaveY) * Math.pow(t, 1.25);
      const d = z1 - z0 + 0.04;
      const zc2 = zc + dir * (z0 + z1) / 2;
      B(wall, 0.4, Math.max(0.5, top - baseY), d, x, baseY, zc2);
      B(tile, 0.68, 0.2, d + 0.26, x, top, zc2);
    }
  }
}

const SIGNS = ['梳', '篦', '泉', '茶', '酒', '布', '药', '灯', '匠', '梳篦', '澡豆', '京果'];

export function buildLane(scene) {
  const g = new THREE.Group();
  g.name = 'lane';

  const plaster = [], ink = [], tile = [], wood = [], plank = [], metal = [],
    lantern = [], lanternCap = [], stone = [];
  const latLit = [], latIce = [], latDark = [];
  const signs = new Map();
  const roofs = [];
  const lanternPos = [];
  const lamps = [];
  const lights = [];

  const addSign = (text, geo) => {
    if (!signs.has(text)) signs.set(text, []);
    signs.get(text).push(geo);
  };

  /** a vertical quad standing on the facade plane, pushed slightly off the wall */
  function panel(list, w, h, x, yBottom, z, facing) {
    const p = new THREE.PlaneGeometry(w, h);
    if (facing < 0) p.rotateY(Math.PI);
    p.translate(x, yBottom + h / 2, z);
    list.push(p);
    return p;
  }

  function lanternAt(x, y, z) {
    const body = new THREE.SphereGeometry(0.3, 12, 9);
    body.scale(1, 1.28, 1);
    body.translate(x, y - 0.44, z);
    lantern.push(body);
    const top = new THREE.CylinderGeometry(0.15, 0.17, 0.12, 8);
    top.translate(x, y - 0.02, z);
    lanternCap.push(top);
    const bottom = new THREE.CylinderGeometry(0.13, 0.09, 0.11, 8);
    bottom.translate(x, y - 0.84, z);
    lanternCap.push(bottom);
    B(metal, 0.05, 0.42, 0.05, x, y - 0.06, z);
    lanternPos.push([x, y - 0.44, z]);
  }

  /* ---------------------------------------------------------------- one house */
  function house(x, w, { facing, zFront, depth, h2, ridge, shop }) {
    const baseY = CANAL.laneY;
    const zc = zFront - facing * depth / 2;
    const out = (k) => zFront + facing * k;      // k metres clear of the facade

    B(plaster, w - 0.15, h2 - baseY, depth, x, baseY, zc);

    const rg = slopeRoof(w + 1.3, roofProfile(depth, h2, ridge), { camber: 0.42, seg: 7 });
    rg.translate(x, 0, zc);
    roofs.push(rg);
    B(tile, w + 1.3, 0.26, 0.5, x, ridge - 0.12, zc);
    B(wood, w + 1.1, 0.26, 0.26, x, h2 - 0.36, out(0.06));

    hammerhead(plaster, tile, x - w / 2, zc, depth, baseY, h2, ridge);
    hammerhead(plaster, tile, x + w / 2, zc, depth, baseY, h2, ridge);

    /* 二层 窗 */
    const sill = 5.9;
    const nWin = w > 9 ? 2 : 1;
    for (let i = 0; i < nWin; i++) {
      const wx = x + (i - (nWin - 1) / 2) * (w / (nWin + 0.4));
      const litUp = rand() > 0.36;
      const ice = litUp && rand() > 0.74;
      panel(ice ? latIce : litUp ? latLit : latDark, 1.5, 1.15, wx, sill, out(0.06), facing);
      B(wood, 1.8, 0.13, 0.16, wx, sill - 0.62, out(0.12));
    }

    if (shop) {
      const dw = Math.min(3.8, w * 0.44);
      // the recessed front, the lamp inside it, and the counter at the door
      B(ink, dw, 3.0, 1.0, x, baseY, zc + facing * (depth / 2 - 0.55));
      panel(latLit, dw * 0.46, 2.2, x - dw * 0.24, baseY + 0.35, out(0.05), facing);
      if (rand() > 0.42) B(plank, dw * 0.5, 2.6, 0.12, x + dw * 0.3, baseY + 0.2, out(0.1));
      addSign(pick(SIGNS), panel([], 0.9, 2.2, x + dw * 0.66, baseY + 2.85, out(0.16), facing));
      addSign(pick(['篦', '梳', '梳篦']), panel([], 1.2, 0.7, x, baseY + 3.2, out(0.2), facing));
      B(wood, dw * 0.8, 0.16, 0.72, x - dw * 0.2, baseY + 0.95, zc + facing * (depth / 2 - 1.4));
      for (const sx of [-1, 1]) lanternAt(x + sx * dw * 0.74, h2 - 0.5, out(0.55));
      B(metal, 0.09, 0.09, 1.0, x, h2 - 0.22, out(0.5));
    } else {
      const dx = x - w * 0.18;
      B(plank, 1.5, 2.5, 0.14, dx, baseY + 0.05, out(0.1));
      B(plaster, 1.9, 0.75, 0.5, dx, baseY + 2.6, out(0.26));
      B(tile, 2.4, 0.24, 1.0, dx, baseY + 3.35, out(0.45));
      if (rand() > 0.58) lanternAt(x + w * 0.2, h2 - 0.55, out(0.5));
      if (rand() > 0.78) addSign(pick(['茶', '酒', '布', '药']), panel([], 0.8, 1.9, x + w * 0.3, baseY + 2.6, out(0.16), facing));
    }
    for (const sx of [-1, 1]) B(wood, 0.26, h2 - baseY - 0.35, 0.26, x + sx * (w / 2 - 0.4), baseY, out(0.3));
  }

  /* ---------------------------------------------------------------- the rows */
  function row(x0, x1, facing, zFront, depth, shopEvery) {
    let x = x0, i = 0;
    while (x < x1 - 4) {
      const w = rr(6.6, 10.8);
      if (x + w > x1) break;
      // the workshop courtyard stays open to the sky
      const inYard = facing > 0 && (x + w > YARD.xMin - 1 && x < YARD.xMax + 1);
      if (!inYard) {
        const h2 = rr(6.9, 8.7);
        house(x + w / 2, w, {
          facing, zFront, depth, h2,
          ridge: h2 + rr(1.5, 2.5),
          shop: i % shopEvery === 0 || rand() > 0.74,
        });
      }
      x += w + rr(0.15, 0.5);
      i++;
    }
  }

  row(LANE.xMin, LANE.xMax, -1, LANE.frontZ, LANE.frontDepth, 2);
  row(LANE.xMin, LANE.xMax, 1, LANE.backZ, LANE.backDepth, 4);

  /* ---------------------------------------------------------------- pavement */
  const laneW = Math.abs(LANE.frontZ - LANE.backZ);
  const laneCz = (LANE.frontZ + LANE.backZ) / 2;
  const laneCx = (LANE.xMin + LANE.xMax) / 2;
  const laneLen = LANE.xMax - LANE.xMin + 74;   // 石板一直铺到码头前的空地
  B(stone, laneLen, 0.3, laneW, laneCx, CANAL.laneY - 0.3, laneCz);
  B(ink, laneLen, 0.06, 0.5, laneCx, CANAL.laneY - 0.03, laneCz);
  for (const s of [-1, 1]) B(ink, laneLen, 0.05, 0.34, laneCx, CANAL.laneY - 0.06, laneCz + s * (laneW / 2 - 0.5));

  /* ---------------------------------------------------------------- 巷门 */
  const gx = LANE.xMin - 1.5;
  for (const s of [-1, 1]) B(plaster, 1.6, 4.6, 1.7, gx, CANAL.laneY, laneCz + s * (laneW / 2 + 0.85));
  B(wood, 1.4, 0.4, laneW + 4, gx, CANAL.laneY + 4.6, laneCz);
  B(tile, 2.6, 0.3, laneW + 5, gx, CANAL.laneY + 5.0, laneCz);
  {
    const p = new THREE.PlaneGeometry(1.1, 2.6);
    p.rotateY(Math.PI / 2);
    p.translate(gx - 0.9, CANAL.laneY + 2.6, laneCz);
    addSign('篦箕巷', p);
  }
  // 南口: the mouth the tower stands behind, so the alley ends on an opening
  const sx = LANE.xMax + 2;
  for (const s of [-1, 1]) B(plaster, 1.6, 4.4, 1.7, sx, CANAL.laneY, laneCz + s * (laneW / 2 + 0.85));
  B(wood, 1.4, 0.4, laneW + 4, sx, CANAL.laneY + 4.4, laneCz);
  B(tile, 2.6, 0.3, laneW + 5, sx, CANAL.laneY + 4.8, laneCz);
  {
    const p = new THREE.PlaneGeometry(1.0, 2.3);
    p.rotateY(-Math.PI / 2);
    p.translate(sx + 0.9, CANAL.laneY + 2.4, laneCz);
    addSign('花市街', p);
  }

  /* ---------------------------------------------------------------- 井 与 石凳 */
  const well = new THREE.CylinderGeometry(0.62, 0.66, 0.66, 16, 1, true);
  well.translate(-46, CANAL.laneY + 0.33, laneCz + 1.8);
  plaster.push(well);
  B(stone, 1.5, 0.1, 1.5, -46, CANAL.laneY + 0.66, laneCz + 1.8);
  for (const bx of [-64, -12, 30]) B(stone, 1.9, 0.34, 0.62, bx, CANAL.laneY, laneCz - 2.2);

  /* ---------------------------------------------------------------- 河坝石灯 */
  for (let x = CANAL.xMin + 34; x < CANAL.xMax - 34; x += 13) {
    const z = CANAL.nearZ - 2.6;
    B(stone, 0.42, 2.6, 0.42, x, CANAL.quayTopY - 0.2, z);
    B(stone, 0.9, 0.2, 0.9, x, CANAL.quayTopY + 2.4, z);
    B(tile, 1.15, 0.2, 1.15, x, CANAL.quayTopY + 2.6, z);
    const core = new THREE.BoxGeometry(0.44, 0.46, 0.44);
    core.translate(x, CANAL.quayTopY + 2.02, z);
    lantern.push(core);
    lamps.push([x, CANAL.quayTopY + 2.05, z]);
  }

  /* ---------------------------------------------------------------- assembly */
  const put = (geos, mat, name) => {
    if (!geos.length) return null;
    const m = mesh(geos, mat);
    if (name) m.name = name;
    g.add(m);
    return m;
  };
  put(plaster, M.plaster);
  put(ink, M.ink);
  put(stone, M.flagWet);
  put(wood, M.wood);
  put(plank, M.plank);
  put(metal, M.metal);
  put(latLit, M.lattice);
  put(latIce, M.latticeIce);
  put(latDark, M.latticeDark);
  put(roofs, M.tile);
  put(lantern, M.lantern);
  put(lanternCap, M.woodDark);
  for (const [text, geos] of signs) put(geos, signMat(text, text.length > 2 ? '#cbb483' : undefined));

  const halo = new THREE.Points(makeGlowPoints(lanternPos.concat(lamps)), glowPointsMat());
  halo.name = 'media-halo';
  g.add(halo);

  // real lights only where a station actually stands, so the plaster catches them
  for (const [x, y, z] of [
    [-6, 5.6, -23.2], [-56, 5.4, -23.2], [26, 5.8, -23.2],
    [-44, 5.2, -28.2], [14, 3.4, -38.5], [-14, 5.0, 2.4],
  ]) {
    const l = new THREE.PointLight(0xffc08a, 215, 24, 2);
    l.position.set(x, y, z);
    lights.push(l);
    g.add(l);
  }

  scene.add(g);

  return {
    group: g,
    lamps,
    lights,
    update(t, lanternLevel, windowLevel) {
      M.lantern.emissiveIntensity = 0.8 * lanternLevel;
      M.lattice.emissiveIntensity = 0.5 * windowLevel;
      M.latticeIce.emissiveIntensity = 0.36 * windowLevel;
      M.latticeDark.emissiveIntensity = 0.12 * windowLevel;
      halo.material.uniforms.uTime.value = t;
      halo.material.uniforms.uLevel.value = lanternLevel;
      const flick = 0.9 + 0.1 * Math.sin(t * 2.3);
      lights.forEach((l, i) => {
        l.intensity = 215 * lanternLevel * flick * (0.92 + 0.08 * Math.sin(t * 2.1 + i * 1.7));
      });
    },
  };
}

/* ------------------------------------------------------------------ halos */
function makeGlowPoints(positions) {
  const n = positions.length;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
  positions.forEach(([x, y, z], i) => {
    pos.set([x, y, z], i * 3);
    size[i] = 1.5 + (i % 3) * 0.3;
    phase[i] = ((i * 0.618) % 1) * 6.283;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return geo;
}

function glowPointsMat() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: { value: 0 }, uLevel: { value: 1 },
      uTex: { value: T.softGlow('255,168,92', 0.1) },
    },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime;
      varying float vA;
      void main(){ vA = 0.76 + 0.24*sin(uTime*2.2 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * 240.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uLevel; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0,0.68,0.36) * uLevel, t.a * vA * 0.5 * uLevel); }`,
  });
  m.toneMapped = false;
  return m;
}
