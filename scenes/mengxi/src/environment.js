import * as THREE from 'three';
import { glow, rand, rr, lit } from './kit.js';
import * as T from './textures.js';

/**
 * 月出东南，正当池中那一口水面：从巷口东望、从池西岸东望，都在一个方向上。
 * 天极留在正北，高度约 32°（镇江纬度）。
 */
export const MOON_DIR = new THREE.Vector3(0.88, 0.40, -0.24).normalize();
export const NCP_DIR = new THREE.Vector3(0, Math.sin(32 * Math.PI / 180), -Math.cos(32 * Math.PI / 180)).normalize();

/* ------------------------------------------------------------------ 天穹 */
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
        vec3 zenith = vec3(0.0035,0.0052,0.0140);
        vec3 mid    = vec3(0.0092,0.0132,0.030);
        vec3 horizon= vec3(0.021,0.0200,0.028);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.83,up));
        col = mix(col, horizon, smoothstep(0.52,0.32,up));
        float sky = smoothstep(-0.04, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.8,0.0,1.0), 2.5) * sky;
        // 城西那片灯火顺着巷子那一头浮起来
        float warm = smoothstep(-0.15, 0.95, -d.x*0.9 - d.z*0.15);
        col += vec3(0.030,0.0150,0.0052) * haze * (0.28 + 0.95*warm);
        // 月华
        float md = max(0.0, dot(d, uMoon));
        col += vec3(0.045,0.055,0.082) * pow(md, 26.0) * 0.9 * sky;
        float c = n(d.xz*7.0 + vec2(uTime*0.004, uTime*0.0015)) * 0.62 + n(d.xz*17.0 - vec2(uTime*0.008,0.0))*0.38;
        col = mix(col, col + vec3(0.007,0.010,0.019), smoothstep(0.46,0.9,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0028,0.0035,0.0070), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(540, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

function stars() {
  const N = 1500, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.05 + Math.pow(rand(), 0.72) * 0.92;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 500, y * 500, Math.sin(a) * r * 500], i * 3);
    size[i] = 0.7 + Math.pow(rand(), 3) * 3.3;
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
      void main(){ vA = (0.42+0.58*sin(uTime*1.5+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.85,0.90,1.0), t.a*vA*0.9); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms, mat: m };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(6.4, 24, 16), glow('#fff7e2', 1.25));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,208', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(54, 54, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(430);
  return grp;
}

/**
 * 拱极星官：北斗七星按真实相对方位摆在正北天极周围，斗魁指极；
 * 另画一圈极星绕行轨迹与三五个虚影，对应「每夜在北极之旁，如月中行」。
 */
function asterism() {
  // 切平面坐标（度），u 向东、v 向上，原点在天极
  const DIPPER = [
    { n: '摇光', u: -27, v: 19, s: 2.4 },
    { n: '开阳', u: -20.5, v: 16.5, s: 2.2 },
    { n: '玉衡', u: -13.5, v: 15.5, s: 2.6 },
    { n: '天权', u: -6, v: 13.5, s: 1.9 },
    { n: '天玑', u: -2.5, v: 5.5, s: 2.3 },
    { n: '天璇', u: 8, v: 4.5, s: 2.1 },
    { n: '天枢', u: 10, v: 12.5, s: 2.7 },
  ];
  const LINKS = [[6, 5], [5, 4], [4, 3], [3, 6], [3, 2], [2, 1], [1, 0]];
  const east = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, Math.cos(32 * Math.PI / 180), Math.sin(32 * Math.PI / 180)).normalize();
  const R = 470;
  const dir = (u, v) => NCP_DIR.clone()
    .addScaledVector(east, (u * Math.PI / 180) * 1.9)
    .addScaledVector(up, (v * Math.PI / 180) * 1.9)
    .normalize().multiplyScalar(R);

  const grp = new THREE.Group();
  const pos = [], sizes = [], phase = [];
  for (const st of DIPPER) {
    const p = dir(st.u, st.v);
    pos.push(p.x, p.y, p.z);
    sizes.push(st.s * 3.1);
    phase.push(rand() * 6.28);
  }
  // 北极星（勾陈一）离天极三度余，宋时更近一些
  const pol = dir(2.6, 1.2);
  pos.push(pol.x, pol.y, pol.z); sizes.push(3.4 * 3.1); phase.push(0.4);
  const ghost = [[-3.2, -1.6], [1.1, -3.4], [3.6, 2.6], [-1.4, 3.3]];
  for (const [u, v] of ghost) {
    const p = dir(u, v);
    pos.push(p.x, p.y, p.z); sizes.push(2.0 * 3.1); phase.push(rand() * 6.28);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uTex: { value: T.softGlow('226,238,255', 0.03) } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.72+0.28*sin(uTime*1.1+aPhase)) * uBright;
        gl_PointSize = aSize; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.90,0.94,1.0), t.a*vA); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  grp.add(pts);

  // 斗魁指极的两条引线 + 魁身连线
  const lv = [];
  for (const [a, b] of LINKS) {
    const [ua, va] = [DIPPER[a].u, DIPPER[a].v], [ub, vb] = [DIPPER[b].u, DIPPER[b].v];
    const pa = dir(ua, va), pb = dir(ub, vb);
    lv.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
  }
  // 从斗魁两星延指向极星，正是「指极」那一笔
  const merak = dir(DIPPER[5].u, DIPPER[5].v), dubhe = dir(DIPPER[6].u, DIPPER[6].v);
  for (const p of [merak, dubhe]) {
    const q = p.clone().lerp(new THREE.Vector3(pol.x, pol.y, pol.z), 0.55);
    lv.push(p.x, p.y, p.z, q.x, q.y, q.z);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lv, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
    color: 0x9fc4e6, transparent: true, opacity: 0.16, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  }));
  lines.frustumCulled = false;
  grp.add(lines);

  // 极星绕行圈
  const circ = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const p = dir(Math.cos(a) * 3.4, Math.sin(a) * 3.4);
    circ.push(p.x, p.y, p.z);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(circ, 3));
  const ring = new THREE.Line(cg, new THREE.LineBasicMaterial({
    color: 0xbcd6ee, transparent: true, opacity: 0.07, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  }));
  ring.frustumCulled = false;
  grp.add(ring);

  return { group: grp, uni: m.uniforms, lines, ring };
}

/** 镇江老城那一层层屋脊，只留剪影与零星窗灯；让开巷与园那条取景走廊 */
function roofSea() {
  const grp = new THREE.Group();
  const roofGeo = new THREE.ConeGeometry(1, 0.6, 4, 1);
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const n = 340;
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x111a2e, fog: true });
  silhouette.toneMapped = false;
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, n);
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, n);
  const dum = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < n; i++) {
    let a = rand() * Math.PI * 2;
    let x = 0, z = 0;
    for (let tries = 0; tries < 9; tries++) {
      const band = 66 + Math.pow(rand(), 0.62) * 160;
      x = -12 + Math.cos(a) * band;
      z = Math.sin(a) * band * 0.85;
      const inCorridor = x > -70 && x < 48 && Math.abs(z) < 24;
      if (!inCorridor) break;
      a += 0.78;
    }
    const h = 4 + rand() * 8.5, w = 6 + rand() * 8;
    // 城里的屋脊是一排一排的，随机转角只会看成一堆石头
    const yaw = (rand() > 0.5 ? 0 : Math.PI / 2) + rr(-0.08, 0.08);
    dum.position.set(x, h * 0.5, z);
    dum.rotation.set(0, yaw, 0);
    dum.scale.set(w, h, w * 0.72);
    dum.updateMatrix();
    bodies.setMatrixAt(i, dum.matrix);
    dum.position.set(x, h + 1.2, z);
    dum.rotation.set(0, yaw + Math.PI / 4, 0);
    dum.scale.set(w * 0.8, 2.6 + rand() * 1.5, w * 0.6);
    dum.updateMatrix();
    roofs.setMatrixAt(i, dum.matrix);
    if (rand() > 0.6) win.push(x + rr(-w * 0.3, w * 0.3), h * 0.55, z + rr(-1.5, 1.5));
  }
  roofs.instanceMatrix.needsUpdate = bodies.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,198,140', 0.2), size: 2.5, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));
  return grp;
}

/** 远处一道城脊，把园墙衬住 */
function skyline() {
  const pts = [], col = [], idx = [];
  const seg = 92, R = 250;
  const cLow = new THREE.Color('#05080f'), cHigh = new THREE.Color('#0f1728');
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    const bump = Math.abs(Math.sin(a * 2.4 + 0.7)) * 8 + Math.abs(Math.sin(a * 5.9)) * 4 + Math.sin(a * 10.3) * 1.6;
    const h = 9.5 + bump;
    pts.push(x * R, -4, z * R, x * R, h, z * R);
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

/** 园墙与巷外一丛丛树冠的暗块——只围在场子外面，别长进取景的园里 */
function outerGreen() {
  const grp = new THREE.Group();
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x070c16, fog: true });
  mat.toneMapped = false;
  const n = 80;
  const inst = new THREE.InstancedMesh(blob, mat, n);
  const dum = new THREE.Object3D();
  let k = 0;
  const inside = (x, z) => x > -74 && x < 54 && z > -28 && z < 28;
  const put = (x, z) => {
    if (k >= n || inside(x, z)) return;
    const s = 2.0 + rand() * 3.0;
    dum.position.set(x, 1.2 + rand() * 1.4, z);
    dum.rotation.set(0, rand() * 3, 0);
    dum.scale.set(s * 1.5, s * 0.42, s * 1.2);
    dum.updateMatrix();
    inst.setMatrixAt(k++, dum.matrix);
  };
  for (let i = 0; i < 200 && k < n; i++) {
    const side = i % 4;
    const along = -74 + rand() * 132;
    if (side === 0) put(along, -29 - rand() * 16);
    else if (side === 1) put(along, 29 + rand() * 16);
    else if (side === 2) put(55 + rand() * 16, -26 + rand() * 52);
    else put(-75 - rand() * 14, -26 + rand() * 52);
  }
  inst.count = k;
  inst.instanceMatrix.needsUpdate = true;
  grp.add(inst);
  return grp;
}

/** 城下那片地：不铺一层暗底，远处的屋脊就成了一圈漂浮的石块 */
function groundHood() {
  const g = new THREE.CircleGeometry(430, 48);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ color: 0x05080e, fog: true });
  m.toneMapped = false;
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = -0.6;
  mesh.frustumCulled = false;
  return mesh;
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  const ast = asterism();
  scene.add(sky.mesh, star.mesh, ast.group, moon(), groundHood(), roofSea(), skyline(), outerGreen());

  const hemi = new THREE.HemisphereLight(0x3f5c86, 0x0a0d16, 0.72);
  const moonLight = new THREE.DirectionalLight(0xbdd0ff, 1.5);
  moonLight.position.copy(MOON_DIR).multiplyScalar(140);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -58; sc.right = 58; sc.top = 44; sc.bottom = -44; sc.near = 40; sc.far = 300;
  moonLight.shadow.bias = -0.0014;
  moonLight.shadow.normalBias = 0.32;
  scene.add(hemi, moonLight);

  // 巷与园的暖色补光：把粉墙从月色里拉回来，但别把白墙烧成一片
  const fillSpots = [
    [[-58, 3.1, 0], 0xffb877, 13, 20],
    [[-42, 3.1, 0], 0xffb06a, 13, 20],
    [[-28, 3.1, 0], 0xffc07a, 12, 18],
    [[-16.6, 3.2, 0], 0xffbb7d, 14, 20],
    [[-3.5, 2.8, 0], 0xffca8a, 12, 16],
    [[-7.6, 2.6, 0.6], 0xffc07a, 9, 13],
    [[10.6, 2.6, 8.9], 0xffd0a2, 16, 20],
    [[18.5, 1.6, 8.5], 0xffe0b0, 8, 11],
    [[26.5, 1.4, 2.5], 0xfff0cf, 7, 13],
    [[31.5, 3.0, -12.5], 0xffbf84, 11, 16],
    [[38, 2.6, 14], 0xa8c8e6, 8, 14],
  ];
  const fills = fillSpots.map(([p, color, i, dist]) => {
    const l = new THREE.PointLight(color, i, dist, 2);
    l.position.set(...p);
    scene.add(l);
    return l;
  });

  scene.fog = new THREE.FogExp2(0x070c18, 0.0072);

  return {
    uni: { sky: sky.uni, stars: star.uni, asterism: ast.uni },
    ast,
    fills,
    setStarBright(v) { star.uni.uBright.value = v; ast.uni.uBright.value = v; },
    /** 灯火调暗时把暖色补光一起收掉，只剩月色 */
    fillsOn(k) {
      const f = Math.min(1.6, Math.max(0, k));
      fills.forEach((l, i) => { l.intensity = fillSpots[i][2] * (0.15 + 0.85 * Math.min(1, f)); });
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
      ast.uni.uTime.value = t;
    },
  };
}
