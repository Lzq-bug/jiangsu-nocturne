import * as THREE from 'three';
import { glow, rand } from './kit.js';
import * as T from './textures.js';

/** the moon hangs to the north-west, beside the gate in the lake-facing shot */
export const MOON_DIR = new THREE.Vector3(-0.62, 0.44, -0.65).normalize();

/**
 * Night sky over a city lake: deep indigo at the zenith, a bright sodium-and-
 * cyan glow pooled at the horizon, moon halo, thin cloud.
 */
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
        vec3 zenith = vec3(0.0045,0.0068,0.017);
        vec3 mid    = vec3(0.010,0.015,0.034);
        vec3 horizon= vec3(0.030,0.030,0.040);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.82,up));
        col = mix(col, horizon, smoothstep(0.52,0.30,up));
        float sky = smoothstep(-0.05, 0.10, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.1,0.0,1.0), 2.4) * sky;
        // the city lies to the west (-z) and along both shores: warm sodium glow
        float west = smoothstep(0.35, -0.95, d.z);
        float band = exp(-pow((d.y-0.012)/0.055, 2.0));
        col += vec3(0.075,0.041,0.017) * haze * (0.42 + 1.05*west);
        col += vec3(0.018,0.040,0.058) * haze * band * 0.9;
        // moon halo
        float md = max(0.0, dot(d, normalize(vec3(-0.62,0.44,-0.65))));
        col += vec3(0.048,0.058,0.088) * pow(md, 34.0) * 1.1 * sky;
        col += vec3(0.020,0.024,0.038) * pow(md, 7.0) * 0.55 * sky;
        // drifting cloud, flattened
        float c = n(d.xz*4.2 + vec2(uTime*0.0035, uTime*0.0012)) * 0.62 + n(d.xz*11.0 - vec2(uTime*0.006,0.0))*0.38;
        float cl = smoothstep(0.44,0.86,c) * smoothstep(0.01,0.26,d.y);
        col = mix(col, col + vec3(0.020,0.026,0.044), cl);
        col = mix(col, vec3(0.0032,0.0042,0.0085), smoothstep(0.0, -0.06, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(3200, 40, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return { mesh: m, uni };
}

function stars() {
  const N = 950, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.08 + Math.pow(rand(), 0.72) * 0.9;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 2900, y * 2900, Math.sin(a) * r * 2900], i * 3);
    size[i] = 0.6 + Math.pow(rand(), 4) * 2.4;
    phase[i] = rand() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uBright: { value: 1 },
      uTex: { value: T.softGlow('210,225,255', 0.05) },
    },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.4+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.86,0.9,1.0), t.a*vA*0.55); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(23, 26, 18), glow('#fff6dd', 2.0));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,205', 0.08), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(330, 330, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(2600);
  return grp;
}

export function buildSky(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon());

  const hemi = new THREE.HemisphereLight(0x38507e, 0x0a0e16, 0.55);
  const moonLight = new THREE.DirectionalLight(0x9fbfff, 0.6);
  moonLight.position.copy(MOON_DIR).multiplyScalar(900);
  scene.add(hemi, moonLight);

  // r160 lights fall off with distance squared, so the broad washes are directional
  const gateWash = new THREE.DirectionalLight(0x86c4ff, 0.42);
  gateWash.position.set(0, 240, 620);
  gateWash.target.position.set(0, 60, -60);
  const cityBack = new THREE.DirectionalLight(0xffa870, 0.3);
  cityBack.position.set(-140, 90, -520);
  cityBack.target.position.set(0, 40, 0);
  scene.add(gateWash, gateWash.target, cityBack, cityBack.target);

  // warm pools on the promenade, close enough for point lights to reach
  const shore = [];
  for (const x of [-300, -150, 0, 150, 300]) {
    const l = new THREE.PointLight(0xffbd7d, 900, 130, 2);
    l.position.set(x, 22, 92);
    scene.add(l);
    shore.push(l);
  }

  scene.fog = new THREE.FogExp2(0x0a1220, 0.00042);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    lights: { hemi, moonLight, gateWash, cityBack, shore },
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
