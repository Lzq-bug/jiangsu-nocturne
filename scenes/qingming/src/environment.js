/**
 * 夜空、月、星与灯雾。只有一盏月光平行光投影，暖色补光用点光源，
 * 因为整个场景还要被倒影系统克隆一份，灯光数量直接影响帧时间。
 */
import * as THREE from 'three';
import { glow, rand, rr } from './kit.js';
import * as T from './textures.js';

/** 月亮挂在上游偏西：照亮桥的西北券面，桥洞里的暖光才对比得出来 */
export const MOON_DIR = new THREE.Vector3(-0.38, 0.46, 0.80).normalize();

export function stars(count = 1500, radius = 470) {
  const pos = new Float32Array(count * 3), size = new Float32Array(count), phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.06 + Math.pow(rand(), 0.6);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius], i * 3);
    size[i] = rr(0.6, 2.1);
    phase[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uGlow: { value: 1 } },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uGlow;
      varying float vA;
      void main(){ vA = uGlow*(0.35+0.65*pow(abs(sin(uTime*0.6+aPhase*6.28)),2.0));
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = min(4.0, aSize*1.9); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vA;
      void main(){ vec2 d = gl_PointCoord-0.5; float f = smoothstep(0.5,0.0,length(d));
        gl_FragColor = vec4(vec3(0.82,0.88,1.0)*f, f*vA*0.85); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return { pts, uni: m.uniforms };
}

function skyDome() {
  const geo = new THREE.SphereGeometry(496, 32, 20);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 },
      uLow: { value: new THREE.Color('#0a1122') },
      uHigh: { value: new THREE.Color('#03050d') },
      uHaze: { value: new THREE.Color('#2c2033') },
      uMoon: { value: MOON_DIR.clone() },
    },
    vertexShader: `varying vec3 vP; varying vec2 vUv;
      void main(){ vP = normalize(position); vUv = uv;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uLow, uHigh, uHaze, uMoon; uniform float uTime;
      varying vec3 vP; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1)))*43758.5453); }
      void main(){
        float h = clamp(vP.y, -0.05, 1.0);
        vec3 c = mix(uLow, uHigh, pow(clamp(h*1.5,0.0,1.0), 0.75));
        // 城市从地平线回上来的暖雾
        float haze = smoothstep(0.34, 0.0, h) * (0.55 + 0.45*hash(floor(vUv*90.0)));
        c += uHaze * haze * 0.75;
        // 月华
        float md = max(0.0, dot(normalize(vP), normalize(uMoon)));
        c += vec3(0.10,0.13,0.20) * pow(md, 42.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return { mesh, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const at = MOON_DIR.clone().multiplyScalar(430);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(11, 32), glow('#f4f1e2', 1.5));
  disc.position.copy(at);
  disc.lookAt(0, 0, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('232,238,255', 0.05),
    color: 0xbfd0ff, blending: THREE.AdditiveBlending, transparent: true,
    depthWrite: false, fog: false, opacity: 0.5, toneMapped: false,
  }));
  halo.position.copy(at);
  halo.scale.setScalar(150);
  grp.add(disc, halo);
  return grp;
}

/** 远处城里的回光：三片竖在水汽上的暖色薄板 */
function cityHaze(scene) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: T.cloudPuff(), color: 0xff9a52, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  mat.toneMapped = false;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(190, 60), mat);
    p.position.set(Math.cos(a) * 300, 14, Math.sin(a) * 300);
    p.lookAt(0, 14, 0);
    grp.add(p);
  }
  scene.add(grp);
  return grp;
}

export function buildEnvironment(scene) {
  const sky = skyDome();
  scene.add(sky.mesh);
  const star = stars();
  scene.add(star.pts);
  scene.add(moon());
  cityHaze(scene);

  const hemi = new THREE.HemisphereLight(0x41567f, 0x0b0e16, 0.6);
  const moonLight = new THREE.DirectionalLight(0xa9c4ff, 0.85);
  moonLight.position.copy(MOON_DIR).multiplyScalar(190);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  const sc = moonLight.shadow.camera;
  sc.left = -125; sc.right = 125; sc.top = 125; sc.bottom = -125; sc.near = 30; sc.far = 420;
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.42;
  scene.add(hemi, moonLight);

  // 从下游打上来的一笔冷光：不然桥的下游面是全黑的剪影
  const front = new THREE.DirectionalLight(0x36486e, 0.3);
  front.position.set(6, 16, -150);
  scene.add(front);

  // 两岸灯火抬起来的暖底光，够把屋檐和柱子从纯黑里拉出来
  const fills = [
    [[-16, 9, -46], 0xffa657, 120, 320],
    [[16, 9, 34], 0xffa657, 120, 300],
    [[0, 12.5, 0], 0xffc07a, 90, 150],
  ];
  for (const [p, c, dist, intensity] of fills) {
    const l = new THREE.PointLight(c, intensity, dist, 1.9);
    l.position.set(...p);
    scene.add(l);
  }

  scene.fog = new THREE.FogExp2(0x0a1020, 0.0046);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    setStarBright(v) { star.uni.uGlow.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
