import * as THREE from 'three';
import { WHARF, CANAL } from './data.js';
import { M, mesh, box, plaqueMat, signMat, rand, rr } from './kit.js';
import * as T from './textures.js';

/**
 * 大码头 — the stone landing that served 毗陵驿: a paved wharf platform, a wide
 * flight of steps down to the water, the 牌坊 that marked it, and 皇华亭, the
 * highest-ranked of the receiving pavilions along the Changzhou canal. The stele
 * inside the pavilion ("毗陵驿") is a modern calligrapher's work, not an old one,
 * so it is left as a plain slab with no rubbing shown.
 */
export function buildWharf(scene) {
  const g = new THREE.Group();
  g.name = 'wharf';

  const stone = [], wood = [], tile = [], metal = [], lampHeads = [], ink = [];
  const B = (list, w, h, d, x, yBottom, z) => list.push(box(w, h, d, x, yBottom, z));
  const deck = CANAL.quayTopY;
  const lamps = [];
  const pavilions = [];
  const gx = WHARF.x;

  /* ---------------------------------------------------------------- 码头台面 */
  B(stone, WHARF.width, 0.42, WHARF.z1 - WHARF.z0 + 8, gx, deck - 0.42, (WHARF.z0 + WHARF.z1) / 2 + 2);
  // 系缆石 沿边一排
  for (let z = WHARF.z0 + 1; z < WHARF.z1 + 4; z += 2.4) {
    B(stone, 0.5, 0.34, 0.5, gx - WHARF.width / 2 + 0.9, deck, z);
    B(stone, 0.5, 0.34, 0.5, gx + WHARF.width / 2 - 0.9, deck, z);
  }
  // 阔石阶 下水
  const rise = (deck + 0.1 - (-0.4)) / WHARF.steps;
  for (let i = 0; i < WHARF.steps; i++) {
    B(stone, WHARF.width - 3, rise, 0.95, gx, deck + 0.1 - (i + 1) * rise, CANAL.nearZ - 1.2 + i * 0.95);
  }
  // 阶心 两侧 垂带石
  for (const s of [-1, 1]) {
    B(stone, 0.6, 1.7, WHARF.steps * 0.95, gx + s * ((WHARF.width - 3) / 2 + 0.35), deck - 1.5, CANAL.nearZ - 1.2 + (WHARF.steps * 0.95) / 2);
  }

  /* ---------------------------------------------------------------- 牌坊 */
  // 四柱三间：柱列横过来卡住上下码头的路
  const colZ = [-6.3, -2.1, 2.1, 6.3];
  const colH = [4.2, 5.4, 5.4, 4.2];
  for (let i = 0; i < 4; i++) {
    const z = colZ[i], h = colH[i];
    B(stone, 0.5, h, 0.5, gx, deck - 0.3, z);
    B(stone, 1.1, 0.32, 1.1, gx, deck - 0.5, z);                    // 夹杆石 础
    B(stone, 0.86, 0.5, 0.86, gx, deck - 0.3 + h, z);               // 柱头
    for (const s of [-1, 1]) B(stone, 0.9, 0.7, 0.7, gx + s * 0.7, deck, z);  // 抱鼓石
  }
  // 额坊：三道，中间一道最高并刻字
  B(wood, 0.42, 0.5, 13.6, gx, deck + 3.5, 0);                       // 下坊
  B(wood, 0.5, 0.86, 13.0, gx, deck + 4.1, 0);                       // 中坊
  B(stone, 0.56, 1.15, 8.4, gx, deck + 5.05, 0);                     // 上坊（明间）
  {
    const p = new THREE.PlaneGeometry(3.1, 0.86);
    p.rotateY(Math.PI / 2);
    p.translate(gx - 0.32, deck + 5.5, 0);
    g.add(new THREE.Mesh(p, plaqueMat('大码头')));
    const p2 = new THREE.PlaneGeometry(3.1, 0.86);
    p2.rotateY(-Math.PI / 2);
    p2.translate(gx + 0.32, deck + 5.5, 0);
    g.add(new THREE.Mesh(p2, plaqueMat('花市街')));
  }
  // 楼：明间一座两坡顶，次间各一座小顶
  B(tile, 1.9, 0.3, 4.6, gx, deck + 6.2, 0);
  B(tile, 1.5, 0.26, 3.4, gx, deck + 5.0, -4.2);
  B(tile, 1.5, 0.26, 3.4, gx, deck + 5.0, 4.2);
  for (const s of [-1, 1]) B(tile, 1.6, 0.24, 1.0, gx, deck + 6.4, s * 1.9);
  // 明间 脊上 一口 斗
  B(metal, 0.5, 0.6, 0.5, gx, deck + 6.5, 0);
  // 坊下 灯：夜里从牌坊底下过的人靠这两盏认路
  for (const z of [-3.2, 3.2]) {
    const y = deck + 4.4;
    const head = new THREE.SphereGeometry(0.24, 10, 8);
    head.scale(1, 1.3, 1);
    head.translate(gx, y, z);
    lampHeads.push(head);
    B(metal, 0.06, 0.5, 0.06, gx, y + 0.2, z);
    lamps.push([gx, y, z]);
  }

  /* ---------------------------------------------------------------- 皇华亭 */
  const tx = gx - 9, tz = 4.5;
  const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const half = 1.9;
  for (const [sx, sz] of corner) {
    B(wood, 0.28, 3.1, 0.28, tx + sx * half, deck, tz + sz * half);
    B(stone, 0.62, 0.24, 0.62, tx + sx * half, deck - 0.24, tz + sz * half);
  }
  B(stone, half * 2 + 1.6, 0.3, half * 2 + 1.6, tx, deck - 0.3, tz);   // 亭台
  // 攒尖顶：一只四棱锥，檐口再压一圈薄瓦
  const roofH = 2.4, eaveY = deck + 3.1;
  const pyramid = new THREE.ConeGeometry(half + 1.05, roofH, 4, 1, false);
  pyramid.rotateY(Math.PI / 4);
  pyramid.translate(tx, eaveY + roofH / 2 + 0.1, tz);
  tile.push(pyramid);
  B(tile, (half + 1.1) * 2, 0.2, (half + 1.1) * 2, tx, eaveY, tz);
  // 亭里一盏：接官亭是夜里等人下船的地方，该有光
  {
    const lant = new THREE.SphereGeometry(0.22, 10, 8);
    lant.scale(1, 1.3, 1);
    lant.translate(tx, deck + 1.9, tz);
    lampHeads.push(lant);
    B(metal, 0.06, 0.5, 0.06, tx, deck + 2.0, tz);
    lamps.push([tx, deck + 1.9, tz]);
    const pav = new THREE.PointLight(0xffc08a, 130, 16, 2);
    pav.position.set(tx, deck + 2.1, tz);
    g.add(pav);
    pavilions.push(pav);
  }
  B(tile, 1.1, 0.26, 1.1, tx, eaveY + roofH, tz);                       // 顶帽
  const top = new THREE.SphereGeometry(0.22, 10, 8);
  top.translate(tx, eaveY + roofH + 0.5, tz);
  lampHeads.push(top);
  lamps.push([tx, eaveY + roofH + 0.5, tz]);
  // 亭内的 碑（"毗陵驿"，今人所书，故只作一块素面石）
  B(ink, 0.34, 1.9, 0.9, tx, deck + 0.05, tz);
  B(stone, 0.9, 0.28, 1.2, tx, deck, tz);
  // 亭檐 灯
  {
    const y = eaveY - 0.3;
    const head = new THREE.SphereGeometry(0.22, 10, 8);
    head.scale(1, 1.3, 1);
    head.translate(tx, y, tz - half - 0.6);
    lampHeads.push(head);
    lamps.push([tx, y, tz - half - 0.6]);
  }

  /* ---------------------------------------------------------------- 地面 与 幌子 */
  // 码头到巷口的一段石板地，比河坝略高，让人看出这是一个"场"
  B(stone, 22, 0.22, 16, gx - 3, deck, -1);
  // 挑担、货筐一类的杂件，落在码头边上
  for (let i = 0; i < 7; i++) {
    B(wood, rr(0.5, 0.9), rr(0.28, 0.5), rr(0.4, 0.7), gx + rr(-7, 7), deck + 0.2, rr(-4, 1));
  }
  // 一面 幌子 挂在巷口那侧
  {
    B(wood, 0.14, 3.4, 0.14, gx - 10.4, deck, -6.2);
    B(wood, 0.1, 0.1, 0.9, gx - 10.4, deck + 3.2, -5.8);
    const p = new THREE.PlaneGeometry(0.85, 2.1);
    p.rotateY(Math.PI);
    p.translate(gx - 10.4, deck + 2.05, -5.5);
    g.add(new THREE.Mesh(p, signMat('脚行')));
  }

  /* ---------------------------------------------------------------- assembly */
  const put = (list, mat, name) => {
    if (!list.length) return;
    const m = mesh(list, mat);
    if (name) m.name = name;
    g.add(m);
  };
  put(stone, M.stoneWarm);
  put(wood, M.wood);
  put(tile, M.tile);
  put(metal, M.metal);
  put(ink, M.ink);
  put(lampHeads, M.lantern);

  const halo = new THREE.Points(haloGeo([[gx, deck + 4.4, -3.2], [gx, deck + 4.4, 3.2],
    [tx, deck + 1.9, tz], [tx, eaveY + roofH + 0.5, tz]]), haloMat());
  halo.name = 'media-halo';
  g.add(halo);

  const light = new THREE.PointLight(0xffc08a, 1250, 46, 2);
  light.position.set(gx, deck + 4.2, 0);
  g.add(light);

  scene.add(g);

  return {
    group: g,
    lamps,
    light,
    update(t, level) {
      halo.material.uniforms.uTime.value = t;
      halo.material.uniforms.uLevel.value = level;
      light.intensity = 1250 * level * (0.9 + 0.1 * Math.sin(t * 2.7 + 1.1));
      for (const p of pavilions) p.intensity = 130 * level * (0.9 + 0.1 * Math.sin(t * 3.3 + 0.4));
    },
  };
}

function haloGeo(positions) {
  const pos = [], size = [], phase = [];
  positions.forEach(([x, y, z], i) => {
    pos.push(x, y, z);
    size.push(4.6);
    phase.push(rand() * 6.28);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  return g;
}

function haloMat() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uTex: { value: T.softGlow('255,182,110', 0.1) } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime;
      varying float vA;
      void main(){ vA = 0.78 + 0.22*sin(uTime*2.4 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * 280.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uLevel; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0,0.74,0.42) * uLevel, t.a * vA * 0.55 * uLevel); }`,
  });
  m.toneMapped = false;
  return m;
}
