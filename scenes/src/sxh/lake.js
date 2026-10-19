import * as THREE from 'three';
import { lit } from '../kit.js';
import * as T from '../textures.js';
import { LAKE, channelAt } from './data.js';
import { MOON_DIR } from './sky.js';

export const WATER_Y = 0;

/**
 * 岸线由 channelAt(z) 的偏移决定：水中为负、岸边陡起成驳岸、再往外是园林地平。
 * 景物落位与地形网格共用这一函数，否则亭子会插进水里。
 */
export function groundY(x, z) {
  const { cx, w } = channelAt(z);
  const d = Math.abs(x - cx) - w;
  if (d < 0) return -3.4 + d * 0.06;
  const y = LAKE.bankY * Math.pow(Math.min(1, d / 3.4), 0.72);
  const roll = d > 4 ? (d - 4) * 0.045 : 0;
  const bump = 0.22 * Math.sin(x * 0.11 + z * 0.083) * Math.min(1, Math.max(0, (d - 2) / 8));
  return Math.min(LAKE.bankY, y) + roll + bump;
}

export function buildLand(scene) {
  const nx = 96, nz = 210;
  const g = new THREE.PlaneGeometry(LAKE.halfX * 2, LAKE.zTo - LAKE.zFrom, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, (LAKE.zFrom + LAKE.zTo) / 2);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const cBed = new THREE.Color('#070c12');
  const cWall = new THREE.Color('#39414f');
  const cTop = new THREE.Color('#233027');
  const cFar = new THREE.Color('#182019');
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const y = groundY(x, z);
    p.setY(i, y);
    const { cx, w } = channelAt(z);
    const d = Math.abs(x - cx) - w;
    // 水线那道灰带太宽就像泳池边，压到一米出头
    if (d < -1) tmp.copy(cBed);
    else if (d < 1.2) tmp.lerpColors(cWall, cTop, Math.min(1, (d + 1) / 2.2));
    else tmp.lerpColors(cTop, cFar, Math.min(1, (d - 1.2) / 20));
    // 纯色平涂在鸟瞰下像一块塑料，掺一点低频噪声当草坡与土色
    const n = 0.86 + 0.22 * Math.abs(Math.sin(x * 0.071 + z * 0.043) * Math.sin(z * 0.11 - x * 0.032));
    tmp.multiplyScalar(n);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const mat = lit('#ffffff', { map: T.stone('#8b919d'), rough: 0.96, side: THREE.DoubleSide });
  mat.vertexColors = true;
  mat.map = mat.map.clone();
  mat.map.repeat.set(52, 104);
  mat.map.needsUpdate = true;
  mat.emissive = new THREE.Color('#0a1220');
  mat.emissiveIntensity = 0.45;
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = 'sxh-land';
  scene.add(mesh);
  return mesh;
}

/**
 * 一整片水面，靠不透明的岸把它裁成湖形：透明层做深度测试，岸高于水处自然被挡住。
 * 这样湖岸线可以直接跟 channelAt 走，不必为水面做异形多边形。
 */
export function buildLake(scene, moonDir = MOONPlaceholder()) {
  const geo = new THREE.PlaneGeometry(LAKE.halfX * 2 - 4, LAKE.zTo - LAKE.zFrom + 40, 60, 200);
  geo.rotateX(-Math.PI / 2);
  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: moonDir.clone() },
    uDeep: { value: new THREE.Color('#01050c') },
    uShallow: { value: new THREE.Color('#061221') },
    uNoise: { value: T.noise() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime; uniform float uRipple;
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec2 p = wp.xz;
        float h = sin(p.x*0.085 + uTime*0.62)*0.16 + sin(p.y*0.061 - uTime*0.44)*0.19
                + sin((p.x*0.7+p.y)*0.17 + uTime*1.1)*0.07;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform vec3 uMoon;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      varying vec3 vW;
      vec3 skyAt(vec3 d){
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0055,0.0085,0.019), vec3(0.012,0.017,0.038), smoothstep(0.5,0.86,up));
        float haze = pow(clamp(1.0-abs(d.y)*2.7,0.0,1.0), 2.2);
        float city = smoothstep(-0.4,0.9, d.x*0.6 + d.z*0.8);
        col += vec3(0.024,0.010,0.004) * haze * (0.35 + 0.9*city);
        col += vec3(0.020,0.024,0.038) * pow(max(0.0,dot(d,uMoon)), 26.0);
        return mix(col, vec3(0.0028,0.0038,0.0075), smoothstep(0.0, -0.06, d.y));
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        // 高频细波只在近处叠，远处交给长波，不然从鸟瞰看会起摩尔纹
        float det = clamp(1.0 - length(cameraPosition - vW) / 150.0, 0.0, 1.0);
        float dx = cos(p.x*0.085 + t*0.62)*0.085*0.16 + cos((p.x*0.7+p.y)*0.17 + t*1.1)*0.119*0.07;
        float dz = cos(p.y*0.061 - t*0.44)*0.061*0.19 + cos((p.x*0.7+p.y)*0.17 + t*1.1)*0.17*0.07;
        float c1 = sin(p.x*1.4 + t*2.2) * sin(p.y*1.1 - t*1.7);
        float c2 = sin(p.x*2.7 - t*2.9 + p.y*1.9) * 0.6;
        dx += (c1*1.4 + c2*2.7) * 0.02 * uRipple * det;
        dz += (cos(p.x*1.1 - t*1.6)*1.1*0.9 + c2*1.9) * 0.02 * uRipple * det;
        vec3 n = normalize(vec3(-dx*uRipple*0.9, 1.0, -dz*uRipple*0.9));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.2);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.14 + 0.24*fres);
        col = mix(col, skyAt(normalize(r)) * 0.34, 0.14 + 0.40*fres);

        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        // 月华只铺在朝向月亮的那一侧，否则鸟瞰下整条湖会变成一条白带子
        float lane = smoothstep(0.45, 0.995, dot(normalize(vec3(V.x,0.0,V.z)), normalize(vec3(uMoon.x,0.0,uMoon.z))));
        col += vec3(0.40,0.46,0.60) * pow(ndh, 340.0) * (0.45 + lane*1.3);
        col += vec3(0.15,0.19,0.28) * pow(ndh, 46.0) * (0.12 + lane*0.5);
        col += vec3(0.055,0.068,0.095) * pow(ndh, 8.0) * lane * 0.28;

        float sparkle = pow(max(0.0, sin(p.x*6.1 + t*2.6) * sin(p.y*5.3 - t*2.0)), 12.0);
        col += vec3(0.20,0.22,0.26) * sparkle * 0.04 * uRipple * det * det;

        float nsh = texture2D(uNoise, p*0.011 + vec2(t*0.016, -t*0.022)).r;
        col *= 0.95 + nsh*0.11;

        float a = clamp(0.84 + fres*0.14, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 3;
  mesh.name = 'sxh-lake';
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

function MOONPlaceholder() {
  return new THREE.Vector3(-0.33, 0.4, -0.85).normalize();
}

/** 岸上的桃柳、苇丛会用到同一套 M 之外材质 */
export const shoreMats = {
  get grass() { return shoreMats._g || (shoreMats._g = lit('#31413a', { rough: 0.98 })); },
  get stone() { return M.stone; },
};
