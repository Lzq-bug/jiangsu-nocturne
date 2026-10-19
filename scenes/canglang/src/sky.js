import * as THREE from 'three';
import { glow, rand } from './kit.js';
import * as T from './textures.js';

/**
 * The moon hangs north-west, a little above the treeline: that is where the
 * 山巅对月 station looks, so the pavilion reads against its halo.
 */
export const MOON_DIR = new THREE.Vector3(-0.34, 0.5, -0.79).normalize();

/**
 * Night sky over an old city: thin indigo overhead, a warm sodium haze lying
 * along every horizon, the moon halo, and low cloud passing over it.
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
        vec3 zenith  = vec3(0.0038,0.0060,0.0140);
        vec3 mid     = vec3(0.0090,0.0130,0.0265);
        vec3 horizon = vec3(0.0230,0.0230,0.0300);
        vec3 col = mix(zenith, mid, smoothstep(0.5,0.84,up));
        col = mix(col, horizon, smoothstep(0.52,0.30,up));
        float sky = smoothstep(-0.06, 0.10, d.y);
        float haze = pow(clamp(1.0-abs(d.y)*2.4,0.0,1.0), 2.5) * sky;
        // the city presses in on all sides, hardest to the north where the streets are
        float north = smoothstep(0.25, -0.95, d.z);
        col += vec3(0.062,0.034,0.015) * haze * (0.46 + 0.95*north);
        col += vec3(0.012,0.028,0.040) * haze * exp(-pow((d.y-0.014)/0.05,2.0));
        // moon halo
        float md = max(0.0, dot(d, normalize(vec3(-0.34,0.5,-0.79))));
        col += vec3(0.050,0.060,0.086) * pow(md, 42.0) * 1.15 * sky;
        col += vec3(0.018,0.022,0.034) * pow(md, 8.0) * 0.6 * sky;
        // thin cloud, flattened and drifting
        float c = n(d.xz*3.4 + vec2(uTime*0.0026, uTime*0.0011)) * 0.62 + n(d.xz*9.5 - vec2(uTime*0.0045,0.0))*0.38;
        float cl = smoothstep(0.46,0.88,c) * smoothstep(0.015,0.30,d.y);
        col = mix(col, col + vec3(0.020,0.024,0.040), cl);
        col = mix(col, vec3(0.0026,0.0036,0.0068), smoothstep(0.0, -0.07, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(820, 40, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return { mesh: m, uni };
}

/** a light-polluted city sky keeps only the brighter stars */
function stars() {
  const N = 520, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rand() * Math.PI * 2;
    const y = 0.24 + Math.pow(rand(), 0.8) * 0.76;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(a) * r * 760, y * 760, Math.sin(a) * r * 760], i * 3);
    size[i] = 0.5 + Math.pow(rand(), 4) * 2.1;
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
      uTex: { value: T.softGlow('210,225,245', 0.05) },
    },
    vertexShader: `attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uBright;
      varying float vA;
      void main(){ vA = (0.45+0.55*sin(uTime*1.3+aPhase)) * uBright;
        gl_PointSize = aSize*(1.0+vA*0.6); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.84,0.88,0.98), t.a*vA*0.5); }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return { mesh: p, uni: m.uniforms };
}

function moon() {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(7.2, 24, 16), glow('#fff4d8', 2.0));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.softGlow('255,240,208', 0.08), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(120, 120, 1);
  grp.add(disc, halo);
  grp.position.copy(MOON_DIR).multiplyScalar(700);
  return grp;
}

export function buildSky(scene) {
  const sky = skyDome();
  const star = stars();
  scene.add(sky.mesh, star.mesh, moon());

  const hemi = new THREE.HemisphereLight(0x3a5872, 0x0f1416, 0.86);
  const moonLight = new THREE.DirectionalLight(0xc2d8f7, 1.6);
  moonLight.position.copy(MOON_DIR).multiplyScalar(260);
  // the city lifts a warm bounce from the north, the streets behind the wall
  const cityBack = new THREE.DirectionalLight(0xffa066, 0.24);
  cityBack.position.set(-40, 40, -220);
  cityBack.target.position.set(0, 6, 0);
  // and a faint cool fill from the open south so the shaded faces are not flat black
  const fill = new THREE.DirectionalLight(0x86aab4, 0.34);
  fill.position.set(60, 90, 200);
  fill.target.position.set(-6, 6, 6);
  scene.add(hemi, moonLight, cityBack, cityBack.target, fill, fill.target);

  scene.fog = new THREE.FogExp2(0x0a1418, 0.0038);

  return {
    uni: { sky: sky.uni, stars: star.uni },
    lights: { hemi, moonLight, cityBack, fill },
    setStarBright(v) { star.uni.uBright.value = v; },
    update(t) {
      sky.uni.uTime.value = t;
      star.uni.uTime.value = t;
    },
  };
}
