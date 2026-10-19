import * as THREE from 'three';
import { GE, CANAL } from './data.js';
import { M, mesh, box, slopeRoof, plaqueMat, rand, rr } from './kit.js';
import * as T from './textures.js';

/**
 * 近水阁 — the waterside pavilion at the lane's west tail, originally called
 * 文亨阁. Three storeys, deep eaves with the corners lifted, a balustrade gallery
 * on the two upper levels, and a lamp at every eave corner. This is the vertical
 * that closes the lane's vista; the record has no pagoda here, so nothing about a
 * 塔 is being rebuilt — the 阁 is.
 */
export function buildPavilion(scene) {
  const g = new THREE.Group();
  g.name = 'pavilion';
  g.position.set(GE.x, 0, GE.z);

  const plaster = [], wood = [], woodDark = [], tile = [], metal = [],
    litPanels = [], darkPanels = [], lampHeads = [], stone = [];
  const haloLocal = [];
  const lamps = [];                       // world positions, for water columns
  const base = CANAL.quayTopY;            // the pavilion stands on the quay deck

  const B = (list, w, h, d, x, yBottom, z) => list.push(box(w, h, d, x, yBottom, z));

  /* ---------------------------------------------------------------- 台基 */
  B(stone, GE.bays + 6, GE.plinth, GE.depth + 5, 0, base - GE.plinth, 0);
  B(stone, GE.bays + 7.4, 0.3, GE.depth + 6.4, 0, base, 0);
  // 栏杆 on the plinth edge (south side left open for the stairs)
  for (let x = -(GE.bays + 6) / 2; x <= (GE.bays + 6) / 2; x += 1.5) {
    if (Math.abs(x) < 2.2) continue;
    B(metal, 0.16, 0.9, 0.16, x, base + 0.15, (GE.depth + 5) / 2 * -1);
  }
  B(metal, GE.bays + 6, 0.12, 0.2, 0, base + 1.05, -(GE.depth + 5) / 2);
  // 台阶 down to the plaza
  for (let i = 0; i < 5; i++) {
    B(stone, 4.2, GE.plinth / 5, 0.8, 0, base - GE.plinth + i * (GE.plinth / 5), -(GE.depth + 5) / 2 - 2.4 - i * 0.8);
  }

  /* ---------------------------------------------------------------- 三层 */
  let y = base + 0.15;
  const sizes = [
    { w: GE.bays, d: GE.depth },
    { w: GE.bays * 0.86, d: GE.depth * 0.86 },
    { w: GE.bays * 0.7, d: GE.depth * 0.7 },
  ];
  for (let i = 0; i < GE.storeys; i++) {
    const { w, d } = sizes[i];
    const h = GE.storeyH[i];
    const eaveY = y + h;
    const ov = GE.eaveOver * (i === 2 ? 1.15 : 1);

    // 身
    B(plaster, w, h, d, 0, y, 0);
    // 檐柱 沿 面阔
    for (let k = 0; k <= 4; k++) {
      const px = -w / 2 + (k / 4) * w;
      B(wood, 0.3, h - 0.2, 0.3, px, y, -d / 2 - 0.15);
      B(wood, 0.3, h - 0.2, 0.3, px, y, d / 2 + 0.15);
    }
    // 格扇：南面开门，东西北面上窗
    const doors = i === 0 ? 3 : 2;
    for (let k = 0; k < doors; k++) {
      const px = (k - (doors - 1) / 2) * (w / (doors + 0.6));
      const lit = i === 0 ? k !== 1 : rand() > 0.3;
      const pw = i === 0 ? 1.5 : 1.3, ph = i === 0 ? h - 1.1 : 1.5;
      panel(lit ? litPanels : darkPanels, pw, ph, px, y + (i === 0 ? 0.15 : h * 0.45), -(d / 2 + 0.1));
    }
    for (const s of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const pz = (k - 0.5) * (d / 2.4);
        panel(rand() > 0.45 ? litPanels : darkPanels, 1.2, 1.3, s * (w / 2 + 0.1), y + h * 0.45, pz, Math.PI / 2);
      }
    }
    panel(rand() > 0.5 ? litPanels : darkPanels, 2.6, 1.4, 0, y + h * 0.5, d / 2 + 0.1, Math.PI);

    // 腰檐 平座（二层以上有一圈栏板）
    if (i > 0) {
      B(wood, w + 2.2, 0.24, d + 2.2, 0, y - 0.26, 0);
      for (let k = 0; k <= 6; k++) {
        const px = -w / 2 - 0.8 + (k / 6) * (w + 1.6);
        B(metal, 0.12, GE.railH, 0.12, px, y - 0.02, -(d / 2 + 1.0));
        B(metal, 0.12, GE.railH, 0.12, px, y - 0.02, (d / 2 + 1.0));
      }
      B(metal, w + 1.8, 0.1, 0.14, 0, y + GE.railH - 0.02, -(d / 2 + 1.0));
      B(metal, w + 1.8, 0.1, 0.14, 0, y + GE.railH - 0.02, (d / 2 + 1.0));
    }

    // 屋顶：一层深檐 + 起翘，山面用 山花 板收住
    const prof = roofSection(d + ov * 2, eaveY, eaveY + (i === 2 ? 2.2 : 1.5));
    const rg = slopeRoof(w + ov * 2.6, prof, { camber: 0.85 + i * 0.2, seg: 9, uvScale: 1.5 });
    g.add(new THREE.Mesh(rg, M.tile));
    for (const s of [-1, 1]) {
      B(woodDark, 0.16, 1.1, d + ov * 1.6, s * (w / 2 + ov * 1.2), eaveY + 0.35, 0);
      B(tile, 0.5, 0.24, d + ov * 2, s * (w / 2 + ov * 1.2), eaveY + 1.0, 0);
    }
    B(tile, w + ov * 2.6, 0.3, 0.6, 0, eaveY + (i === 2 ? 2.1 : 1.4), 0);

    // 角灯：每个檐角一盏，四面都算，向河那侧的进水面光柱
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = sx * (w / 2 + ov * 1.15), cz = sz * (d / 2 + ov * 1.05);
        const cy = eaveY - 0.45;
        lampHead(cx, cy, cz);
        haloLocal.push([cx, cy, cz]);
        if (cz > 0 && (i === GE.storeys - 1 || sz > 0)) lamps.push([GE.x + cx, cy, GE.z + cz]);
      }
    }
    y = eaveY + 0.55;
  }

  /* ---------------------------------------------------------------- 顶 与 匾 */
  // 正脊 两端 吻兽 + 顶心 宝瓶
  for (const s of [-1, 1]) B(metal, 0.36, 0.9, 0.5, s * (sizes[2].w / 2 + 1.2), y - 0.35, 0);
  const finial = new THREE.SphereGeometry(0.34, 10, 8);
  finial.translate(0, y + 0.6, 0);
  lampHeads.push(finial);
  haloLocal.push([0, y + 0.6, 0]);
  lamps.push([GE.x, y + 0.6, GE.z]);

  // 匾：南面一层门上，写它的原名
  {
    const p = new THREE.PlaneGeometry(3.4, 0.95);
    p.rotateY(Math.PI);
    p.translate(0, y - GE.storeyH[2] - 0.4, -(GE.depth * 0.7 / 2 + 0.25));
    g.add(new THREE.Mesh(p, plaqueMat('文亨阁')));
  }

  /* ---------------------------------------------------------------- assembly */
  const put = (list, mat) => { if (list.length) g.add(mesh(list, mat)); };
  put(stone, M.stoneWarm);
  put(plaster, M.plaster);
  put(wood, M.wood);
  put(woodDark, M.woodDark);
  put(metal, M.metal);
  put(tile, M.tile);
  put(litPanels, M.pavilionPanel);
  put(darkPanels, M.ink);
  put(lampHeads, M.pavilionLamp);

  const halo = new THREE.Points(haloGeo(haloLocal), haloMat());
  halo.name = 'media-halo';
  g.add(halo);

  // 一点实在的暖光打在阁前的空地上，免得立面只剩天光照
  const wash = new THREE.PointLight(0xffc48c, 1700, 58, 2);
  wash.position.set(GE.x - 2, base + 5.5, GE.z - 6);
  scene.add(wash);

  scene.add(g);

  return {
    group: g,
    lamps,
    topY: base + y + 1,
    wash,
    halo,
    update(t, level) {
      M.pavilionLamp.emissiveIntensity = 0.85 * level;
      M.pavilionPanel.emissiveIntensity = 0.5 * level;
      halo.material.uniforms.uTime.value = t;
      halo.material.uniforms.uLevel.value = level;
      wash.intensity = 1700 * level;
    },
  };

  function panel(list, w, h, x, yBottom, z, rotY = 0) {
    const p = new THREE.PlaneGeometry(w, h);
    if (rotY) p.rotateY(rotY);
    p.translate(x, yBottom + h / 2, z);
    list.push(p);
  }
  function lampHead(x, y, z) {
    const body = new THREE.SphereGeometry(0.24, 10, 8);
    body.scale(1, 1.3, 1);
    body.translate(x, y, z);
    lampHeads.push(body);
    B(wood, 0.06, 0.4, 0.06, x, y + 0.2, z);
  }
}

/** 檐口 → 脊 的举折剖面（横过屋面的深度方向） */
function roofSection(depth, eaveY, ridgeY) {
  const half = depth / 2;
  const N = 4;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([-half * (1 - t), eaveY + (ridgeY - eaveY) * Math.pow(t, 1.45)]);
  }
  for (let i = N - 1; i >= 0; i--) {
    const t = i / N;
    pts.push([half * (1 - t), eaveY + (ridgeY - eaveY) * Math.pow(t, 1.45)]);
  }
  return pts;
}

function haloGeo(positions) {
  const pos = [], size = [], phase = [];
  positions.forEach(([x, y, z], i) => {
    pos.push(x, y, z);
    size.push(3.4 + rr(0, 1.2));
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
    uniforms: {
      uTime: { value: 0 }, uLevel: { value: 1 },
      uTex: { value: T.softGlow('255,192,124', 0.08) },
    },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime;
      varying float vA;
      void main(){ vA = 0.7 + 0.3*sin(uTime*1.7 + aPhase);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * 300.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uLevel; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0,0.78,0.46) * uLevel, t.a * vA * 0.5 * uLevel); }`,
  });
  m.toneMapped = false;
  return m;
}
