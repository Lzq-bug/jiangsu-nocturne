import * as THREE from 'three';
import { glow, rand } from './kit.js';
import * as T from './textures.js';

/**
 * 轴向：巷与河都呈东西向，河在巷北（+Z 为北，-Z 为南；+X 为西，-X 为东）。
 * 月低低地挂在西北，压在文亨桥那一头，所以从河坝望西时机位正对月痕——
 * 旧时"文亨穿月"要的就是这个角度：月从三个桥洞里穿过去。
 */
export const MOON_DIR = new THREE.Vector3(0.78, 0.2, 0.55).normalize();

/**
 * Night sky over a canal town: thin indigo zenith, a wide sodium pool where the
 * city sits behind the far bank, moon halo over the water, low cloud.
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
        vec3 zenith = vec3(0.0040,0.0056,0.0135);
        vec3 mid    = vec3(0.010,0.013,0.028);
        vec3 horizon= vec3(0.026,0.024,0.030);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.82,up));
        col = mix(col, horizon, smoothstep(0.52,0.30,up));
        float sky = smoothstep(-0.06, 0.10, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*1.9,0.0,1.0), 2.3) * sky;
        // the old town lies behind the lane (-z, south) and along the west (+x)
        float town = smoothstep(0.30, -0.90, -d.z)*0.95 + smoothstep(0.45, -0.88, d.x)*0.6;
        col += vec3(0.082,0.044,0.019) * haze * (0.35 + town);
        col += vec3(0.014,0.030,0.046) * haze * exp(-pow((d.y-0.010)/0.05,2.0)) * 0.8;
        // moon halo over the canal
        vec3 md = normalize(vec3(0.78,0.20,0.55));
        float m = max(0.0, dot(d, md));
        col += vec3(0.055,0.062,0.086) * pow(m, 40.0) * 1.2 * sky;
        col += vec3(0.022,0.024,0.034) * pow(m, 6.0) * 0.6 * sky;
        // drifting cloud, flattened against the roofline
        float c = n(d.xz*4.6 + vec2(uTime*0.0032, uTime*0.0011)) * 0.62 + n(d.xz*12.0 - vec2(uTime*0.0055,0.0))*0.38;
        float cl = smoothstep(0.42,0.86,c) * smoothstep(0.01,0.24,d.y);
        col = mix(col, col + vec3(0.024,0.026,0.040), cl);
        col = mix(col, vec3(0.0030,0.0038,0.0072), smoothstep(0.0, -0.07, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2400, 40, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return { mesh: m, uni };
}

function stars() {
  const N = 700, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.14 + Math.pow(rand(), 0.7) * 0.86;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 2100, y * 2100, Math.sin(a) * r * 2100], i * 3);
    size[i] = 0.6 + Math.pow(rand(), 4) * 2.2;
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
      uTex: { value: T.softGlow('215,228,250', 0.05) },
    },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.4+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.86,0.9,1.0), t.a*vA*0.5); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(17, 26, 18), glow('#fff4d6', 1.9));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,238,200', 0.08), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(250, 250, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(1950);
  return grp;
}

export function buildSky(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon());

  const hemi = new THREE.HemisphereLight(0x3b5378, 0x14110f, 0.8);
  const moonLight = new THREE.DirectionalLight(0xbcd4f6, 0.95);
  moonLight.position.copy(MOON_DIR).multiplyScalar(600);
  scene.add(hemi, moonLight);

  // r160 lights fall off with distance squared, so the broad washes are directional
  const cityWash = new THREE.DirectionalLight(0xffa870, 0.4);
  cityWash.position.set(120, 70, 520);
  cityWash.target.position.set(0, 12, -20);
  const laneFill = new THREE.DirectionalLight(0xffd3a2, 0.55);
  laneFill.position.set(-90, 40, -60);
  laneFill.target.position.set(0, 6, 0);
  scene.add(cityWash, cityWash.target, laneFill, laneFill.target);

  scene.fog = new THREE.FogExp2(0x10151d, 0.0016);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    lights: { hemi, moonLight, cityWash, laneFill },
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
