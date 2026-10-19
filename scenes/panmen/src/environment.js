import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr, registerOccluder } from './kit.js';
import { STATIONS, RIVER, SITE } from './data.js';
import * as T from './textures.js';

/** 月在西北，低垂在瑞光塔与城墙背后，给水面留一条长长的银 lane */
export const MOON_DIR = new THREE.Vector3(-0.34, 0.42, -0.84).normalize();

/** 天穹：天顶靛黑，地平一线留城市与河气的暖雾 */
function skyDome() {
  const uni = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vP; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0048,0.0072,0.0195);
        vec3 mid    = vec3(0.012,0.0165,0.038);
        vec3 horizon= vec3(0.028,0.0245,0.0325);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        // 河气聚在东南一侧的低空，来自堤岸的灯火
        float haze = pow(clamp(1.0-abs(d.y)*2.3,0.0,1.0), 2.3) * sky;
        float warm = smoothstep(-0.35, 0.85, d.x*0.55 + d.z*0.5);
        col += vec3(0.030,0.0155,0.006) * haze * (0.4 + 0.85*warm);
        // 月晕
        float md = max(0.0, dot(d, normalize(vec3(-0.34,0.42,-0.84))));
        col += vec3(0.052,0.064,0.096) * pow(md, 22.0) * 0.95 * sky;
        col += vec3(0.030,0.036,0.058) * pow(md, 5.0) * 0.35 * sky;
        float c = n(d.xz*6.4 + vec2(uTime*0.005, 0.0)) * 0.6 + n(d.xz*15.0 - vec2(uTime*0.009,0.0))*0.4;
        col = mix(col, col + vec3(0.009,0.012,0.022), smoothstep(0.44,0.86,c) * smoothstep(0.02,0.32,d.y));
        col = mix(col, vec3(0.0032,0.0042,0.0085), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

export function stars() {
  const N = 1500, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.05 + Math.pow(rand(), 0.72) * 0.95;
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
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uTex: { value: T.softGlow('210,225,255', 0.05) } },
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
  const disc = new THREE.Mesh(new THREE.SphereGeometry(10.5, 24, 16), glow('#fff4d6', 2.3));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,205', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(165, 165, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(470);
  return grp;
}

/** 远处古城的屋脊剪影：绕场一周，只在低空处压出一条暗带 */
function oldTown() {
  const grp = new THREE.Group();
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(1, 0.6, 4, 1);
  const n = 430;
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x080c15, fog: true });
  silhouette.toneMapped = false;
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const d = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const band = 175 + Math.pow(rand(), 0.6) * 205;
    const x = Math.cos(a) * band, z = Math.sin(a) * band * 0.9;
    const h = 4.5 + rand() * 11, w = 7 + rand() * 9;
    d.position.set(x, h * 0.5, z);
    d.rotation.set(0, rand() * Math.PI, 0);
    d.scale.set(w, h, w * 0.74);
    d.updateMatrix();
    bodies.setMatrixAt(i, d.matrix);
    d.position.set(x, h + 1.3, z);
    d.scale.set(w * 0.8, 3.2 + rand() * 1.8, w * 0.62);
    d.updateMatrix();
    roofs.setMatrixAt(i, d.matrix);
    if (rand() > 0.58) win.push(x + rr(-w * 0.3, w * 0.3), h * 0.62, z + rr(-2, 2));
  }
  roofs.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,198,138', 0.2), size: 3.1, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));
  return grp;
}

/** 更远处的一线屋脊与城廓，把地平线封住 */
function farRidge() {
  const pts = [];
  const idx = [];
  const col = [];
  const seg = 130;
  const cLow = new THREE.Color('#05080f'), cHigh = new THREE.Color('#0d1424');
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    const bump = Math.abs(Math.sin(a * 1.7 + 0.9)) * 19 + Math.abs(Math.sin(a * 4.6)) * 8 + Math.sin(a * 8.3) * 3.2;
    const R = 520;
    pts.push(x * R, -8, z * R * 0.92, x * R, 16 + bump, z * R * 0.92);
    col.push(...cLow.toArray(), ...cHigh.toArray());
    if (i < seg) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  m.toneMapped = false;
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

/** 垂柳：岸边一律倒垂，遮在堤与河之间 */
export function willowGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.5, 4.6, 7);
  trunk.translate(0, 2.3, 0);
  parts.push(trunk);
  for (let i = 0; i < 3; i++) {
    const br = new THREE.CylinderGeometry(0.07, 0.16, 2.2, 5);
    br.translate(0, 4.9 + i * 0.15, 0);
    br.rotateZ((i - 1) * 0.7);
    br.rotateY(i * 2.1);
    parts.push(br);
  }
  for (let i = 0; i < 24; i++) {
    const a = rand() * Math.PI * 2, r = 1.3 + rand() * 2.3;
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * r * 0.32, 4.5 + rand() * 1.1, Math.sin(a) * r * 0.32),
      new THREE.Vector3(Math.cos(a) * r * 0.8, 4.1 + rand() * 0.8, Math.sin(a) * r * 0.8),
      new THREE.Vector3(Math.cos(a) * r, 2.3 + rand() * 1.2, Math.sin(a) * r),
      new THREE.Vector3(Math.cos(a) * r * 1.02, 0.5 + rand() * 0.9, Math.sin(a) * r * 1.02),
    ]);
    parts.push(new THREE.TubeGeometry(c, 7, 0.075 + rand() * 0.07, 4, false));
  }
  // 柳叶成团：只有丝绦的话，夜里看就是一笼铁丝
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2, r = 0.8 + rand() * 2.4;
    const clump = new THREE.SphereGeometry(0.5 + rand() * 0.55, 6, 5);
    clump.scale(1, 0.45, 1);
    clump.translate(Math.cos(a) * r, 3.0 + rand() * 2.0, Math.sin(a) * r);
    parts.push(clump);
  }
  return mergeGeometries(parts);
}

/** 瓮城、城门台座与桥洞一带不种树：那是三景自己的地盘 */
function insideYard(x, z) {
  const BC = SITE.landGate.barbican;
  if (Math.abs(x - BC.cx) < BC.halfW + 6 && z > BC.cz0 - 6 && z < BC.cz0 + BC.run + 6) return true;
  if (Math.abs(z - SITE.wall.z) < 16 && Math.abs(x) < 40) return true;
  if (Math.hypot(x, z - SITE.bridge.z) < 20) return true;
  return false;
}

/** 岸边树与塔院内的一丛柏：都躲开机位，免得挡帧 */
function plantings() {
  const geo = willowGeo();
  const cypress = new THREE.ConeGeometry(1.5, 5.2, 8);
  const grp = new THREE.Group();
  const spots = [];
  for (let z = -150; z <= 150; z += 14) {
    if (rand() > 0.42) spots.push([-(RIVER.halfWidth + 3.4 + rr(0, 5)), z + rr(-5, 5)]);
    if (rand() > 0.62) spots.push([RIVER.halfWidth + 3.4 + rr(0, 5), z + rr(-5, 5)]);
  }
  const clear = ([x, z]) => STATIONS.every((st) => Math.hypot(st.pos[0] - x, st.pos[2] - z) > 9) && !insideYard(x, z);
  for (const [x, z] of spots.filter(clear)) {
    const t = new THREE.Mesh(geo, M.leaf);
    const s = rr(0.78, 1.3);
    t.scale.set(s, s * rr(0.9, 1.15), s);
    t.position.set(x, RIVER.quayY, z);
    t.rotation.y = rand() * 6.28;
    t.castShadow = true;
    grp.add(registerOccluder(t, 4.2));
  }
  // 塔前柏：绕塔一圈，把塔基托在暗处
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rr(-0.1, 0.1);
    const r = SITE.pagoda.yard.r * rr(0.62, 0.82);
    const t = new THREE.Mesh(cypress, M.leaf);
    t.scale.setScalar(rr(0.8, 1.35));
    t.position.set(SITE.pagoda.x + Math.cos(a) * r, 2.2, SITE.pagoda.z + Math.sin(a) * r);
    grp.add(registerOccluder(t, 3.4, t.position.clone()));
  }
  return grp;
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon(), oldTown(), farRidge(), plantings());

  const hemi = new THREE.HemisphereLight(0x4c6796, 0x101420, 0.62);
  const moonLight = new THREE.DirectionalLight(0xaec8ff, 1.35);
  moonLight.position.copy(MOON_DIR).multiplyScalar(210);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 30; sc.far = 430;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.4;
  // 背面补一道冷光：月在高处，朝北那一面全靠天空的散射才不至于糊成一片黑
  const bounce = new THREE.DirectionalLight(0x36486e, 0.5);
  bounce.position.set(90, 60, 150);
  scene.add(hemi, moonLight, bounce);

  // 岸灯与塔灯的暖光补在低处，把砖壁、瓦面与堤石塑出体积
  const fillSpots = [
    [[-6, 6.4, 8], 0xffb066, 300, 80],
    [[-6, 3.4, 28], 0xffa657, 220, 62],
    [[0, 7.4, 74], 0xffc07a, 360, 74],
    [[0, 4.2, 84], 0xffb878, 220, 56],
    [[42, 9.4, 10], 0xffb878, 300, 76],
    [[-46, 10.0, -66], 0xffca8c, 300, 92],
    [[-48, 3.9, -50], 0xff9a5e, 170, 54],
    [[-16, 5.2, -34], 0xffb878, 210, 64],
    [[16, 5.6, 42], 0xffa657, 210, 64],
    [[-30, 5.0, 98], 0xff9a5e, 190, 62],
    [[15, 5.0, -112], 0xffb066, 190, 62],
    // 墙面洗光：三段城垣各给一盏低位泛光，砖面才不是一片死黑
    [[-52, 4.6, 10], 0xffa657, 900, 130],
    [[86, 4.6, 10], 0xffa657, 900, 130],
    [[-140, 4.6, 10], 0xff9a5e, 700, 120],
    // 桥面与引桥：站在桥顶时脚下得是石板而不是黑洞
    [[0, 12.2, 64], 0xffcf95, 320, 52],
    [[0, 11.4, 92], 0xffcf95, 320, 52],
    // 马道：城头那一圈墁砖要在人站着时读得出砖缝
    [[4, 13.4, SITE.wall.z], 0xffc07a, 240, 46],
    [[64, 13.4, SITE.wall.z], 0xffc07a, 240, 46],
    [[-56, 13.4, SITE.wall.z], 0xffc07a, 240, 46],
  ];
  const fills = fillSpots.map(([p, color, i, dist]) => {
    const l = new THREE.PointLight(color, i, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x0a1020, 0.0033);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
