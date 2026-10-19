/**
 * 灯与人：石灯、檐前灯笼、山门与殿前门光、窑火与烟、香炉幡幢、人影、河上灯船，
 * 以及 146 盏塔灯在空气里的一圈晕（一个 Points，按次第序号渐显）。
 *
 * 发光面一律 MeshBasicMaterial + 加色 sprite/points，真实灯只留必要几盏：
 * SwiftShader 下上百盏 PointLight 会把一张静帧拖到十分钟以外。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, figureGeo, rand, rr } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { GROUND_Y, RIVER, POOL, WATER_Y, ARCH, STATIONS } from './data.js';

const LAMP = '#ffbe72';

export function buildProps(scene, anchors, columns, towerHaloPos) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  const stone = lit('#9ba1ad', { map: TX.stone('#868d99'), rough: 0.92 });
  const wood = lit('#6b4630', { map: TX.wood('#54331f', '#2c160f'), rough: 0.85 });
  const haloTex = TX.softGlow('255,190,120', 0.16);

  const tints = [];
  const tinted = (hex, mul = 1.4) => {
    const base = new THREE.Color(hex).multiplyScalar(mul);
    const m = new THREE.MeshBasicMaterial({ color: base.clone(), toneMapped: false, fog: false });
    tints.push({ m, base });
    return m;
  };
  const lampMat = new THREE.MeshBasicMaterial({ map: TX.lanternPaper('#fff3d0', '#e8734a'), toneMapped: false });
  tints.push({ m: lampMat, base: lampMat.color.clone() });
  const stoneWinMat = tinted('#ffe6bd', 1.5);
  const fireMat = tinted('#ff8a3c', 2.0);
  const doorMat = tinted('#ffd79b', 0.7);
  const boatMat = tinted('#ffc47e', 1.6);

  const sprites = [];
  const addHalo = (x, y, z, s, o = 0.9) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, color: 0xffffff, transparent: true, opacity: o,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sp.scale.set(s, s, 1);
    sp.position.set(x, y, z);
    sp.userData.base = o;
    group.add(sp);
    sprites.push(sp);
    return sp;
  };

  /* ------------------------------------------------------------ 石灯 */
  const lampWinGeo = new THREE.PlaneGeometry(0.36, 0.36);
  for (const [x, z] of anchors.lampPosts) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(mergeGeometries([
      new THREE.CylinderGeometry(0.36, 0.42, 0.24, 8).translate(0, 0.12, 0),
      new THREE.CylinderGeometry(0.14, 0.16, 1.1, 8).translate(0, 0.78, 0),
      new THREE.CylinderGeometry(0.44, 0.36, 0.15, 8).translate(0, 1.4, 0),
      new THREE.BoxGeometry(0.52, 0.52, 0.52).translate(0, 1.74, 0),
      new THREE.ConeGeometry(0.56, 0.34, 6).translate(0, 2.14, 0),
      new THREE.SphereGeometry(0.1, 6, 5).translate(0, 2.34, 0),
    ]), stone);
    body.castShadow = true;
    g.add(body);
    for (const s of [1, -1]) {
      const win = new THREE.Mesh(lampWinGeo, stoneWinMat);
      win.position.set(0, 1.74, s * 0.27);
      win.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(win);
    }
    g.position.set(x, GROUND_Y, z);
    g.rotation.y = rand() * 3;
    group.add(g);
    addHalo(x, GROUND_Y + 1.74, z, 1.15, 0.42);
    // 只有落在香水河水面旁的石灯才补一根光柱
    if (Math.abs(z - RIVER.at) < 12) columns.add(new THREE.Vector3(x, 0, RIVER.at), LAMP, 0.9, 6.5, 0.7);
  }

  /* ------------------------------------------------------------ 檐前灯笼 */
  const lanternGeo = new THREE.SphereGeometry(0.29, 10, 8);
  lanternGeo.scale(1, 1.3, 1);
  const capsGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.11, 0.15, 0.1, 8).translate(0, 0.4, 0),
    new THREE.CylinderGeometry(0.15, 0.11, 0.1, 8).translate(0, -0.4, 0),
  ]);
  for (const [x, y, z] of anchors.shopLamps) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.08), wood);
    arm.position.set(x, y + 0.3, z - 0.34);
    arm.rotation.y = Math.PI / 2;
    group.add(arm);
    const body = new THREE.Mesh(lanternGeo, lampMat);
    body.position.set(x, y - 0.28, z);
    const caps = new THREE.Mesh(capsGeo, wood);
    caps.position.copy(body.position);
    group.add(body, caps);
    addHalo(x, y - 0.28, z, 1.4, 0.6);
    if (z > RIVER.at) columns.add(new THREE.Vector3(x, 0, RIVER.at), LAMP, 1.0, 7.5, 0.62);
  }

  /* ------------------------------------------------------------ 山门与殿前的门光 */
  for (const [x, y, z] of anchors.doorGlows) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), doorMat);
    m.position.set(x, y, z);
    group.add(m);
    addHalo(x, y, z + 0.2, 1.9, 0.42);
  }

  /* ------------------------------------------------------------ 窑火与烟 */
  const smoke = [];
  for (const [x, y, z] of anchors.kilnMouths) {
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.8), fireMat);
    mouth.position.set(x, y, z);
    group.add(mouth);
    addHalo(x, y, z + 0.2, 3.6, 0.7);
    const em = embersGeo(x, y - 0.3, z + 0.4);
    group.add(new THREE.Points(em, new THREE.PointsMaterial({
      map: TX.softGlow('255,150,70', 0.2), size: 0.55, transparent: true, color: 0xffffff,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })));
    smoke.push(spawnSmoke(x - 2.0, z - 1.6));
  }
  const kilnLights = [];
  // 街市上空一盏暖光：长街这一段在月光的背光面，不给光就是一片死黑
  const streetLight = new THREE.PointLight(0xffb06a, 70, 40, 2);
  streetLight.position.set(10, GROUND_Y + 3.8, ARCH.street.z - 5);
  scene.add(streetLight);
  kilnLights.push({ l: streetLight, base: 70 });
  for (let i = 0; i < 2; i++) {
    const l = new THREE.PointLight(0xff7a34, 90, 30, 2);
    const [x, , z] = anchors.kilnMouths[i * 3] || anchors.kilnMouths[0];
    l.position.set(x, GROUND_Y + 1.4, z + 1.6);
    scene.add(l);
    kilnLights.push({ l, base: 90 });
  }

  function spawnSmoke(x, z) {
    const n = 40;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x + rr(-0.6, 0.6);
      pos[i * 3 + 1] = GROUND_Y + 4.6 + rand() * 7;
      pos[i * 3 + 2] = z + rr(-0.6, 0.6);
      seed[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, uTex: { value: TX.softGlow('150,140,130', 0.05) }, uDrift: { value: new THREE.Vector2(0.6, 0.35) } },
      vertexShader: `attribute float aSeed; uniform float uTime; uniform vec2 uDrift;
        varying float vA;
        void main(){
          vec3 p = position;
          float rise = mod(uTime*0.55 + aSeed*9.0, 9.0);
          p.y += rise;
          p.x += uDrift.x*rise*0.5 + sin(uTime*0.6+aSeed*6.28)*0.6;
          p.z += uDrift.y*rise*0.4 + cos(uTime*0.5+aSeed*6.28)*0.5;
          vA = (1.0 - rise/9.0) * 0.30;
          gl_PointSize = 6.0 + rise*3.2;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);
        }`,
      fragmentShader: `uniform sampler2D uTex; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(0.16,0.15,0.14, t.a*vA); }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    group.add(pts);
    return m;
  }

  /* ------------------------------------------------------------ 香炉与幡幢 */
  const brass = lit('#8c7a4e', { rough: 0.4, metal: 0.7, emissive: '#20180a', ei: 0.5 });
  for (const [x, z] of [[0, ARCH.dadian.z - ARCH.dadian.d / 2 - 4.5], [0, 20.5]]) {
    const ding = new THREE.Mesh(mergeGeometries([
      new THREE.CylinderGeometry(1.0, 0.8, 0.7, 12).translate(0, 0.95, 0),
      new THREE.CylinderGeometry(0.16, 0.18, 0.6, 6).translate(-0.7, 1.55, 0),
      new THREE.CylinderGeometry(0.16, 0.18, 0.6, 6).translate(0.7, 1.55, 0),
      new THREE.CylinderGeometry(0.2, 0.24, 0.4, 6).translate(-0.6, 0.2, 0.5),
      new THREE.CylinderGeometry(0.2, 0.24, 0.4, 6).translate(0.6, 0.2, 0.5),
      new THREE.CylinderGeometry(0.2, 0.24, 0.4, 6).translate(0, 0.2, -0.6),
    ]), brass);
    ding.position.set(x, GROUND_Y, z);
    ding.castShadow = true;
    group.add(ding);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), fireMat);
    glow.geometry.rotateX(-Math.PI / 2);
    glow.position.set(x, GROUND_Y + 1.32, z);
    group.add(glow);
    addHalo(x, GROUND_Y + 1.5, z, 3.0, 0.55);
  }
  const silk = lit('#b8412f', { rough: 0.7, side: THREE.DoubleSide, emissive: '#2a0d08', ei: 0.6 });
  for (const s of [-1, 1]) {
    for (const z of [ARCH.gate - 4, 52]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 6.2, 6), wood);
      pole.position.set(s * 9.2, GROUND_Y + 3.1, z);
      group.add(pole);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.4), silk);
      banner.position.set(s * 9.2 + 0.42, GROUND_Y + 4.2, z);
      banner.rotation.y = Math.PI / 2;
      group.add(banner);
    }
  }

  /* ------------------------------------------------------------ 河上灯船（秦淮风的写意添加） */
  const boats = [];
  const hullMat = lit('#40332a', { map: TX.wood('#3a2b20', '#1c120c'), rough: 0.9 });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(mergeGeometries([
      box2(4.2, 0.5, 1.5, 0, 0.25, 0),
      box2(1.2, 0.5, 1.3, -1.4, 0.7, 0),
      box2(1.6, 0.9, 1.4, 0.6, 0.85, 0),
    ]), hullMat);
    hull.castShadow = true;
    g.add(hull);
    const cabin = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), boatMat);
    cabin.position.set(0.6, 0.95, 0.76);
    g.add(cabin);
    const lantern = new THREE.Mesh(lanternGeo, lampMat);
    lantern.position.set(-1.6, 1.45, 0);
    lantern.scale.setScalar(0.8);
    g.add(lantern);
    // 晕跟着船走，不能留在船出发的那个世界里
    const sp = addHalo(0, 1.45, 0, 2.2, 0.8);
    sp.position.set(-1.6, 1.45, 0);
    g.add(sp);
    const x = -60 + i * 28 + rr(-4, 4);
    g.position.set(x, WATER_Y + 0.1, RIVER.at + rr(-4, 4));
    g.rotation.y = rand() > 0.5 ? 0 : Math.PI;
    group.add(g);
    const col = columns.add(g.position, LAMP, 1.3, 8, 0.85);
    boats.push({ g, col, speed: rr(1.1, 2.3) * (i % 2 ? 1 : -1), phase: rand() * 6.28 });
  }

  /* ------------------------------------------------------------ 人影 */
  const spots = [];
  for (let i = 0; i < 70 && spots.length < 60; i++) {
    const where = i % 3;
    const x = where === 0 ? rr(ARCH.street.x0, ARCH.street.x1)
      : where === 1 ? rr(-20, 20) : rr(ARCH.kiln.x0 + 6, ARCH.kiln.x1 - 4);
    const z = where === 0 ? ARCH.street.z + rr(2.5, 8)
      : where === 1 ? rr(28, ARCH.gate - 6) : rr(ARCH.kiln.z0, ARCH.kiln.z1);
    if (!STATIONS.every((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) > 7)) continue;
    spots.push([x, GROUND_Y, z, rr(0, 6.28), rr(0.9, 1.25)]);
  }
  const figures = new THREE.InstancedMesh(figureGeo(1), new THREE.MeshBasicMaterial({ color: 0x0a0d16 }), spots.length);
  const d = new THREE.Object3D();
  spots.forEach((s, i) => {
    d.position.set(s[0], s[1], s[2]);
    d.rotation.set(0, s[3], 0);
    d.scale.setScalar(s[4]);
    d.updateMatrix();
    figures.setMatrixAt(i, d.matrix);
  });
  figures.instanceMatrix.needsUpdate = true;
  group.add(figures);

  /* ------------------------------------------------------------ 塔灯的晕：一个 Points，按次第渐显 */
  const haloUni = {
    uK: { value: 0 },
    uTotal: { value: towerHaloPos.length },
    uTex: { value: TX.softGlow('255,200,130', 0.12) },
    uBright: { value: 1 },
  };
  const hg = new THREE.BufferGeometry();
  const hp = new Float32Array(towerHaloPos.length * 3);
  const hs = new Float32Array(towerHaloPos.length);
  towerHaloPos.forEach((p, i) => { hp.set(p, i * 3); hs[i] = i; });
  hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  hg.setAttribute('aSeq', new THREE.BufferAttribute(hs, 1));
  const hm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: haloUni,
    vertexShader: `attribute float aSeq; uniform float uK; uniform float uBright;
      varying float vA;
      void main(){
        float on = clamp(uK - aSeq, 0.0, 1.0);
        vA = on*on*(3.0-2.0*on) * uBright;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = min(26.0, (3.6 + 3.2*vA) * (300.0 / max(1.0, -mv.z)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.82,0.55), t.a*vA*0.5); }`,
  });
  const lampHalos = new THREE.Points(hg, hm);
  lampHalos.frustumCulled = false;
  group.add(lampHalos);

  let level = 1;
  return {
    group,
    setLantern(v) {
      level = v;
      const k = 0.3 + 0.7 * Math.min(1.4, v);
      for (const { m, base } of tints) m.color.copy(base).multiplyScalar(k);
      for (const s of sprites) s.material.opacity = s.userData.base * Math.min(1.15, 0.25 + 0.85 * v);
      for (const l of kilnLights) l.l.intensity = l.base * Math.min(1.25, v);
    },
    setLampProgress(k01, bright) {
      haloUni.uK.value = k01 * towerHaloPos.length;
      haloUni.uBright.value = Math.min(1.3, bright);
    },
    setCrowd(n) { figures.count = THREE.MathUtils.clamp(Math.round(n), 0, spots.length); },
    update(t, dt) {
      for (const b of boats) {
        b.g.position.x += dt * b.speed;
        if (b.g.position.x > 150) b.g.position.x = -150;
        if (b.g.position.x < -150) b.g.position.x = 150;
        b.g.position.y = WATER_Y + 0.1 + Math.sin(t * 1.6 + b.phase) * 0.05;
        b.g.rotation.z = Math.sin(t * 1.2 + b.phase) * 0.05;
        columns.setPos(b.col, b.g.position);
      }
      const fl = 0.82 + 0.12 * Math.sin(t * 3.1) + 0.06 * Math.sin(t * 7.3);
      fireMat.color.setRGB(0.98, 0.34, 0.15).multiplyScalar(fl * (0.4 + 0.6 * level));
      for (const m of smoke) m.uniforms.uTime.value = t;
      for (const l of kilnLights) l.l.intensity = l.base * (0.85 + 0.15 * Math.sin(t * 2.7)) * Math.min(1.25, level);
    },
  };
}

function box2(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function embersGeo(x, y, z) {
  const n = 24;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x + rr(-0.6, 0.6);
    pos[i * 3 + 1] = y + 0.3 + Math.pow(rand(), 1.6) * 2.4;
    pos[i * 3 + 2] = z + rr(-0.5, 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}
