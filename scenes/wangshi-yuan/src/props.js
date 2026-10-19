import * as THREE from 'three';
import { M, glow, rand, rr, figureGeo, lampPostGeo, stringPath, box, mesh } from './kit.js';
import * as T from './textures.js';
import { DECK, POND, SHOW, STATIONS } from './data.js';

const D = DECK;

/* ------------------------------------------------------------------ 园灯 */
/**
 * 檐下宫灯、廊下一串、岸上石灯、池里荷花灯。
 * 每一盏在水边灯都在光柱系统里挂一条影子，池面才有那一柱柱暖色。
 */
function lanterns(scene, columns, anchors) {
  const bodyGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.44, 10, 1);
  const bodyMat = new THREE.MeshStandardMaterial({
    map: T.lanternPaper('#ffe7bd', '#d1502f'), roughness: 0.62,
    emissive: new THREE.Color('#ff9a4e'), emissiveIntensity: 1.1, emissiveMap: T.lanternPaper('#fff2d2', '#e8623a'),
  });
  const spots = [];
  for (const p of anchors.eaveLamps) spots.push({ p: p.clone(), kind: 'eave', w: 0.62, d: 4.2 });
  for (const p of anchors.postLamps) spots.push({ p: p.clone(), kind: 'post', w: 0.5, d: 3.0 });
  for (const p of anchors.courtLamps) spots.push({ p: p.clone(), kind: 'eave', w: 0.5, d: 3.4 });

  // 廊下：沿每折廊每 3.2 米一盏
  for (const line of anchors.galleries || []) {
    for (let s = 0; s < line.length - 1; s++) {
      const [x0, z0] = line[s], [x1, z1] = line[s + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 3.2));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        spots.push({
          p: new THREE.Vector3(x0 + (x1 - x0) * t, D + 2.05, z0 + (z1 - z0) * t),
          kind: 'gallery', w: 0.44, d: 2.8,
        });
      }
    }
  }

  const inst = new THREE.InstancedMesh(bodyGeo, bodyMat, spots.length);
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3).fill(1), 3);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  const haloUni = { uTime: { value: 0 }, uOn: { value: 1 }, uMap: { value: T.softGlow('255,196,124', 0.1) } };
  const haloPos = new Float32Array(spots.length * 3);
  const colIdx = [];
  spots.forEach((s, i) => {
    d.position.copy(s.p);
    d.scale.set(s.kind === 'post' ? 0.85 : 1, s.kind === 'post' ? 0.8 : 1, 1);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
    col.set(s.kind === 'post' ? '#ffd9a4' : '#ff9f57');
    inst.setColorAt(i, col);
    haloPos[i * 3] = s.p.x; haloPos[i * 3 + 1] = s.p.y; haloPos[i * 3 + 2] = s.p.z;
    // 只有真挨着水面的灯才拖得出光柱
    const near = Math.hypot(s.p.x / POND.rx, s.p.z / POND.rz) < 1.6;
    if (near) colIdx.push([i, columns.add(s.p, s.kind === 'post' ? '#ffd9a4' : '#ff9f57', s.w, s.d, 0.8)]);
    else colIdx.push([i, -1]);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.frustumCulled = false;
  scene.add(inst);

  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
  const haloMat = new THREE.ShaderMaterial({
    uniforms: haloUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      uniform float uOn; varying float vS;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vS = uOn;
        gl_PointSize = min(34.0, (30.0 + 8.0*uOn) * (12.0 / max(1.4, -mv.z)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uTime; varying float vS;
      void main(){
        float f = 0.86 + 0.14*sin(uTime*3.1 + gl_FragCoord.x*0.04 + gl_FragCoord.y*0.03);
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0,0.78,0.46) * 1.7 * vS * f, t.a * vS * 0.85);
      }`,
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  halos.renderOrder = 5;
  scene.add(halos);

  // 石灯的柱子
  const posts = [];
  for (const s of spots) {
    if (s.kind !== 'post') continue;
    posts.push(lampPostGeo({ base: 0.34, shaft: 1.15, head: 0.42 }));
    posts[posts.length - 1].translate(s.p.x, D, s.p.z);
  }
  if (posts.length) {
    const pm = mesh(posts, M.stone);
    pm.castShadow = true;
    scene.add(pm);
  }

  // 现代洗墙灯：藏在石缝与花根的一条条暖光，刻意画成设备而不是构件
  const wash = [];
  for (const p of anchors.wallWash || []) {
    wash.push(box(0.42, 0.09, 0.16, p.x, p.y, p.z));
  }
  if (wash.length) {
    scene.add(mesh(wash, glow('#ffe3b4', 2.6)));
    const washMat = new THREE.MeshBasicMaterial({
      map: T.uplight(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false,
    });
    washMat.toneMapped = false;
    for (const wp of anchors.wallWash || []) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.0), washMat);
      sheet.position.set(wp.x, wp.y + 1.35, wp.z);
      sheet.rotation.y = Math.atan2(-wp.x, 14 - wp.z) * 0.5;
      scene.add(sheet);
    }
  }

  return {
    inst, halos, uni: haloUni, count: spots.length, waterCols: colIdx,
    setDensity(v) {
      const on = Math.min(1.4, v);
      haloUni.uOn.value = on;
      bodyMat.emissiveIntensity = 0.25 + on * 1.1;
      for (const [, ci] of colIdx) {
        columns.setOn(ci, on > 0.06);
        if (ci < 0) continue;
        const it = columns.items[ci];
        it.width = it.baseWidth * (0.55 + 0.55 * Math.min(1, on));
        it.depth = it.baseDepth * (0.7 + 0.4 * Math.min(1, on));
      }
      columns.dirty = true;
    },
    update(t) { haloUni.uTime.value = t; },
  };
}

/* ------------------------------------------------------------------ 荷花灯 */
function lotusLamps(scene, columns) {
  const N = 22;
  const items = [];
  const petalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffe0ad'), roughness: 0.7, emissive: new THREE.Color('#ff9a48'), emissiveIntensity: 0.9,
    side: THREE.DoubleSide,
  });
  const grp = new THREE.Group();
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const k = Math.sqrt(rand()) * 0.8;
    const x = Math.cos(a) * POND.rx * k, z = Math.sin(a) * POND.rz * k;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.12, 8), petalMat);
    cup.position.set(x, 0.05, z);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,190,120', 0.08), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    flame.position.set(x, 0.22, z);
    flame.scale.setScalar(0.9);
    grp.add(cup, flame);
    items.push({
      cup, flame, x, z, phase: rand() * 6.28, drift: rr(0.1, 0.35),
      col: columns.add(new THREE.Vector3(x, 0, z), '#ff9a4e', 0.4, 2.4, 0.9),
    });
  }
  grp.name = 'lotus-lamps';
  scene.add(grp);
  return {
    grp, items, uni: petalMat,
    setDensity(v) {
      const on = Math.min(1.4, v);
      petalMat.emissiveIntensity = 0.15 + on * 0.9;
      for (const it of items) {
        it.flame.material.opacity = Math.min(1, 0.25 + on);
        columns.setOn(it.col, on > 0.06);
      }
    },
    update(t) {
      for (const it of items) {
        const dx = Math.sin(t * it.drift + it.phase) * 0.5;
        const dz = Math.cos(t * it.drift * 0.8 + it.phase) * 0.4;
        it.cup.position.set(it.x + dx, 0.05 + Math.sin(t * 0.9 + it.phase) * 0.02, it.z + dz);
        it.flame.position.set(it.x + dx, 0.24, it.z + dz);
        columns.setPos(it.col, it.cup.position);
      }
    },
  };
}

/* ------------------------------------------------------------------ 演员 */
/**
 * 每个点位一组身段。开戏的那一组动作幅度放大、灯色亮起，其余只在檐下小立。
 * 不做真人模拟：水袖用两片锥面摆出来，乐器只取最认得出的轮廓。
 */
function performers(scene, LAYOUT) {
  const list = [];
  const kinds = {};
  for (const item of SHOW) kinds[item.place] = item;

  for (const item of SHOW) {
    const at = LAYOUT.stage[item.place];
    if (!at) continue;
    const g = new THREE.Group();
    g.position.copy(at);
    const sleeves = [];
    const bodies = [];
    const face = faceToward(item.place, at, LAYOUT);

    const cast = {
      tianguan: 2, fangshu: 2, shengsheng: 2, qiufeng: 1, yulan: 1,
      chayun: 1, guanshan: 2, buyou: 1, zaozhong: 2,
    }[item.id] || 1;

    for (let i = 0; i < cast; i++) {
      const robed = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.36, 1.18, 9),
        i === 0 ? M.costume : M.costumePale,
      );
      robed.position.set((i - (cast - 1) / 2) * 0.78, 0.59, i * 0.18);
      robed.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), M.sleeveSilk);
      head.position.set(robed.position.x, 1.34, robed.position.z);
      bodies.push(robed, head);
      // 水袖：从肩部斜挑出去的两片渐窄面
      if (item.kind.includes('昆')) {
        for (const s of [-1, 1]) {
          const sl = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.05, 5, 1, true), M.sleeveSilk);
          sl.rotation.z = s * 1.15;
          sl.position.set(robed.position.x + s * 0.3, 1.02, robed.position.z);
          sleeves.push({ mesh: sl, s, base: robed.position.clone(), seed: rand() * 6.28 });
          bodies.push(sl);
        }
      }
      // 乐器轮廓
      if (item.kind.includes('评弹')) {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), M.woodDark);
        body.scale.set(1, 1.25, 0.5);
        body.position.set(robed.position.x, 0.86, robed.position.z + 0.28);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.85, 6), M.woodDark);
        neck.position.set(robed.position.x, 1.3, robed.position.z + 0.3);
        neck.rotation.x = 0.34;
        bodies.push(body, neck);
      }
      if (item.kind.includes('琴')) {
        const table = mesh([box(1.5, 0.1, 0.5, robed.position.x, 0.72, robed.position.z + 0.42),
          box(0.1, 0.7, 0.1, robed.position.x - 0.6, 0.36, robed.position.z + 0.42),
          box(0.1, 0.7, 0.1, robed.position.x + 0.6, 0.36, robed.position.z + 0.42)], M.woodDark);
        const qin = mesh([box(1.15, 0.07, 0.22, robed.position.x, 0.8, robed.position.z + 0.42)], M.lacquer);
        bodies.push(table, qin);
      }
      if (item.kind.includes('箫') || item.kind.includes('昆曲')) {
        const flute = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.62, 6), M.lacquer);
        flute.rotation.z = Math.PI / 2;
        flute.position.set(robed.position.x + 0.16, 1.24, robed.position.z + 0.12);
        bodies.push(flute);
      }
      if (item.id === 'chayun') {
        const table = mesh([box(0.8, 0.1, 0.55, robed.position.x + 0.6, 0.68, robed.position.z + 0.1),
          box(0.08, 0.66, 0.08, robed.position.x + 0.6, 0.34, robed.position.z + 0.1)], M.woodDark);
        const pot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), M.lacquer);
        pot.position.set(robed.position.x + 0.6, 0.82, robed.position.z + 0.1);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.06, 8), M.stele);
        cup.position.set(robed.position.x + 0.9, 0.76, robed.position.z + 0.2);
        bodies.push(table, pot, cup);
      }
    }
    g.add(...bodies);
    // 灯下的一点暖光，戏起来时提亮
    // 灯在人身后：把墙面照亮，人就成了剪影，这是园夜看戏的实际观感
    const lamp = new THREE.PointLight(item.lamp, 0, 10, 2);
    lamp.position.set(0, 2.1, -1.1);
    g.add(lamp);
    const bead = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow('255,214,160', 0.1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    bead.position.set(0, 2.35, 0.5);
    bead.scale.setScalar(1.4);
    g.add(bead);

    g.rotation.y = face;
    scene.add(g);
    list.push({ item, group: g, sleeves, bodies, lamp, bead, at: at.clone(), active: 0 });
  }
  return {
    list,
    get(placeId) { return list.find((p) => p.item.place === placeId); },
    update(t, dt, activeId, k) {
      for (const p of list) {
        const on = p.item.place === activeId ? 1 : 0;
        p.active += (on - p.active) * Math.min(1, dt * 2.4);
        const a = p.active;
        p.lamp.intensity = 2 + 11 * a * (0.82 + 0.18 * Math.sin(t * 2.6 + p.at.x));
        p.bead.scale.setScalar(0.3 + a * 0.22);
        p.bead.material.color.setStyle(a > 0.4 ? p.item.lamp : '#ffd79b');
        // 身段：未开戏只微微晃，开戏时袖子甩起来
        for (const s of p.sleeves) {
          const w = 0.22 + a * (1.05 + 0.5 * Math.sin(t * 0.7 + s.seed));
          s.mesh.rotation.z = s.s * (1.15 + Math.sin(t * (1.1 + a * 1.9) + s.seed) * w);
          s.mesh.rotation.x = Math.sin(t * (0.8 + a * 1.4) + s.seed * 1.3) * w * 0.5;
        }
        p.group.position.y = p.at.y + (a > 0.4 ? Math.abs(Math.sin(t * 1.7)) * 0.04 : 0);
        p.group.rotation.y += a * dt * 0.35 * Math.sin(t * 0.5);
        void k;
      }
    },
  };
}

/** 演员大朝向来的路（听客所在的一侧） */
function faceToward(place, at, LAYOUT) {
  const aud = LAYOUT.audience[place];
  if (!aud) return 0;
  const dx = aud.x - at.x, dz = aud.z - at.z;
  return Math.atan2(dx, dz);
}

/* ------------------------------------------------------------------ 听客 */
function audience(scene, LAYOUT) {
  const CAP = 240;
  const geo = figureGeo(1.0);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4d5568'), roughness: 0.92 });
  const inst = new THREE.InstancedMesh(geo, mat, CAP);
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
  inst.castShadow = false;
  inst.frustumCulled = false;
  scene.add(inst);

  const col = new THREE.Color();
  const state = [];
  for (let i = 0; i < CAP; i++) {
    const hue = rr(0, 1);
    col.setHSL(0.08 + hue * 0.12, 0.16, 0.2 + rand() * 0.22);
    inst.setColorAt(i, col);
    state.push({
      p: new THREE.Vector3(0, D, 0), target: new THREE.Vector3(0, D, 0),
      scale: rr(0.9, 1.14), phase: rand() * 6.28, seed: rand(), home: 0,
    });
  }
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

  // 听客不围镜头：谁要站到机位 3.6 米内，就沿视线方向推出去，人墙留在中景
  const camAt = {};
  for (const s of STATIONS) camAt[s.id] = { x: s.pos[0], z: s.pos[2] };
  function clearOfLens(x, z, placeId) {
    const c = camAt[placeId];
    if (!c) return [x, z];
    const dx = x - c.x, dz = z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > 3.6) return [x, z];
    const k = 3.6 / Math.max(0.25, d);
    return [c.x + dx * k, c.z + dz * k];
  }
  // 池面不站人：任何落点只要压到水上，就沿径向推到岸外
  const shore = 1.18;
  const stationEyes = STATIONS.map((s) => ({ x: s.pos[0], z: s.pos[2] }));
  function clearFromStations(x, z) {
    for (const c of stationEyes) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.4 && d > 0.01) { const k = 3.4 / d; x = c.x + dx * k; z = c.z + dz * k; }
    }
    return [x, z];
  }
  function onLand(x, z) {
    return Math.hypot(x / POND.rx, z / POND.rz) > shore;
  }
  function ashore(x, z) {
    const r = Math.hypot(x / POND.rx, z / POND.rz);
    if (r <= 0.02 || r > shore) return [x, z];
    const k = shore / r;
    return [x * k, z * k];
  }
  const stroll = [];
  for (const line of LAYOUT.galleries || []) {
    for (let s = 0; s < line.length - 1; s++) {
      const [x0, z0] = line[s], [x1, z1] = line[s + 1];
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.2));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const w = ashore(x0 + (x1 - x0) * t + rr(-1.3, 1.3), z0 + (z1 - z0) * t + rr(-1.3, 1.3));
        const c = clearFromStations(w[0], w[1]);
        if (onLand(c[0], c[1])) stroll.push(c);
      }
    }
  }
  for (const key of Object.keys(LAYOUT.audience)) {
    const a = LAYOUT.audience[key];
    for (let i = 0; i < 6; i++) stroll.push([a.x + rr(-2.4, 2.4), a.z + rr(-2.0, 2.0)]);
  }

  const dummy = new THREE.Object3D();
  let current = null;

  function retarget(placeId) {
    const aud = placeId ? LAYOUT.audience[placeId] : null;
    for (let i = 0; i < CAP; i++) {
      const s = state[i];
      if (aud && s.seed < 0.62) {
        const a = s.seed / 0.62 * Math.PI * 2 + s.phase * 0.2;
        const r = 2.1 + Math.sqrt(s.seed / 0.62) * rr(1.5, 3.2);
        const q = ashore(...clearOfLens(aud.x + Math.cos(a) * r * 1.2, aud.z + Math.sin(a) * r * 0.5, placeId));
        s.target.set(q[0], D, q[1]);
      } else {
        const w = stroll[Math.floor(s.seed * stroll.length) % stroll.length];
        s.target.set(w[0], D, w[1]);
      }
      // 换点位时直接落位：留着走过去，一半人会从池心蹚过去
      s.p.copy(s.target);
    }
    current = placeId;
  }
  retarget(null);

  return {
    inst, count: CAP,
    get place() { return current; },
    retarget,
    update(t, dt, target, camPos) {
      const n = Math.max(0, Math.min(CAP, Math.round(target)));
      const rate = Math.min(1, dt * 1.8);
      for (let i = 0; i < CAP; i++) {
        const s = state[i];
        const live = i < n;
        if (live) {
          s.p.lerp(s.target, rate);
          const bob = Math.sin(t * 2.2 + s.phase) * 0.03;
          dummy.position.set(s.p.x, s.p.y + bob + 0.62 * s.scale, s.p.z);
          dummy.scale.setScalar(s.scale);
          dummy.rotation.set(0, Math.sin(t * 0.4 + s.phase) * 0.4 + Math.atan2(camPos.x - s.p.x, camPos.z - s.p.z), 0);
        } else {
          dummy.scale.setScalar(0);
          dummy.position.set(0, -50, 0);
        }
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ------------------------------------------------------------------ 投壶 */
function touhu(scene, LAYOUT) {
  const at = LAYOUT.hu || new THREE.Vector3(-6.4, D, 12.4);
  const g = new THREE.Group();
  g.position.copy(at);
  // 壶：侈口、长颈、鼓腹，两侧各一耳
  const profile = [
    [0.16, 0], [0.22, 0.04], [0.2, 0.12], [0.3, 0.24], [0.36, 0.4],
    [0.34, 0.56], [0.22, 0.68], [0.18, 0.78], [0.24, 0.86], [0.26, 0.92],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const hu = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), M.bronze);
  hu.castShadow = true;
  g.add(hu);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.024, 6, 12), M.bronze);
    ear.position.set(s * 0.36, 0.52, 0);
    ear.rotation.y = Math.PI / 2;
    g.add(ear);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.1, 12), M.stoneDressed);
  base.position.y = 0.05;
  g.add(base);
  // 矢箙与余箭
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.42, 10), M.woodDark);
  basket.position.set(0.7, 0.21, 0.2);
  g.add(basket);
  const arrows = [];
  for (let i = 0; i < 5; i++) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 5), M.lacquer);
    a.position.set(0.7 + rr(-0.08, 0.08), 0.52, 0.2 + rr(-0.08, 0.08));
    a.rotation.z = rr(-0.2, 0.2);
    arrows.push(a);
  }
  g.add(...arrows);
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,226,170', 0.1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  spark.position.set(0, 1.0, 0);
  spark.scale.setScalar(0.01);
  g.add(spark);
  scene.add(g);

  const flying = [];
  const thrower = new THREE.Vector3(at.x + 2.4, D, at.z + 1.6);
  return {
    group: g, at: at.clone(), thrower,
    throwOne(t) {
      if (flying.length > 6) return;
      const miss = Math.random() < 0.28;
      const from = thrower.clone().setY(D + 1.35);
      const to = at.clone().setY(0.9 + (miss ? rr(-0.2, 0.4) : 0));
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 5), M.lacquer);
      a.position.copy(from);
      scene.add(a);
      flying.push({ mesh: a, from, to, t0: t, dur: 0.9, miss, spin: rr(3, 6) });
      return !miss;
    },
    update(t, dt) {
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        const k = (t - f.t0) / f.dur;
        if (k >= 1) {
          f.mesh.position.copy(f.to);
          f.mesh.rotation.z = Math.PI / 2.4;
          spark.position.set(f.to.x - at.x, f.to.y + 0.2, f.to.z - at.z);
          spark.scale.setScalar(0.9);
          if (k > 2.4) { scene.remove(f.mesh); flying.splice(i, 1); }
          continue;
        }
        f.mesh.position.lerpVectors(f.from, f.to, k);
        f.mesh.position.y += Math.sin(k * Math.PI) * 1.15;
        f.mesh.rotation.z = -0.9 + k * 2.2 * f.spin * 0.1;
      }
      if (spark.scale.x > 0.02) spark.scale.setScalar(Math.max(0.02, spark.scale.x - dt * 1.6));
    },
  };
}

/* ------------------------------------------------------------------ 投影「投词」 */
/** 现代设备：把唱词投在廊柱与白墙上。可以关掉，关了就露出没投词的素墙 */
function titleProjection(scene, LAYOUT) {
  const planes = [];
  const spots = [
    { place: 'yanying', at: LAYOUT.stage.yanying, size: [6.2, 2.6], y: 1.62, dx: 0 },
    { place: 'jixuzhai', at: LAYOUT.stage.jixuzhai, size: [4.4, 2.3], y: 2.2, dx: -3.4 },
    { place: 'dianshun', at: LAYOUT.stage.dianshun, size: [4.0, 2.1], y: 2.1, dx: 3.0 },
    { place: 'juanshuitang', at: LAYOUT.stage.juanshuitang, size: [5.0, 2.5], y: 2.3, dx: -3.6 },
    { place: 'xiaoshan', at: LAYOUT.stage.xiaoshan, size: [4.6, 2.3], y: 2.2, dx: 3.2 },
    { place: 'tiyunshi', at: LAYOUT.stage.tiyunshi, size: [4.0, 2.1], y: 2.0, dx: -2.8 },
    { place: 'xiexiulou', at: LAYOUT.stage.xiexiulou, size: [4.4, 2.2], y: 2.4, dx: 3.4 },
    { place: 'zhuwai', at: LAYOUT.stage.zhuwai, size: [3.8, 2.0], y: 1.9, dx: -2.6 },
    { place: 'kaisong', at: LAYOUT.stage.kaisong, size: [5.4, 2.4], y: 2.2, dx: 4.2 },
  ];
  for (const s of spots) {
    if (!s.at) continue;
    const tex = T.titleCard({ lines: [], head: '' });
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false, opacity: 0,
    });
    mat.toneMapped = false;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0], s.size[1]), mat);
    const face = faceToward(s.place, s.at, LAYOUT);
    m.position.set(s.at.x + Math.sin(face) * 1.4 + Math.cos(face) * (s.dx || 0), s.at.y + s.y,
      s.at.z + Math.cos(face) * 1.4 + Math.sin(face) * (s.dx || 0));
    m.rotation.y = face;
    m.renderOrder = 6;
    scene.add(m);
    planes.push({ place: s.place, mesh: m, mat, tex: null });
  }
  return {
    planes,
    setEnabled(v) { for (const p of planes) p.mesh.visible = v; },
    show(place, lines, head) {
      for (const p of planes) {
        const hit = p.place === place;
        p.want = hit ? 0.62 : 0;
        if (!hit) continue;
        const tex = T.titleCard({ lines, head });
        if (tex !== p.tex) { p.mat.map = tex; p.tex = tex; p.mat.needsUpdate = true; }
      }
    },
    update(dt) {
      for (const p of planes) {
        const want = p.want || 0;
        p.mat.opacity += (want - p.mat.opacity) * Math.min(1, dt * 3.2);
      }
    },
  };
}

/* ------------------------------------------------------------------ 灯串（檐下连线） */
function lampStrings(scene, anchors) {
  const from = anchors.eaveLamps[0];
  const uni = {
    uTime: { value: 0 }, uOn: { value: 1 }, uMap: { value: T.softGlow('255,206,140', 0.06) },
  };
  const pts = [];
  const lines = anchors.galleries || [];
  for (const line of lines) {
    for (let s = 0; s < line.length - 1; s++) {
      const a = new THREE.Vector3(line[s][0], D + 2.2, line[s][1]);
      const b = new THREE.Vector3(line[s + 1][0], D + 2.2, line[s + 1][1]);
      stringPath(a, b, 0.28, 16).forEach((p) => pts.push(p.x, p.y, p.z));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      varying float vGlow;
      void main(){
        vGlow = 0.6 + 0.4*sin(position.x*2.0 + position.z*1.6);
        gl_PointSize = 7.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uOn; varying float vGlow;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vec3(1.0,0.80,0.5)*1.5*vGlow*uOn, t.a*uOn*0.7);
      }`,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  scene.add(p);
  void from;
  return { points: p, uni };
}

/* ------------------------------------------------------------------ 组装 */
export function buildProps(scene, columns, anchors, LAYOUT) {
  return {
    field: lanterns(scene, columns, anchors),
    lotus: lotusLamps(scene, columns),
    strings: lampStrings(scene, anchors),
    stage: performers(scene, LAYOUT),
    crowd: audience(scene, LAYOUT),
    hu: touhu(scene, LAYOUT),
    titles: titleProjection(scene, LAYOUT),
  };
}
