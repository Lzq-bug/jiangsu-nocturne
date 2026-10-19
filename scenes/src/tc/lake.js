import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, glow, rand, rr, registerOccluder } from '../kit.js';
import * as T from '../textures.js';
import { TM } from './surfaces.js';
import { WALL, LAKE, centerZ, faceZ } from './data.js';
import { ribbon, range, dummy } from './geo.js';

export const WATER_Y = 0;

/** 城内一侧的地面：永远贴着墙脚往外铺，不留缝 */
function cityGroundSection(x) {
  return [
    { z: centerZ(x) + WALL.halfBase - 1.2, y: WALL.innerGround },
    { z: 330, y: WALL.innerGround - 0.6 },
  ];
}

/** 湖侧：墙脚 -> 环湖路 -> 缓坡入水 */
function shoreSection(x) {
  const foot = centerZ(x) - WALL.halfBase + 1.2;
  return [
    { z: foot, y: WALL.outerGround + 0.15 },
    { z: foot - 13, y: WALL.outerGround - 0.2 },
    { z: foot - 21, y: 1.1 },
    { z: foot - 30, y: -0.8 },
  ];
}

/** 台城柳长堤：湖中一道与墙平行的洲堤 */
function causewaySection(x) {
  const { z, halfWidth } = LAKE.causeway;
  return [
    { z: z - halfWidth - 3.4, y: -1.2 },
    { z: z - halfWidth, y: 1.35 },
    { z: z + halfWidth, y: 1.5 },
    { z: z + halfWidth + 3.4, y: -1.2 },
  ];
}

function causewayTopSection(x) {
  const { z, halfWidth } = LAKE.causeway;
  return [{ z: z - halfWidth + 0.4, y: 1.55 }, { z: z + halfWidth - 0.4, y: 1.55 }];
}

/* ------------------------------------------------------------------ 水面 */
export function buildLake(scene, moonDir) {
  const geo = new THREE.PlaneGeometry(800, 380, 60, 40);
  geo.rotateX(-Math.PI / 2);
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: moonDir.clone() },
    uDeep: { value: new THREE.Color('#050b18') },
    uShallow: { value: new THREE.Color('#0b1a2c') },
    uWall: { value: new THREE.Color('#3a2a18') },
    uNoise: { value: T.noise() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float h = sin(p.x*0.075 + uTime*0.75)*0.16 + sin(p.y*0.055 - uTime*0.5)*0.2
                + sin((p.x+p.y)*0.19 + uTime*1.3)*0.06;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uWall; uniform sampler2D uNoise;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.006,0.009,0.021), vec3(0.013,0.018,0.042), smoothstep(0.5,0.86,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.4, 0.0, 1.0), 2.2);
        // 城南的灯雾压在画面南侧，湖这一面相对干净
        float warm = smoothstep(-0.4, 0.9, -d.z*0.85 + abs(d.x)*0.2);
        col += vec3(0.030,0.014,0.006) * haze * (0.3 + 1.0*warm);
        col += vec3(0.022,0.026,0.040) * pow(max(0.0, dot(d, uMoon)), 30.0);
        return mix(col, vec3(0.003,0.004,0.008), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float det = clamp(1.0 - length(cameraPosition - vW) / 240.0, 0.0, 1.0);
        float dx = cos(p.x*0.075 + t*0.75)*0.075*0.16 + cos((p.x+p.y)*0.19 + t*1.3)*0.19*0.06;
        float dz = cos(p.y*0.055 - t*0.5)*0.055*0.2 + cos((p.x+p.y)*0.19 + t*1.3)*0.19*0.06;
        float c1 = sin(p.x*0.95 + t*2.3) * sin(p.y*0.82 - t*1.8);
        float c2 = sin(p.x*1.75 - t*3.0 + p.y*1.25) * 0.6;
        dx += (c1*0.95 + c2*1.75) * 0.05 * uRipple * det;
        dz += (cos(p.y*0.88 - t*1.7)*0.88*0.9 + c2*1.25) * 0.05 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple*0.8, 1.0, -dz*uRipple*0.8));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.1 + 0.24*fres);
        col = mix(col, skyAt(normalize(r)) * 2.2, 0.2 + 0.44*fres);

        // 月光在湖面铺出一条宽一点的巷子
        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        float lane = smoothstep(0.5, 0.99, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.40,0.46,0.60) * pow(ndh, 300.0) * (0.5 + lane*1.35);
        col += vec3(0.15,0.19,0.29) * pow(ndh, 48.0) * (0.12 + lane*0.45);

        // 城墙那一面把一小片暖光落在水里
        float wallSide = (1.0 - smoothstep(8.0, 40.0, abs(p.y + 2.0))) * (1.0 - smoothstep(200.0, 380.0, abs(p.x)));
        col += uWall * wallSide * 0.24 * (0.6 + 0.4*sin(t*1.4 + p.x*0.05));

        float nsh = texture2D(uNoise, p*0.011 + vec2(t*0.016, -t*0.022)).r;
        col *= 0.94 + nsh*0.12;

        float a = clamp(0.86 + fres*0.12, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, WATER_Y, -176);
  mesh.renderOrder = 3;
  mesh.name = 'xuanwu-lake';
  scene.add(mesh);
  return {
    mesh,
    uniforms: uni,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
    },
  };
}

/* ------------------------------------------------------------------ 台城柳 */
/** 垂柳：主干 + 五出主枝 + 五十余条垂丝 + 一团叶影，远看才不散成铁丝 */
function tcWillow() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.26, 0.62, 5.2, 8);
  trunk.translate(0, 2.6, 0);
  parts.push(trunk);
  for (let i = 0; i < 5; i++) {
    const br = new THREE.CylinderGeometry(0.07, 0.18, 2.7, 5);
    br.translate(0, 1.35, 0);
    br.rotateZ(0.92);
    br.rotateY((i / 5) * Math.PI * 2 + 0.4);
    br.translate(0, 5.0, 0);
    parts.push(br);
  }
  for (let i = 0; i < 52; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.2 + Math.pow(rand(), 0.6) * 2.9;
    const top = 5.4 + rand() * 1.2;
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * r * 0.3, top, Math.sin(a) * r * 0.3),
      new THREE.Vector3(Math.cos(a) * r * 0.75, top - 0.7, Math.sin(a) * r * 0.75),
      new THREE.Vector3(Math.cos(a) * r, 2.6 + rand() * 0.8, Math.sin(a) * r),
      new THREE.Vector3(Math.cos(a) * r * 1.03, 0.35 + rand() * 0.7, Math.sin(a) * r * 1.03),
    ]);
    parts.push(new THREE.TubeGeometry(c, 6, 0.045 + rand() * 0.05, 4, false));
  }
  // 叶团：三个错开的扁球，免得远看成一排伞
  for (const [ox, oy, oz, r] of [[0, 5.6, 0, 1.9], [-1.3, 5.1, 0.7, 1.5], [1.15, 5.2, -0.8, 1.45]]) {
    const crown = new THREE.SphereGeometry(r, 10, 7);
    crown.scale(1, 0.44, 1);
    crown.translate(ox, oy, oz);
    parts.push(crown);
  }
  return mergeGeometries(parts);
}

/* ------------------------------------------------------------------ 岸、堤、灯 */
export function buildShore(scene, columns) {
  const group = new THREE.Group();
  group.name = 'xuanwu-shore';
  const xs = range(-382, 382, 6);

  group.add(new THREE.Mesh(ribbon(cityGroundSection, xs, { uScale: 8, vScale: 9 }), TM.earth));
  group.add(new THREE.Mesh(ribbon(shoreSection, xs, { uScale: 5, vScale: 4 }), TM.gravel));

  const cw = range(LAKE.causeway.xFrom, LAKE.causeway.xTo, 6);
  group.add(new THREE.Mesh(ribbon(causewaySection, cw, { uScale: 5, vScale: 3.6 }), TM.earth));
  group.add(new THREE.Mesh(ribbon(causewayTopSection, cw, { uScale: 2.6, vScale: 2.6 }), TM.gravel));

  // 环湖路的一排灯：贴墙脚走，灯影落进湖里
  const o = dummy();
  const nRoad = 40;
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 3.1, 6), M.ink, nRoad);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), glow('#ffcf8e', 2.1), nRoad);
  const haloMap = T.softGlow('255,200,140', 0.1);
  let i = 0;
  for (let x = -380; x <= 380 && i < nRoad; x += 19, i++) {
    const z = faceZ(x, WALL.outerGround, -1) - 4.5;
    o.rotation.set(0, 0, 0);
    o.position.set(x, WALL.outerGround + 1.5, z);
    o.updateMatrix();
    posts.setMatrixAt(i, o.matrix);
    o.position.set(x, WALL.outerGround + 3.1, z);
    o.updateMatrix();
    heads.setMatrixAt(i, o.matrix);
    columns.add(new THREE.Vector3(x, 0, z), 0xffb877, 0.8, 7.5, 0.85);
    if (i % 4 === 0) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      halo.scale.set(4.5, 4.5, 1);
      halo.position.set(x, WALL.outerGround + 3.1, z);
      group.add(halo);
    }
  }
  posts.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  group.add(posts, heads);

  // 台城柳：堤上一行垂柳，"烟笼"的烟就是它们
  const willow = tcWillow();
  for (let x = LAKE.causeway.xFrom + 14; x <= LAKE.causeway.xTo - 6; x += 11) {
    const s = rr(1.15, 1.6);
    const t = new THREE.Mesh(willow, TM.leafNight);
    t.scale.set(s, s * rr(0.9, 1.15), s);
    t.position.set(x, 1.5, LAKE.causeway.z + rr(-1.8, 1.8));
    t.rotation.y = rand() * 6.28;
    group.add(registerOccluder(t, 3.4, new THREE.Vector3(x, 1.5, LAKE.causeway.z)));
    if (rand() > 0.72) columns.add(new THREE.Vector3(x, 0, LAKE.causeway.z), 0xffca88, 0.7, 5.5, 0.55);
  }

  // 堤上四盏石灯
  for (const x of [-190, -70, 60, 165]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), glow('#ffd79b', 2.4));
    lamp.position.set(x, 3.1, LAKE.causeway.z);
    group.add(lamp);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.7, 6), TM.stone);
    post.position.set(x, 2.3, LAKE.causeway.z);
    group.add(post);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.scale.set(5.5, 5.5, 1);
    halo.position.copy(lamp.position);
    group.add(halo);
    columns.add(new THREE.Vector3(x, 0, LAKE.causeway.z), 0xffc07a, 1.2, 9.5, 1);
  }

  scene.add(group);
  return { group };
}
