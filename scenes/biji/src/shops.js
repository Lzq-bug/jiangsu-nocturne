import * as THREE from 'three';
import { YARD, LANE, CANAL } from './data.js';
import { M, mesh, box, prism, rand, rr } from './kit.js';
import * as T from './textures.js';

/**
 * 前店后坊 — the courtyard workshop behind the shop front: drying rails stacked
 * with half-finished combs, a bench where the teeth are cut, bamboo stock, and
 * the single lamp that lights the whole yard.
 */
export function buildShops(scene) {
  const g = new THREE.Group();
  g.name = 'shops';

  const plaster = [], tile = [], wood = [], metal = [], ink = [], bamboo = [],
    comb = [], combFine = [], stone = [], lampGlow = [];
  const B = (list, w, h, d, x, yBottom, z, uv = 4) => list.push(box(w, h, d, x, yBottom, z, uv));
  const floorY = CANAL.laneY;

  const cx = (YARD.xMin + YARD.xMax) / 2;
  const cz = (YARD.zMin + YARD.zMax) / 2;
  const corrZ = YARD.zMax - 1.2;          // 廊柱 line, along the shop's back wall

  /* ---------------------------------------------------------------- 院落围合 */
  B(plaster, YARD.xMax - YARD.xMin + 6, 4.4, 0.6, cx, floorY, YARD.zMin - 0.3);
  B(tile, YARD.xMax - YARD.xMin + 7.6, 0.26, 1.2, cx, floorY + 4.4, YARD.zMin - 0.3);
  for (const sx of [-1, 1]) {
    const x = sx < 0 ? YARD.xMin : YARD.xMax;
    B(plaster, 0.6, 4.0, YARD.zMax - YARD.zMin, x, floorY, cz);
    B(tile, 1.1, 0.24, YARD.zMax - YARD.zMin + 1.4, x, floorY + 4.0, cz);
  }
  // 檐廊 along the covered side, and the door back to the shop
  for (let x = YARD.xMin + 2; x < YARD.xMax - 1; x += 3.4) B(wood, 0.26, 3.2, 0.26, x, floorY, corrZ);
  B(wood, YARD.xMax - YARD.xMin, 0.3, 1.9, cx, floorY + 3.2, corrZ - 0.5);
  B(tile, YARD.xMax - YARD.xMin + 1.6, 0.26, 2.6, cx, floorY + 3.5, corrZ - 0.7);
  B(ink, 1.8, 2.7, 0.6, cx - 6, floorY, YARD.zMax - 0.3);

  // 院地 — 石板
  B(stone, YARD.xMax - YARD.xMin, 0.26, YARD.zMax - YARD.zMin, cx, floorY - 0.26, cz);

  /* ---------------------------------------------------------------- 晾梳架 */
  /** two rails between four posts, combs hanging teeth-down in rows */
  function dryingRack(x, z, len, rows = 2) {
    for (const s of [-1, 1]) B(wood, 0.24, 3.1, 0.24, x + s * (len / 2), floorY, z);
    B(wood, len + 0.5, 0.16, 0.22, x, floorY + 2.95, z);
    for (let r = 0; r < rows; r++) {
      const ry = floorY + 2.05 + r * 0.72;
      B(wood, len, 0.1, 0.1, x, ry, z);
      const n = Math.round(len / 0.34);
      for (let i = 0; i < n; i++) {
        const px = x - len / 2 + (i + 0.5) * (len / n);
        const tall = rand() > 0.5;
        const w = tall ? 0.44 : 0.36, h = tall ? 0.86 : 0.6;
        (r % 2 === 0 ? comb : combFine).push(box(w, h, 0.05, px, ry - h, z, 0.36));
      }
    }
  }
  dryingRack(cx - 9, cz + 2.6, 5.4);
  dryingRack(cx - 2.4, cz + 2.6, 5.4);
  dryingRack(cx + 5.6, cz - 1.2, 6.2);
  dryingRack(cx + 5.6, cz + 3.4, 6.2);

  /* ---------------------------------------------------------------- 案板 与 家伙 */
  const benchX = cx - 8.5, benchZ = cz - 3.2;
  B(wood, 3.4, 0.16, 1.1, benchX, floorY + 0.78, benchZ);
  for (const s of [-1, 1]) B(wood, 0.18, 0.8, 0.9, benchX + s * 1.5, floorY, benchZ);
  for (let i = 0; i < 7; i++) B(combFine, 0.34, 0.06, 0.24, benchX - 1.2 + i * 0.36, floorY + 0.94, benchZ + 0.1, 0.3);
  for (let i = 0; i < 10; i++) B(comb, rr(0.28, 0.42), 0.08, 0.26, benchX + rr(-1.4, 1.4), floorY + 0.96 + i * 0.02, benchZ - rr(-0.4, 0.4), 0.3);

  // 竹料 — split bamboo stacked along the side wall
  for (let i = 0; i < 16; i++) {
    const pole = new THREE.CylinderGeometry(0.055, 0.055, rr(2.4, 3.6), 6);
    pole.rotateZ(Math.PI / 2);
    pole.translate(YARD.xMax - 2.2 + (i % 3) * 0.3, floorY + 0.3 + Math.floor(i / 3) * 0.34, cz - 4 + (i % 5) * 0.5);
    bamboo.push(pole);
  }
  // 篦齿坯 一筐筐
  for (const [bx, bz] of [[cx + 1, cz - 4.4], [cx + 3.4, cz - 4.6], [cx - 2.6, cz - 5.2]]) {
    bamboo.push(prism(12, 0.5, 0.42, 0.5, bx, floorY, bz));
    B(comb, 0.5, 0.12, 0.5, bx, floorY + 0.5, bz, 0.4);
  }
  // 木屑
  for (let i = 0; i < 22; i++) {
    B(comb, rr(0.1, 0.24), rr(0.04, 0.09), rr(0.1, 0.22), benchX + rr(-2, 2), floorY + i * 0.004, benchZ + rr(-1.4, 1.4));
  }
  for (let i = 0; i < 5; i++) {
    B(bamboo, rr(0.7, 1.2), 0.06, rr(0.7, 1.1), YARD.xMin + rr(1.4, 3), floorY + 0.6 + i * 0.1, cz + rr(-1, 4));
  }
  B(wood, 1.6, 0.5, 0.7, cx + 9, floorY, cz - 4.6);       // 料桌
  B(stone, 1.2, 0.2, 0.9, cx - 10, floorY, cz + 4.2);     // 压石

  /* ---------------------------------------------------------------- 匠人 */
  const figureMat = new THREE.MeshStandardMaterial({ color: 0x17131a, roughness: 0.92 });
  /** a silhouette at the bench; the right arm swings on the clock */
  function craftsman(x, z, rot, seated = true) {
    const s = new THREE.Group();
    const torso = box(0.42, seated ? 0.8 : 1.05, 0.3, 0, 0, 0);
    const head = new THREE.SphereGeometry(0.14, 10, 8);
    head.translate(0, (seated ? 0.8 : 1.05) + 0.26, 0.02);
    const legs = box(0.36, seated ? 0.4 : 0.85, 0.24, 0, 0.02, 0.16);
    const body = mesh([torso, head, legs], figureMat);
    body.name = 'figure-body';
    // the arm pivots at the shoulder: geometry hangs down from the origin
    const armGeo = new THREE.BoxGeometry(0.14, 0.6, 0.14);
    armGeo.translate(0, -0.3, 0);
    const arm = new THREE.Mesh(armGeo, figureMat);
    arm.name = 'figure-arm';
    arm.position.set(0.2, seated ? 0.66 : 0.86, 0.14);
    s.add(body, arm);
    s.position.set(x, floorY + (seated ? 0.44 : 0.86), z);
    s.rotation.y = rot;
    g.add(s);
    if (seated) B(wood, 0.5, 0.42, 0.44, x, floorY, z + 0.12);
    return arm;
  }
  const workArm = craftsman(benchX - 0.4, benchZ + 0.95, Math.PI, true);
  craftsman(benchX + 1.7, benchZ - 0.95, 0, false);
  craftsman(cx + 4.2, cz + 1.2, -Math.PI / 2, true);

  /* ---------------------------------------------------------------- 灯 */
  // 高脚灯 over the bench — the yard's only real light source
  B(metal, 0.1, 2.6, 0.1, benchX + 0.2, floorY, benchZ - 0.7);
  const keyPos = [benchX + 0.2, floorY + 2.5, benchZ - 0.7];
  lampBody(keyPos[0], keyPos[1], keyPos[2]);
  const key = new THREE.PointLight(0xffb877, 150, 24, 2);
  const fill = new THREE.PointLight(0xffc488, 85, 19, 2);
  key.position.set(keyPos[0], keyPos[1] - 0.1, keyPos[2] + 0.2);
  fill.position.set(cx + 2, floorY + 2.6, cz + 1.6);      // 晾架那边的一盏
  g.add(key, fill);

  for (const lx of [cx - 4, cx + 6]) {
    lampBody(lx, floorY + 2.8, corrZ - 0.4);
    B(metal, 0.06, 0.42, 0.06, lx, floorY + 3.0, corrZ - 0.4);
  }
  function lampBody(x, y, z) {
    const l = new THREE.SphereGeometry(0.27, 10, 8);
    l.scale(1, 1.25, 1);
    l.translate(x, y, z);
    lampGlow.push(l);
  }

  /* ---------------------------------------------------------------- assembly */
  const put = (geos, mat) => {
    if (geos.length) g.add(mesh(geos, mat));
  };
  put(plaster, M.plaster);
  put(tile, M.tile);
  put(wood, M.wood);
  put(metal, M.metal);
  put(ink, M.ink);
  put(bamboo, M.bamboo);
  put(comb, M.comb);
  put(combFine, M.combFine);
  put(stone, M.flagWet);
  put(lampGlow, M.lantern);

  const halo = new THREE.Points(halos([
    keyPos,
    [cx - 4, floorY + 2.8, corrZ - 0.4],
    [cx + 6, floorY + 2.8, corrZ - 0.4],
  ]), haloMat());
  halo.name = 'media-halo';
  g.add(halo);

  scene.add(g);

  return {
    group: g,
    lampPos: keyPos,
    update(t, lanternLevel) {
      key.intensity = 150 * lanternLevel * (0.86 + 0.1 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 7.7));
      fill.intensity = 85 * lanternLevel * (0.9 + 0.1 * Math.sin(t * 2.4 + 0.8));
      halo.material.uniforms.uTime.value = t;
      halo.material.uniforms.uLevel.value = lanternLevel;
      workArm.rotation.x = -0.45 + 0.4 * Math.sin(t * 2.6);
    },
  };
}

function halos(positions) {
  const n = positions.length;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
  positions.forEach(([x, y, z], i) => {
    pos.set([x, y, z], i * 3);
    size[i] = 4.4 - i * 0.6;
    phase[i] = i * 1.7;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return geo;
}

function haloMat() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uTex: { value: T.softGlow('255,186,116', 0.1) } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime;
      varying float vA;
      void main(){ vA = 0.8 + 0.2*sin(uTime*3.0 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * 260.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uLevel; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0,0.74,0.42) * uLevel, t.a * vA * 0.6 * uLevel); }`,
  });
  m.toneMapped = false;
  return m;
}
