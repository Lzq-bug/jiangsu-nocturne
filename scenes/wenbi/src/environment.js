/**
 * 环境：夜天、月、挖了两侧池子的园内地坪、塔北的笔架山、城南屋脊剪影
 * 与远处那位 153.79 米的新宝塔。常州是平原水乡，没有山影，只有土堆出来
 * 的笔架山与一线城廓——山形与楼群一律写意。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lit, rand, rr, registerOccluder } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import * as T from './textures.js';
import { PONDS, GROUND_Y, HILL_Y, PARK, STATIONS } from './data.js';

/** 月在北偏西 22°、高度约 24°：南门北望时塔月各占一边，砚池东岸回望时落在塔右肩（构图所需，非史实） */
export const MOON_DIR = new THREE.Vector3(-0.34, 0.40, -0.85).normalize();

/** 地坪要绕开两方池子：按池壁外沿把矩形切成格，空洞处留给水面 */
const CUT = 2.0;
function groundRects() {
  const xs = new Set([-200, 200]);
  const zs = new Set([-210, 250]);
  for (const p of PONDS) {
    xs.add(p.x0 - CUT); xs.add(p.x1 + CUT);
    zs.add(p.z0 - CUT); zs.add(p.z1 + CUT);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Z = [...zs].sort((a, b) => a - b);
  const rects = [];
  for (let i = 0; i < X.length - 1; i++) {
    for (let j = 0; j < Z.length - 1; j++) {
      const x0 = X[i], x1 = X[i + 1], z0 = Z[j], z1 = Z[j + 1];
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (PONDS.some((p) => cx > p.x0 - CUT && cx < p.x1 + CUT && cz > p.z0 - CUT && cz < p.z1 + CUT)) continue;
      rects.push([x0, x1, z0, z1]);
    }
  }
  return rects;
}

/** 矩形地坪：UV 按世界尺度铺，免得每格一张独立贴图 */
function rectGeo(x0, x1, z0, z1, uvScale = 8, y = GROUND_Y) {
  const w = x1 - x0, d = z1 - z0;
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / uvScale, uv.getY(i) * d / uvScale);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
}

function skyDome() {
  const uni = { uTime: { value: 0 }, uMoon: { value: MOON_DIR.clone() } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform float uTime; uniform vec3 uMoon;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0050,0.0078,0.0210);
        vec3 mid    = vec3(0.0125,0.0170,0.0400);
        vec3 horizon= vec3(0.0320,0.0265,0.0330);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        // 城南那片城廓的灯火在低天上摊开一层
        float haze = pow(clamp(1.0-abs(d.y)*1.9,0.0,1.0), 2.4) * sky;
        float south = smoothstep(-0.75, 0.75, d.z);
        col += vec3(0.040,0.019,0.007) * haze * (0.35 + 1.05*south);
        float md = max(0.0, dot(d, uMoon));
        col += vec3(0.052,0.064,0.095) * pow(md, 24.0) * sky;
        float c = n(d.xz*7.0 + vec2(uTime*0.006, 0.0)) * 0.6 + n(d.xz*17.0 - vec2(uTime*0.01,0.0))*0.4;
        col = mix(col, col + vec3(0.0045,0.006,0.011), smoothstep(0.55,0.92,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0035,0.0045,0.009), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

function stars() {
  const N = 1400;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.05 + Math.pow(rand(), 0.7) * 0.92;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 540, y * 540, Math.sin(a) * r * 540], i * 3);
    size[i] = 0.7 + Math.pow(rand(), 3) * 3.4;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uTex: { value: TX.softGlow('210,225,255', 0.05) } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.6+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.85,0.9,1.0), t.a*vA*0.9); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d6').multiplyScalar(1.7), fog: false });
  m.toneMapped = false;
  const disc = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), m);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.softGlow('255,240,205', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(62, 62, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(450);
  grp.position.y = Math.max(115, grp.position.y);
  return { mesh: grp, halo };
}

function horizonHaze() {
  const uni = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, uniforms: uni,
    vertexShader: `varying float vY; varying float vA;
      void main(){ vY = position.y; vA = atan(position.z, position.x);
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying float vY; varying float vA;
      void main(){
        float band = smoothstep(-2.0, 16.0, vY) * (1.0 - smoothstep(14.0, 44.0, vY));
        float town = 0.5 + 0.5*sin(vA*2.3 + 1.1);
        float south = smoothstep(-0.6, 0.9, sin(vA));
        vec3 c = mix(vec3(0.055,0.028,0.012), vec3(0.030,0.036,0.062), town);
        gl_FragColor = vec4(c, band * (0.14 + 0.22*town + 0.10*south));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(440, 440, 48, 40, 1, true), mat);
  mesh.position.y = 4;
  mesh.frustumCulled = false;
  return mesh;
}

/** 城南屋脊与楼群：低处老宅、远处今楼，只作剪影 */
function farCity() {
  const grp = new THREE.Group();
  const roofGeo = new THREE.ConeGeometry(1, 0.62, 4, 1);
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const n = 380;
  // 纯黑剪影会吞掉整张图，月光得在上面留下一点体积
  const silhouette = lit('#1b2130', { rough: 0.96, emissive: '#080a11', ei: 0.4 });
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const d = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    // 铺开在园子南、东、西三面，北面留给笔架山
    const a = rr(-0.25, Math.PI + 0.25);
    const band = 195 + Math.pow(rand(), 0.6) * 230;
    const x = Math.cos(a) * band, z = Math.sin(a) * band + 40;
    const tall = rand() > 0.82;
    const h = tall ? 22 + rand() * 34 : 4 + rand() * 9;
    const w = tall ? 9 + rand() * 7 : 6 + rand() * 8;
    d.position.set(x, h * 0.5, z);
    d.rotation.set(0, rand() * Math.PI, 0);
    d.scale.set(w, h, w * 0.74);
    d.updateMatrix();
    bodies.setMatrixAt(i, d.matrix);
    if (!tall) {
      d.position.set(x, h + 1.2, z);
      d.scale.set(w * 0.78, 2.8 + rand() * 1.8, w * 0.6);
      d.updateMatrix();
      roofs.setMatrixAt(i, d.matrix);
    } else {
      d.scale.setScalar(0);
      d.updateMatrix();
      roofs.setMatrixAt(i, d.matrix);
    }
    if (rand() > 0.55) win.push(x + rr(-w * 0.3, w * 0.3), h * (tall ? 0.75 : 0.6), z + rr(-2, 2));
  }
  roofs.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: TX.softGlow('255,200,140', 0.2), size: 3.2, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));
  return grp;
}

/** 天宁宝塔：园南的新宝塔，13 层、153.79 m，只给剪影与几点灯 */
function baota(M) {
  const g = new THREE.Group();
  const { x, z, height, tiers } = PARK.baota;
  g.position.set(x, 0, z);
  const base = height * 0.055;
  const H = height - base;
  let y = base;
  const parts = [];
  const plinth = new THREE.BoxGeometry(base * 3.4, base, base * 3.4);
  plinth.translate(0, base / 2, 0);
  parts.push(plinth);
  for (let i = 0; i < tiers; i++) {
    const f0 = i / tiers, f1 = (i + 1) / tiers;
    const rB = base * (1.5 - f0 * 0.95);
    const rT = base * (1.5 - f1 * 0.95);
    const h = (H / tiers) * 0.62;
    const body = new THREE.CylinderGeometry(rT, rB, h, 8, 1, false);
    body.translate(0, base + (H / tiers) * i + h / 2, 0);
    parts.push(body);
    const eave = new THREE.CylinderGeometry(rT * 0.9, rB * 1.34, (H / tiers) * 0.22, 8, 1, true);
    eave.translate(0, base + (H / tiers) * i + h + (H / tiers) * 0.1, 0);
    parts.push(eave);
  }
  const mast = new THREE.CylinderGeometry(0.2, 0.4, H * 0.16, 6);
  mast.translate(0, base + H + H * 0.08, 0);
  parts.push(mast);
  const mesh = new THREE.Mesh(mergeGeometries(parts), M.silhouette);
  g.add(mesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TX.softGlow('255,206,140', 0.14), color: 0xffffff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(46, 46, 1);
  halo.position.set(0, base + H + H * 0.14, 0);
  g.add(halo);
  return g;
}

/* ------------------------------------------------------------------ 地坪与路径 */
function ground(M) {
  const grp = new THREE.Group();
  grp.name = 'ground';
  const lawn = mergeGeometries(groundRects().map(([a, b, c, d]) => rectGeo(a, b, c, d, 9)));
  const field = new THREE.Mesh(lawn, M.lawn);
  field.receiveShadow = true;
  grp.add(field);

  // 环塔埕地、三条步道：石板面，比草坪高两公分
  const walks = [];
  walks.push(new THREE.CircleGeometry(13.5, 8).rotateX(-Math.PI / 2).translate(0, GROUND_Y + 0.02, 0));
  walks.push(rectGeo(-5, 5, 10, 100, 6, GROUND_Y + 0.02));      // 南门→塔
  walks.push(rectGeo(12, 62, 44, 52, 6, GROUND_Y + 0.02));      // 绕砚池南岸
  walks.push(rectGeo(-64, -56, -24, 42, 6, GROUND_Y + 0.02));   // 塔影池西岸
  walks.push(rectGeo(-13, 13, -22, -10, 6, GROUND_Y + 0.02));   // 塔北→笔架山
  walks.push(rectGeo(58, 66, -22, 42, 6, GROUND_Y + 0.02));     // 砚池东岸
  walks.push(rectGeo(-13, 13, 10, 22, 6, GROUND_Y + 0.02));     // 环塔埕地 outward
  const paving = new THREE.Mesh(mergeGeometries(walks), M.paving);
  paving.receiveShadow = true;
  grp.add(paving);
  return { grp, stone: M };
}

/* ------------------------------------------------------------------ 笔架山 */
function hills(M) {
  const grp = new THREE.Group();
  grp.name = 'hills';
  for (const p of PARK.hill.peaks) {
    const geo = new THREE.SphereGeometry(1, 20, 12);
    geo.scale(p.r, p.h, p.r);
    geo.translate(p.x, GROUND_Y, p.z);
    const m = new THREE.Mesh(geo, M.turf);
    m.receiveShadow = true;
    grp.add(m);
    if (p.deck) {
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.2, 0.3, 8), M.paving);
      deck.position.set(p.x, GROUND_Y + p.h - 0.15, p.z);
      deck.receiveShadow = true;
      grp.add(deck);
      // 栏板压得很低、颜色压暗：机位就站在台口，亮白栏杆会横在画面正中
      const rail = new THREE.Mesh(new THREE.TorusGeometry(7.0, 0.07, 5, 8), M.turf);
      rail.geometry.rotateX(Math.PI / 2);
      rail.position.set(p.x, GROUND_Y + p.h + 0.52, p.z);
      grp.add(rail);
      for (let k = 0; k < 8; k++) {
        const az = (k / 8) * Math.PI * 2;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.62, 5), M.turf);
        post.position.set(p.x + Math.sin(az) * 7.0, GROUND_Y + p.h + 0.21, p.z + Math.cos(az) * 7.0);
        grp.add(post);
      }
    }
  }
  return grp;
}

/* ------------------------------------------------------------------ 树 */
function willowGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.48, 4.6, 7);
  trunk.translate(0, 2.3, 0);
  parts.push(trunk);
  for (let i = 0; i < 3; i++) {
    const br = new THREE.CylinderGeometry(0.07, 0.16, 2.2, 5);
    br.translate(0, 4.9 + i * 0.15, 0);
    br.rotateZ((i - 1) * 0.7);
    br.rotateY(i * 2.1);
    parts.push(br);
  }
  // 先给一团冠，再垂丝：夜里只有几根管的柳树看着像铁丝架
  for (let i = 0; i < 5; i++) {
    const blob = new THREE.SphereGeometry(1.5 + rand() * 0.6, 8, 6);
    blob.scale(1.15, 0.82, 1.15);
    blob.translate(Math.cos(i * 1.7) * 0.8, 4.5 + rand() * 0.6, Math.sin(i * 1.7) * 0.8);
    parts.push(blob);
  }
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, r = 1.5 + rand() * 2.2;
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * r * 0.32, 4.6 + rand() * 1.0, Math.sin(a) * r * 0.32),
      new THREE.Vector3(Math.cos(a) * r * 0.8, 4.0 + rand() * 0.8, Math.sin(a) * r * 0.8),
      new THREE.Vector3(Math.cos(a) * r, 2.4 + rand() * 1.2, Math.sin(a) * r),
      new THREE.Vector3(Math.cos(a) * r * 1.02, 0.9 + rand() * 0.9, Math.sin(a) * r * 1.02),
    ]);
    parts.push(new THREE.TubeGeometry(c, 6, 0.02 + rand() * 0.018, 3, false));
  }
  return mergeGeometries(parts);
}

function plumGeo() {
  // 红梅公园以梅得名：虬枝三两出，不必成林
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.13, 0.3, 2.6, 6);
  trunk.translate(0, 1.3, 0);
  trunk.rotateZ(rr(-0.16, 0.16));
  parts.push(trunk);
  for (let i = 0; i < 5; i++) {
    const br = new THREE.CylinderGeometry(0.035, 0.08, 1.5 + rand(), 5);
    br.translate(0, 0.9 + rand() * 0.3, 0);
    br.rotateZ(rr(-1.1, 1.1));
    br.rotateY(rand() * 6.28);
    parts.push(br);
  }
  for (let i = 0; i < 3; i++) {
    const b = new THREE.SphereGeometry(0.75 + rand() * 0.35, 7, 5);
    b.scale(1.2, 0.66, 1.2);
    b.translate(rr(-1.1, 1.1), 2.2 + rand() * 0.6, rr(-1.1, 1.1));
    parts.push(b);
  }
  return mergeGeometries(parts);
}

/** 视线与机位两道保险：树不压在机位上，也不站在"机位—塔"的连线上 */
function blocked(x, z) {
  for (const s of STATIONS) {
    if (Math.hypot(s.pos[0] - x, s.pos[2] - z) < 9) return true;
    const [lx, lz] = s.look;
    const dx = lx - s.pos[0], dz = lz - s.pos[2];
    const len2 = dx * dx + dz * dz;
    const tt = THREE.MathUtils.clamp(((x - s.pos[0]) * dx + (z - s.pos[2]) * dz) / len2, 0, 1);
    const px = s.pos[0] + dx * tt, pz = s.pos[2] + dz * tt;
    if (Math.hypot(x - px, z - pz) < 3.4 && tt < 0.98) return true;
  }
  return false;
}

function inPond(x, z) {
  return PONDS.some((p) => x > p.x0 - 3 && x < p.x1 + 3 && z > p.z0 - 3 && z < p.z1 + 3);
}

function trees(M) {
  const grp = new THREE.Group();
  const wGeo = willowGeo();
  const pGeo = plumGeo();
  const put = (geo, mat, x, y, z, sc, occl = 4.6) => {
    if (blocked(x, z) || inPond(x, z)) return null;
    const t = new THREE.Mesh(geo, mat);
    t.scale.set(sc, sc * rr(0.92, 1.12), sc);
    t.position.set(x, y, z);
    t.rotation.y = rand() * 6.28;
    t.castShadow = true;
    grp.add(registerOccluder(t, occl, new THREE.Vector3(x, 0, z)));
    return t;
  };
  // 池岸垂柳
  for (let i = 0; i < 14; i++) {
    const p = PONDS[i % 2];
    const edge = [[p.x0 - 4, rr(p.z0, p.z1)], [p.x1 + 4, rr(p.z0, p.z1)],
      [rr(p.x0, p.x1), p.z0 - 4], [rr(p.x0, p.x1), p.z1 + 4]][i % 4];
    put(wGeo, M.leaf, edge[0], GROUND_Y, edge[1], rr(0.72, 1.05));
  }
  // 梅：塔东塔西各一小片，冬夜只余虬枝
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2, r = rr(24, 44);
    put(pGeo, M.leaf, Math.cos(a) * r, GROUND_Y, Math.sin(a) * r, rr(0.7, 1.05), 3.2);
  }
  // 山北与城南几株大的
  for (let i = 0; i < 8; i++) put(wGeo, M.leaf, rr(-90, 90), GROUND_Y, rr(-100, -88), rr(0.8, 1.1));
  return grp;
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  const moonObj = moon();

  const M = {
    lawn: lit('#5f6a4a', { map: T.lawn(), rough: 0.98, emissive: '#0a0d08', ei: 0.28 }),
    paving: lit('#7f848d', { map: T.paving(), rough: 0.96, emissive: '#0b0d11', ei: 0.22 }),
    stone: lit('#a8aeba', { map: TX.stone('#8a9098'), rough: 0.92 }),
    turf: lit('#525c40', { map: T.lawn('#4d5a3e'), rough: 0.98, emissive: '#080b07', ei: 0.24 }),
    leaf: lit('#1c2a1b', { rough: 0.97, side: THREE.DoubleSide, emissive: '#070d07', ei: 0.35 }),
    silhouette: lit('#1b2130', { rough: 0.96, emissive: '#080a11', ei: 0.4 }),
  };

  const g = ground(M);
  scene.add(sky.mesh, star.mesh, moonObj.mesh, horizonHaze(), farCity(), g.grp, hills(M), trees(M), baota(M));

  const hemi = new THREE.HemisphereLight(0x46608f, 0x0d1018, 0.72);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 0.95);
  moonLight.position.copy(MOON_DIR).multiplyScalar(190);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -110; sc.right = 110; sc.top = 120; sc.bottom = -90; sc.near = 20; sc.far = 420;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.4;
  scene.add(hemi, moonLight);

  scene.fog = new THREE.FogExp2(0x0a1024, 0.0031);

  // 塔北一盏冷补光（从南门看时给密檐留余部），城南一盏暖洗（照亮广场与路径）
  const wash = new THREE.PointLight(0xbfd4ff, 210, 74, 2);
  wash.position.set(-8, 16, -22);
  const warm = new THREE.PointLight(0xff9f5c, 230, 86, 2);
  warm.position.set(6, 6, 40);
  scene.add(wash, warm);

  return {
    ground: g.grp,
    mats: M,
    uni: { sky: sky.uni, stars: star.uni },
    setMoon(v) {
      moonLight.intensity = 0.95 * v;
      hemi.intensity = 0.72 * v;
      star.uni.uBright.value = 1 - 0.45 * Math.min(1, v);
      moonObj.halo.material.opacity = 0.3 + 0.25 * v;
      wash.intensity = 210 * (0.45 + 0.55 * v);
      warm.intensity = 230 * (0.4 + 0.6 * v);
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}

