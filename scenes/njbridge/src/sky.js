import * as THREE from 'three';
import { rand } from './kit.js';
import * as T from './textures.js';

/**
 * 月落在下游江面之上、抬得不高：这样钢梁的腹板能吃一层斜光，
 * 江面上留得出一条通到桥底的月路，而两岸的城灯把地平线压成两条暖带。
 */
export const MOON_DIR = new THREE.Vector3(0.86, 0.315, -0.4).normalize();

/**
 * Night sky: thin indigo overhead, a sodium haze lying along both banks
 * (the city lines the river east and west of the bridge, so the near horizon
 * is bright toward ±z and the open channel toward ±x stays dark), moon, stars.
 */
function skyDome() {
  const uni = {
    uTime: { value: 0 },
    uMoon: { value: MOON_DIR.clone() },
    uNoise: { value: T.noise() },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: `
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uMoon; uniform sampler2D uNoise;
      varying vec3 vP;
      void main(){
        vec3 d = normalize(vP);
        float up = clamp(d.y*0.5+0.5, 0.0, 1.0);
        vec3 col = mix(vec3(0.0035,0.0052,0.0108), vec3(0.0075,0.0122,0.0230), smoothstep(0.5,0.86,up));

        // 两岸城灯把近地压亮，江心两侧（±x）保持暗
        float bank = abs(d.z);
        float h = pow(clamp(1.0 - abs(d.y)*3.1, 0.0, 1.0), 3.0);
        col += vec3(0.052,0.030,0.017) * h * (0.16 + 1.15*bank*bank);
        col += vec3(0.010,0.020,0.030) * h * (1.0-bank) * 0.5;

        // 月与它的一层薄晕
        float md = max(0.0, dot(d, uMoon));
        col += vec3(0.16,0.19,0.24) * pow(md, 2200.0);
        col += vec3(0.030,0.038,0.052) * pow(md, 22.0);

        // 低云：一层横拖的噪声，压在月路上方，别把星全遮住
        // 用方位/仰角采噪声：直接拿 d.xz 采会把天顶拉成一条条火舌状的糊块
        float az = atan(d.z, d.x); float el = asin(clamp(d.y, -1.0, 1.0));
        float cl = texture2D(uNoise, vec2(az*1.7 + uTime*0.0035, el*2.6)).r;
        float band = smoothstep(0.05, 0.34, d.y) * (1.0 - smoothstep(0.40, 0.80, d.y));
        float cloud = smoothstep(0.56, 0.92, cl) * band;
        col = mix(col, col + vec3(0.009,0.012,0.018), cloud*0.55);
        col += vec3(0.026,0.032,0.042) * cloud * pow(md, 6.0);

        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return mat;
}

function stars(scene) {
  const n = 1100;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // 上半球，靠地平线的稀一些（被雾与城灯吃掉）
    let x, y, z;
    do {
      x = rand() * 2 - 1; y = rand(); z = rand() * 2 - 1;
    } while (Math.hypot(x, y, z) > 1 || y < 0.06);
    const k = 3800 / Math.hypot(x, y, z);
    pos[i * 3] = x * k; pos[i * 3 + 1] = y * k; pos[i * 3 + 2] = z * k;
    const b = 0.25 + rand() * 0.6 * Math.min(1, y * 2.6);
    const warm = rand();
    col[i * 3] = b * (0.8 + warm * 0.2);
    col[i * 3 + 1] = b * 0.88;
    col[i * 3 + 2] = b * (0.95 + (1 - warm) * 0.05);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true,
    opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  });
  m.toneMapped = false;
  const p = new THREE.Points(g, m);
  p.name = 'stars';
  scene.add(p);
  return { p, m };
}

export function buildSky(scene) {
  const mat = skyDome();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5200, 40, 24), mat);
  dome.name = 'sky';
  scene.add(dome);

  const moonPos = MOON_DIR.clone().multiplyScalar(4200);
  const mk = (hue, size, opacity) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.softGlow(hue, 0.06), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, opacity,
    }));
    sp.material.toneMapped = false;
    sp.position.copy(moonPos);
    sp.scale.set(size, size, 1);
    sp.name = 'moon-halo';
    scene.add(sp);
    return sp;
  };
  const halo = mk('212,228,248', 1180, 0.34);
  const disc = mk('236,242,250', 210, 0.92);

  const st = stars(scene);
  return {
    dome, moon: disc, halo,
    update(t) {
      mat.uniforms.uTime.value = t;
      // 星在薄云与月晕后面该闪一下，给静帧一点活气
      st.m.opacity = 0.82 + 0.08 * Math.sin(t * 0.7);
    },
  };
}
