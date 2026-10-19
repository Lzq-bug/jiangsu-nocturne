import * as THREE from 'three';
import { M, mesh } from '../../src/kit.js';
import * as T from '../../src/textures.js';
import { YARD, MOON_FLOOD } from './data.js';
import { MOON } from './environment.js';
import { MY } from './parts.js';

const WATER_Y = MY.waterY;
const P = YARD.pond;

/** 池形：一圈带谐波起伏的岸线，不是规整的椭圆 */
export function pondOutline(seg = 64) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const k = 1 + 0.15 * Math.sin(a * 3 + 0.6) + 0.09 * Math.cos(a * 5 + 1.9) + 0.05 * Math.sin(a * 7);
    pts.push(new THREE.Vector2(P.cx + Math.cos(a) * P.rx * k, P.cz + Math.sin(a) * P.rz * k));
  }
  return pts;
}

function pondShape(inset = 0) {
  const pts = pondOutline();
  const shape = new THREE.Shape();
  // ShapeGeometry 的 y 在 rotateX(-90°) 之后落到世界的 -z，这里先翻回来
  pts.forEach((p, i) => {
    const x = p.x + (p.x - P.cx) * (-inset / P.rx);
    const y = -(p.y + (p.y - P.cz) * (-inset / P.rz));
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

/** 水面：静池的细纹、月碎、以及从月洞门那边推过来的一层浪 */
export function buildPond(scene, columns) {
  const shape = pondShape();
  const geo = new THREE.ShapeGeometry(shape, 24);
  // 与铺地挖洞同一套换算：shape 的 y 是 -z，翻上来法线才朝上
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();

  const uni = {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uMoon: { value: MOON.clone() },
    uFlood: MY.flood,
    uSrc: { value: new THREE.Vector2(MOON_FLOOD.from[0], MOON_FLOOD.from[1]) },
    uDeep: { value: new THREE.Color('#020610') },
    uShallow: { value: new THREE.Color('#16304a') },
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
        float h = sin(p.x*0.9 + uTime*0.7)*0.022 + sin(p.y*1.25 - uTime*0.55)*0.018
                + sin((p.x+p.y)*2.3 + uTime*1.2)*0.008;
        wp.y += h * uRipple;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uRipple; uniform float uFlood;
      uniform vec3 uMoon; uniform vec2 uSrc;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform sampler2D uNoise;
      varying vec3 vW;

      vec3 skyAt(vec3 d){
        float up = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(vec3(0.010,0.014,0.028), vec3(0.016,0.022,0.048), smoothstep(0.0,0.5,up));
        col += vec3(0.030,0.022,0.012) * pow(clamp(1.0-abs(d.y)*2.2,0.0,1.0), 2.4);
        col += vec3(0.030,0.036,0.056) * pow(max(dot(d, uMoon),0.0), 24.0);
        return col;
      }
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        float dx = cos(p.x*0.9 + t*0.7)*0.9*0.022 + cos((p.x+p.y)*2.3 + t*1.2)*2.3*0.008;
        float dz = cos(p.y*1.25 - t*0.55)*1.25*0.018 + cos((p.x+p.y)*2.3 + t*1.2)*2.3*0.008;
        float c1 = sin(p.x*3.6 + t*1.9) * sin(p.y*3.1 - t*1.6);
        float c2 = sin(p.x*6.2 - t*2.3 + p.y*4.4) * 0.6;
        dx += (c1*3.6 + c2*6.2) * 0.0032 * uRipple;
        dz += (cos(p.x*3.1 - t*1.4)*3.1*0.85 + c2*4.4) * 0.0032 * uRipple;
        vec3 n = normalize(vec3(-dx*uRipple, 1.0, -dz*uRipple));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 r = reflect(-V, n);
        vec3 col = mix(uDeep, uShallow, 0.14 + 0.22*fres);
        // 俯视时也要接住一点天光，否则池子在天际线里是一个黑洞
        col = mix(col, skyAt(normalize(r)) * 0.95, 0.34 + 0.45*fres);

        vec3 H = normalize(V + uMoon);
        float ndh = max(dot(n, H), 0.0);
        // 一轮月落在水里：越近水面掠射越散
        float disc = smoothstep(0.99985, 0.999955, dot(normalize(r), uMoon));
        col += vec3(1.35, 1.32, 1.16) * disc * (0.5 + 0.9*fres);
        col += vec3(0.42,0.48,0.62) * pow(ndh, 300.0) * 0.9;
        col += vec3(0.14,0.18,0.28) * pow(ndh, 40.0) * 0.5;

        float sparkle = pow(max(0.0, sin(p.x*9.1 + t*2.2) * sin(p.y*8.3 - t*1.7)), 14.0);
        col += vec3(0.30,0.33,0.38) * sparkle * 0.05 * uRipple;

        // 泛月：池心先亮，跟着把浪纹描出来
        float d = length(p - uSrc);
        float band = sin(p.y*5.4 + 2.2*sin(p.x*1.1 + t*0.2) - t*1.3);
        col += vec3(0.34,0.42,0.62) * pow(max(band,0.0),6.0) * uFlood * 0.5 * smoothstep(16.0, 3.0, d);

        float nsh = texture2D(uNoise, p*0.09 + vec2(t*0.012, -t*0.02)).r;
        col *= 0.96 + nsh*0.09;

        float a = clamp(0.86 + fres*0.12, 0.0, 0.97);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
      }`,
  });

  const water = new THREE.Mesh(geo, mat);
  water.position.y = WATER_Y;
  water.renderOrder = 3;
  water.name = 'pond';
  scene.add(water);

  // 池底与岸边：水浅的地方看得见底
  const bed = new THREE.Mesh(new THREE.ShapeGeometry(pondShape(-0.2), 16), new THREE.MeshStandardMaterial({
    color: '#1b2028', map: T.stone('#232a33'), roughness: 0.98, emissive: '#050810', emissiveIntensity: 0.4,
  }));
  bed.rotateX(-Math.PI / 2);
  bed.position.y = P.depth;
  bed.receiveShadow = true;
  scene.add(bed);

  scene.add(pondBank());

  // 池西一只石潭：水面上的圈是从这里荡开的
  const spring = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.5, 14), M.stoneDressed);
  basin.position.y = 0.24;
  spring.add(basin);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 14), new THREE.MeshStandardMaterial({
    color: '#0e1a22', roughness: 0.35, metalness: 0.2, emissive: '#0a1420', emissiveIntensity: 0.6,
  }));
  mouth.position.y = 0.5;
  spring.add(mouth);
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.2, 22),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#cfe4ff').multiplyScalar(1.2), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }),
    );
    ring.material.toneMapped = false;
    ring.rotateX(-Math.PI / 2);
    ring.position.y = 0.52;
    ring.userData.phase = i / 4;
    rings.push(ring);
    spring.add(ring);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.4, 10), M.huangshi);
  cap.position.set(0.9, 0.2, 0.6);
  spring.add(cap);
  spring.position.set(P.cx - P.rx * 0.8, 0, P.cz + 1.1);
  scene.add(spring);

  // 池里的灯柱倒影交给 columns
  for (const [x, z, color, w, dp] of [
    [YARD.fanPavilion.x, YARD.fanPavilion.z + 1.2, '#ffc88a', 1.5, 6.5],
    [P.cx - 2.5, P.cz + 2.0, '#ff9e6a', 1.1, 5],
    [P.cx - P.rx * 0.8 + 1.2, P.cz - 0.6, '#ffd79b', 1.0, 4.2],
    [P.cx - 3.4, P.cz - 2.6, '#ffb877', 0.9, 4.6],
    [P.cx + 2.8, P.cz - 2.2, '#ffcf94', 0.9, 4.6],
    [P.cx + 0.4, P.cz - 3.2, '#ffd7a8', 1.2, 5.6],
    [P.cx - 5.2, P.cz + 0.4, '#ff9f52', 0.8, 3.8],
  ]) columns.add(new THREE.Vector3(x, 0, z), color, w, dp, 0.9);

  return {
    water, uni, spring,
    update(t, ripple) {
      uni.uTime.value = t;
      uni.uRipple.value = ripple;
      MY.time.value = t;
      for (const ring of rings) {
        const k = ((t * 0.32 + ring.userData.phase) % 1);
        ring.scale.setScalar(0.5 + k * 2.4);
        ring.material.opacity = 0.5 * (1 - k) * Math.min(1, ripple);
      }
    },
  };
}

/** 驳岸：沿岸线压一圈黄石，脚下再散几块 */
function pondBank() {
  const grp = new THREE.Group();
  const pts = pondOutline(40);
  for (let i = 0; i < pts.length; i++) {
    if (i % 2) continue;
    const p = pts[i], q = pts[(i + 3) % pts.length];
    const dir = Math.atan2(q.y - p.y, q.x - p.x);
    const len = 1.1 + ((i * 7919) % 11) / 11 * 1.1;
    const h = 0.26 + ((i * 104729) % 7) / 7 * 0.22;
    const slab = mesh(new THREE.BoxGeometry(len, h, 0.5), M.huangshi);
    // 压进水里一点，岸线才不像摆了一圈木箱
    slab.position.set(p.x + (p.x - P.cx) * -0.02, h * 0.26, p.y + (p.y - P.cz) * -0.02);
    slab.rotation.y = -dir;
    slab.rotation.z = ((i % 5) - 2) * 0.02;
    slab.castShadow = true; slab.receiveShadow = true;
    grp.add(slab);
  }
  // 压角的汀步与两块大石
  for (const [x, z, s] of [[P.cx + P.rx * 0.7, P.cz - P.rz * 0.8, 1.4], [P.cx - P.rx * 0.9, P.cz + P.rz * 0.4, 1.7]]) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), M.huangshi);
    const pa = rock.geometry.attributes.position;
    for (let v = 0; v < pa.count; v++) pa.setXYZ(v, pa.getX(v), pa.getY(v) * 0.72, pa.getZ(v));
    rock.geometry.computeVertexNormals();
    rock.scale.setScalar(0.52);
    rock.position.set(x, s * 0.2, z);
    rock.rotation.y = x;
    rock.castShadow = true; rock.receiveShadow = true;
    grp.add(rock);
  }
  return grp;
}

/* ---------------------------------------------------- 灯柱与倒影（小型化） */

/** 水里被拖长的一道道灯影 */
export class LightColumns {
  constructor(scene) {
    this.items = [];
    this.dirty = true;
    const geo = new THREE.PlaneGeometry(1, 1);
    const map = T.columnFade();
    map.flipY = false;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uTime: { value: 0 }, uRipple: { value: 1 }, uMap: { value: map },
        uStrength: { value: 1 }, uDepth: { value: 1 },
      },
      vertexShader: `
        uniform float uTime; uniform float uRipple;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float wob = sin(wp.z*0.9 + uTime*1.9) * 0.22 + sin(wp.x*1.2 - uTime*1.35) * 0.18;
          float t = 1.0 - uv.y;
          vec3 pos = wp.xyz + right * ((uv.x-0.5) * sx * (0.42 + 0.9*t))
                             + vec3(0.0,1.0,0.0) * (-uv.y * sy)
                             + right * wob * uRipple * t * 0.5;
          vUv = uv; vCol = instanceColor;
          vFlick = 0.74 + 0.26*sin(uTime*2.5 + wp.x*2.1 + wp.z*2.7);
          gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uStrength; uniform float uDepth;
        varying vec2 vUv; varying vec3 vCol; varying float vFlick;
        void main(){
          float m = texture2D(uMap, vUv).a;
          float fade = smoothstep(1.0, 0.1, vUv.y);
          gl_FragColor = vec4(vCol * uDepth, m * fade * vFlick * uStrength);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 64);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3).fill(1), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
  }
  add(pos, color, width = 1, depth = 6, intensity = 1) {
    if (this.items.length >= 64) return -1;
    this.items.push({
      pos: pos.clone(), color: new THREE.Color(color).multiplyScalar(intensity), width, depth,
    });
    this.dirty = true;
    return this.items.length - 1;
  }
  flush() {
    const d = this.dummy;
    this.items.forEach((it, i) => {
      d.position.set(it.pos.x, WATER_Y - 0.04, it.pos.z);
      d.scale.set(it.width, it.depth, 1);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.mesh.setColorAt(i, it.color);
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = false;
  }
  update(t, ripple, strength) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uRipple.value = ripple;
    this.mat.uniforms.uStrength.value = strength;
    if (this.dirty) this.flush();
  }
}

/** 镜像：把建筑倒进池子，顶点抖一抖就是水波 */
class Wobble {
  constructor() {
    this.time = { value: 0 };
    this.ripple = { value: 1 };
    this.cache = new Map();
  }
  material(src) {
    if (this.cache.has(src.uuid)) return this.cache.get(src.uuid);
    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.32);
    const m = new THREE.MeshBasicMaterial({
      color: c, map: src.map || null, transparent: true, opacity: 0.26,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    m.toneMapped = false;
    const wobble = this;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wobble.time;
      shader.uniforms.uRipple = wobble.ripple;
      shader.vertexShader = `uniform float uTime; uniform float uRipple;\n` +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          transformed.x += (sin(transformed.y*1.1 + uTime*1.7) + sin(transformed.z*1.7 - uTime*1.1)) * 0.055 * uRipple;
          transformed.z += (sin(transformed.y*0.9 - uTime*1.3) + sin(transformed.x*1.5 + uTime*1.9)) * 0.045 * uRipple;
        `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
        #include <dithering_fragment>
        gl_FragColor.a *= smoothstep(-7.0, -0.2, vWorldPos.y) * 0.9 + 0.1;
      `);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', 'varying vec3 vWorldPos;\n#include <common>');
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vWorldPos = (modelMatrix * vec4(transformed,1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', 'varying vec3 vWorldPos;\n#include <common>');
    };
    m.customProgramCacheKey = () => 'mingyue-wobble';
    this.cache.set(src.uuid, m);
    return m;
  }
}

export class Reflections {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'pond-reflections';
    this.wobble = new Wobble();
    this.mirror = new THREE.Group();
    this.mirror.scale.set(1, -1, 1);
    this.mirror.position.y = 2 * WATER_Y;
    this.root.add(this.mirror);
    scene.add(this.root);
    this.pairs = [];
  }
  add(source) {
    const clone = source.clone(true);
    clone.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = false;
      o.material = this.wobble.material(o.material);
    });
    this.mirror.add(clone);
    this.pairs.push([source, clone]);
    return clone;
  }
  set enabled(v) { this.root.visible = v; }
  get enabled() { return this.root.visible; }
  update(t, ripple) {
    this.wobble.time.value = t;
    this.wobble.ripple.value = ripple;
    for (const [src, clone] of this.pairs) {
      clone.position.copy(src.position);
      clone.rotation.copy(src.rotation);
      clone.scale.copy(src.scale);
    }
  }
}
