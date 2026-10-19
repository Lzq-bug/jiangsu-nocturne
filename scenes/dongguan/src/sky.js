import * as THREE from 'three';
import { CANAL, PLAZA, STREET } from './data.js';
import { PAL, rgb, rand, initMaterials } from './kit.js';
import * as T from './textures.js';

/** 月亮挂在运河上空的东北向：西口机位望东时它落在屋顶之上，古渡机位则逆光 */
export const MOON_DIR = new THREE.Vector3(0.52, 0.36, -0.48).normalize();

export const FOG_COLOR = new THREE.Color('#0d1117');
export const FOG_DENSITY = 0.0034;

/**
 * 夜景天光：一枚渐变的内衬穹顶 + 星点 + 月。
 * 地平线在街的中段（东端渡口方向）偏暖，那是灯河把天空底面照亮的一带；
 * 另一边偏冷，是月光与水气。
 */
export function buildSky(scene) {
  initMaterials();

  const group = new THREE.Group();
  group.name = 'sky';
  scene.add(group);

  const uni = {
    uMoon: { value: MOON_DIR.clone() },
    uWarm: { value: new THREE.Color('#2a1b10') },
    uCold: { value: new THREE.Color('#070c16') },
    uZenith: { value: new THREE.Color('#04060c') },
    uCenter: { value: new THREE.Vector3((STREET.x1 + CANAL.x1) * 0.5, 0, 0) },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
      vertexShader: `
        varying vec3 vW;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uMoon; uniform vec3 uWarm; uniform vec3 uCold; uniform vec3 uZenith;
        uniform vec3 uCenter;
        varying vec3 vW;
        void main(){
          vec3 d = normalize(vW - cameraPosition);
          float up = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uCold, uZenith, smoothstep(0.02, 0.55, up));
          // 灯河把街心的天空底面染暖，越贴近地平线越强
          vec3 flat = normalize(vec3(d.x, 0.0, d.z));
          vec3 toTown = normalize(vec3(uCenter.x - cameraPosition.x, 0.0, uCenter.z - cameraPosition.z));
          float town = pow(clamp(dot(flat, toTown), 0.0, 1.0), 2.0);
          col += uWarm * town * pow(1.0 - up, 6.0) * 1.5;
          col += uWarm * 0.35 * pow(1.0 - up, 12.0);
          col += vec3(0.06, 0.09, 0.15) * pow(max(0.0, dot(d, uMoon)), 220.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -2;
  group.add(dome);

  /* 星点 */
  const N = 900;
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(N * 3);
  const sc = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.06 + Math.pow(rand(), 0.7) * 0.9;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    sp[i * 3] = Math.cos(a) * r * 1250;
    sp[i * 3 + 1] = y * 1250;
    sp[i * 3 + 2] = Math.sin(a) * r * 1250;
    const k = 0.35 + rand() * 0.65;
    const warm = rand() < 0.25;
    sc[i * 3] = k * (warm ? 1 : 0.82);
    sc[i * 3 + 1] = k * (warm ? 0.9 : 0.88);
    sc[i * 3 + 2] = k;
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({
    size: 2.4, sizeAttenuation: false, vertexColors: true,
    map: T.softGlow('210,225,255', 0.05), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  stars.material.toneMapped = false;
  stars.renderOrder = -1;
  group.add(stars);

  /* 月 */
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('200,220,255', 0.06), color: rgb('#dff0ff'), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  moon.material.toneMapped = false;
  moon.scale.setScalar(190);
  moon.position.copy(MOON_DIR).multiplyScalar(1150);
  group.add(moon);

  const moonCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('235,242,255', 0.3), color: rgb('#f2f7ff'), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  moonCore.material.toneMapped = false;
  moonCore.scale.setScalar(42);
  moonCore.position.copy(moon.position);
  group.add(moonCore);

  /* 灯光 */
  const hemi = new THREE.HemisphereLight(rgb('#171f2e'), rgb('#3b2310'), 0.6);
  scene.add(hemi);

  const moonLight = new THREE.DirectionalLight(rgb('#b9d0ff'), 0.95);
  moonLight.position.copy(MOON_DIR).multiplyScalar(600);
  scene.add(moonLight);

  // 街心那盏"总灯"：把所有檐灯的暖色近似回来，逐灯打光交给 props 里的几盏近光
  const streetWash = new THREE.PointLight(rgb('#ffb469'), 380, 340, 2.0);
  streetWash.position.set((STREET.x0 + PLAZA.x1) * 0.5, 7.5, 0);
  scene.add(streetWash);

  const wharfWash = new THREE.PointLight(rgb('#8fd0ff'), 320, 240, 2.0);
  wharfWash.position.set(CANAL.x0 + 8, 6, 12);
  scene.add(wharfWash);

  // 灯河打在两侧界面上的总光：点灯衰减太快铺不满三百米，用两盏近水平的暖色平行光近似
  const warmNorth = new THREE.DirectionalLight(rgb('#ff9a52'), 0.62);
  warmNorth.position.set((STREET.x0 + STREET.x1) / 2, 14, -46);
  warmNorth.target.position.set((STREET.x0 + STREET.x1) / 2, 4, 0);
  scene.add(warmNorth, warmNorth.target);

  const warmSouth = new THREE.DirectionalLight(rgb('#ff9a52'), 0.62);
  warmSouth.position.set((STREET.x0 + STREET.x1) / 2, 14, 46);
  warmSouth.target.position.set((STREET.x0 + STREET.x1) / 2, 4, 0);
  scene.add(warmSouth, warmSouth.target);

  scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), FOG_DENSITY);
  scene.background = new THREE.Color('#05080e');

  return {
    group, uni, stars, moon,
    lights: { hemi, moonLight, streetWash, wharfWash, warmNorth, warmSouth },
    setStarBright(k) { stars.material.opacity = Math.min(1, k); },
    update(t) {
      moonCore.material.opacity = 0.9 + 0.1 * Math.sin(t * 0.7);
    },
  };
}
