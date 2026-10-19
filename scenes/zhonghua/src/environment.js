import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr, box, tileUV } from './kit.js';
import { MOAT, GROUND_Y, HALF_W } from './data.js';
import * as T from './textures.js';

/** 月自西南方向压过来，正好把南面（护城河那一侧）的垣体照亮 */
export const MOON_DIR = new THREE.Vector3(-0.44, 0.52, -0.74).normalize();

/** 深靛天顶 → 北面城内灯光熏出的暖雾 */
function skyDome() {
  const uni = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `
      varying vec3 vP; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 zenith = vec3(0.0050,0.0078,0.021);
        vec3 mid    = vec3(0.012,0.018,0.041);
        vec3 horizon= vec3(0.028,0.025,0.034);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.8,up));
        col = mix(col, horizon, smoothstep(0.52,0.34,up));
        float sky = smoothstep(-0.03, 0.07, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.2) * sky;
        // 城内在北：暖雾压在 +Z 一侧，雨花台那面（-Z）留冷
        float north = smoothstep(-0.35, 0.95, d.z*0.9 + d.x*0.2);
        col += vec3(0.036,0.017,0.007) * haze * (0.22 + 1.15*north);
        col += vec3(0.010,0.014,0.026) * haze * (1.0-north);
        float md = max(0.0, dot(d, normalize(vec3(-0.44,0.52,-0.74))));
        col += vec3(0.055,0.068,0.10) * pow(md, 26.0) * 0.9 * sky;
        float c = n(d.xz*7.0 + vec2(uTime*0.006, 0.0)) * 0.6 + n(d.xz*17.0 - vec2(uTime*0.01,0.0))*0.4;
        col = mix(col, col + vec3(0.010,0.013,0.024), smoothstep(0.45,0.85,c) * smoothstep(0.02,0.3,d.y));
        col = mix(col, vec3(0.0035,0.0045,0.009), smoothstep(0.0, -0.05, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), mat);
  g.frustumCulled = false;
  return { mesh: g, uni };
}

export function stars() {
  const N = 1500, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.06 + Math.pow(rand(), 0.7) * 0.9;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 780, y * 780, Math.sin(a) * r * 780], i * 3);
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
  const disc = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 16), glow('#fff4d6', 2.4));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,205', 0.1), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(190, 190, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(640);
  grp.position.y = Math.max(170, grp.position.y);
  return grp;
}

/* ------------------------------------------------------------------ 城内地景 */

/** 门北的老城南：低层屋脊 + 针尖窗火，往北越密 */
function cityNorth() {
  const grp = new THREE.Group();
  const silhouette = new THREE.MeshBasicMaterial({ color: 0x080b14, fog: true });
  silhouette.toneMapped = false;
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(1, 0.62, 4, 1);
  const N = 620;
  const bodies = new THREE.InstancedMesh(bodyGeo, silhouette, N);
  const roofs = new THREE.InstancedMesh(roofGeo, silhouette, N);
  const d = new THREE.Object3D();
  const win = [];
  for (let i = 0; i < N; i++) {
    // 沿中华路（+Z）铺开，越远越稀、越高
    const z = 96 + Math.pow(rand(), 0.72) * 520;
    const spread = 70 + z * 0.85;
    const x = rr(-spread, spread);
    const far = (z - 96) / 520;
    const h = 4.5 + rand() * (7 + far * 26);
    const w = 6 + rand() * (8 + far * 8);
    d.position.set(x, GROUND_Y + h * 0.5, z);
    d.rotation.set(0, rand() * Math.PI, 0);
    d.scale.set(w, h, w * 0.74);
    d.updateMatrix();
    bodies.setMatrixAt(i, d.matrix);
    if (h < 20) {
      d.position.set(x, GROUND_Y + h + 1.3, z);
      d.scale.set(w * 0.8, 3.2 + rand() * 2, w * 0.62);
      d.updateMatrix();
      roofs.setMatrixAt(i, d.matrix);
    } else {
      d.scale.set(0.001, 0.001, 0.001);
      d.updateMatrix();
      roofs.setMatrixAt(i, d.matrix);
    }
    if (rand() > 0.5) win.push(x + rr(-w * 0.3, w * 0.3), GROUND_Y + h * 0.62, z + rr(-2, 2));
    if (rand() > 0.72) win.push(x + rr(-w * 0.3, w * 0.3), GROUND_Y + h * 0.34, z + rr(-2, 2));
  }
  bodies.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(win), 3));
  const wm = new THREE.PointsMaterial({
    map: T.softGlow('255,200,140', 0.2), size: 3.4, transparent: true, color: 0xffffff,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  grp.add(bodies, roofs, new THREE.Points(wg, wm));
  return grp;
}

/** 正南的雨花台：一道低缓的岗，压着护城河外的天际线 */
function yuhuatai() {
  const seg = 160, pts = [], idx = [], col = [];
  const cLow = new THREE.Color('#04060d'), cHigh = new THREE.Color('#0d1524');
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const x = (t - 0.5) * 1500;
    // 岗在正南偏西隆起，两侧压平
    const bump = Math.exp(-Math.pow((t - 0.44) * 3.4, 2)) * 46
      + Math.exp(-Math.pow((t - 0.62) * 5.0, 2)) * 22
      + Math.abs(Math.sin(t * 21.0)) * 3.2;
    const z = -330 - Math.abs(x) * 0.16;
    pts.push(x, -8, z, x, bump + 6, z);
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

/** 城外南岸的树：剪影团块，夜里只剩轮廓 */
function treesSouth() {
  const grp = new THREE.Group();
  const leaf = new THREE.MeshBasicMaterial({ color: 0x070c14, fog: true });
  leaf.toneMapped = false;
  const blob = new THREE.SphereGeometry(1, 7, 5);
  const N = 190;
  const inst = new THREE.InstancedMesh(blob, leaf, N * 2);
  const d = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < N; i++) {
    const x = rr(-360, 360);
    const z = rr(-330, -168);
    const s = rr(3.2, 7.4);
    d.position.set(x, 2.4 + s * 0.72, z);
    d.scale.set(s, s * rr(0.8, 1.15), s * 0.9);
    d.updateMatrix();
    inst.setMatrixAt(k++, d.matrix);
    d.position.set(x + rr(-1.4, 1.4), 2.4 + s * 0.28, z + rr(-1.2, 1.2));
    d.scale.set(s * 0.62, s * 0.6, s * 0.6);
    d.updateMatrix();
    inst.setMatrixAt(k++, d.matrix);
  }
  inst.count = k;
  inst.instanceMatrix.needsUpdate = true;
  grp.add(inst);
  return grp;
}

/* ------------------------------------------------------------------ 地形 */

/**
 * 地面分块拼：城内与瓮城地坪同高（GROUND_Y），护城河是一条低于地坪的
 * 水渠，两岸用条石驳岸挡住。水面在 y=0，所以驳岸必须盖住水面的边缘，
 * 否则会看到一条亮缝。
 */
function terrain() {
  const grp = new THREE.Group();
  const W = MOAT.length + 60;
  const waterNorth = MOAT.centerZ + MOAT.halfWidth + 1.5;   // -72.5
  const waterSouth = MOAT.centerZ - MOAT.halfWidth - 1.5;   // -155.5
  const slab = (w, d, top, x, z, mat) => {
    const m = new THREE.Mesh(box(w, top, d), mat);
    m.position.set(x, top / 2, z);
    m.receiveShadow = true;
    grp.add(m);
    return m;
  };

  // 城内（门北）地坪，与瓮城地面同高
  slab(1100, 760, GROUND_Y, 0, 64 + 380, M.earth);
  // 瓮城东西两侧的城外地面
  for (const s of [-1, 1]) slab(520 - HALF_W, 130, GROUND_Y, s * (HALF_W + (520 - HALF_W) / 2), 0, M.earth);
  // 门外月城：南垣外到驳岸之间那一条
  slab(1100, 12, GROUND_Y, 0, -70, M.earth);
  // 护城河南岸外，低一截
  slab(1100, 700, 2.4, 0, waterSouth - 350, M.earthSouth);

  // 驳岸：条石挡水，顶面压一层檐石；必须盖住水面的南北边缘，否则露出一条亮缝
  const revet = (z, h) => {
    const wall = new THREE.Mesh(box(W, h, 4.6), M.granite);
    wall.position.set(0, h / 2, z);
    wall.receiveShadow = wall.castShadow = true;
    const cope = new THREE.Mesh(box(W, 0.26, 5.4), M.graniteWet);
    cope.position.set(0, h + 0.13, z);
    cope.receiveShadow = true;
    grp.add(wall, cope);
  };
  revet(waterNorth + 0.8, GROUND_Y + 0.2);
  revet(waterSouth - 0.8, 2.4);

  // 瓮城地坪：条石铺面。用平面而不是盒体，UV 才按米走、砖缝才对得上尺度
  const floor = new THREE.Mesh(tileUV(new THREE.PlaneGeometry(HALF_W * 2, 128), HALF_W * 2, 128), M.paving);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, GROUND_Y, 0);
  floor.receiveShadow = true;
  grp.add(floor);

  return grp;
}

/* ------------------------------------------------------------------ 光照 */

function lights(scene) {
  const hemi = new THREE.HemisphereLight(0x5570a5, 0x0d1018, 0.66);
  const moonLight = new THREE.DirectionalLight(0xb8d2ff, 1.5);
  moonLight.position.copy(MOON_DIR).multiplyScalar(240);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -132; sc.right = 132; sc.top = 132; sc.bottom = -132; sc.near = 60; sc.far = 480;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.5;
  scene.add(hemi, moonLight);

  // 灯阵给各处补的暖光。前五个是瓮城与城台内部，随序列推进才起来；
  // 后面几盏洗南立面与桥面，望门机位全靠它们把二十米高的墙读出形状
  const fills = [
    [[0, GROUND_Y + 9, -40], 0xff9c52, 420, 88, 0],
    [[0, GROUND_Y + 9, -2], 0xff9c52, 420, 88, 0],
    [[0, GROUND_Y + 10, 36], 0xffa45c, 460, 96, 0],
    [[0, GROUND_Y + 5, 54], 0xff8f4e, 260, 66, 0],
    [[0, GROUND_Y + 14, 54], 0xffb070, 240, 70, 0],
    [[-34, GROUND_Y + 9, -82], 0xffa463, 430, 124, 1],
    [[34, GROUND_Y + 9, -82], 0xffa463, 430, 124, 1],
    [[0, GROUND_Y + 13, -78], 0xffc07a, 300, 112, 1],
    [[0, 2.0, -126], 0xffb273, 150, 96, 1],
    [[0, GROUND_Y + 8, 104], 0xffc084, 250, 124, 1],
  ];
  const points = fills.map(([p, color, i, dist, kind]) => {
    const l = new THREE.PointLight(color, i, dist, 2);
    l.position.set(...p);
    l.userData.base = i;
    l.userData.kind = kind;
    scene.add(l);
    return l;
  });
  return { moonLight, points };
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon(), cityNorth(), yuhuatai(), treesSouth(), terrain());

  const { points } = lights(scene);
  scene.fog = new THREE.FogExp2(0x0a1024, 0.0030);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    fills: points,
    setStarBright(v) { star.uni.uBright.value = v; },
    /** 灯阵推进时，瓮城内部的暖光跟着起来；外洗光只补一部分 */
    setArrayLevel(v) {
      points.forEach((l) => {
        const w = l.userData.kind === 0
          ? 0.1 + 0.9 * Math.min(1, v * 1.5)
          : 0.6 + 0.4 * Math.min(1, v);
        l.intensity = l.userData.base * w;
      });
    },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
