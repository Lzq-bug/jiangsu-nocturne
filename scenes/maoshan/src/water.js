/**
 * 东进水库：一汪静水 + 岸灯的竖直光带。
 *
 * 不做平面反射——SwiftShader 下多一趟渲染太贵；夜里水面靠"灯落在水里拉成一条"读出来，
 * 用的是根目录 textures.columnFade 的竖直渐隐贴图，加色贴在几片薄面上。
 * 1966 年建水库时崇禧万寿宫宫址全部淹没、2016 年迁建开放（可考）；水面大小与岸线写意。
 */
import * as THREE from 'three';
import { PAL, glow } from '../../src/kit.js';
import * as TX from '../../src/textures.js';
import { LAKE, WATER_Y, WANSHOU } from './data.js';
import { heightAt } from './relief.js';

function lakeSurface() {
  const uni = {
    uTime: { value: 0 }, uMoon: { value: new THREE.Vector3(-0.52, 0.46, -0.72).normalize() },
    uRx: { value: LAKE.rx }, uRz: { value: LAKE.rz },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: uni,
    vertexShader: `varying vec2 vP;
      void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vP; uniform float uTime, uRx, uRz; uniform vec3 uMoon;
      float h(vec2 p){ return fract(sin(dot(p, vec2(21.7,73.3)))*39571.243); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 e = vP / vec2(uRx, uRz);
        float edge = 1.0 - smoothstep(0.82, 1.0, length(e));
        if (edge <= 0.001) discard;
        vec2 q = vP * vec2(9.0, 7.0);
        float r = n(q + vec2(uTime*0.06, 0.0)) * 0.6 + n(q*2.6 - vec2(0.0, uTime*0.11)) * 0.4;
        vec3 col = mix(vec3(0.018,0.030,0.048), vec3(0.05,0.07,0.10), r);
        // 月在水面拉出一道碎光
        float streak = pow(max(0.0, 1.0 - abs(e.x * 0.9 + e.y * 0.28)), 3.0);
        col += vec3(0.10,0.12,0.15) * streak * (0.5 + 0.6*r);
        gl_FragColor = vec4(col, edge * (0.82 + 0.18 * r));
      }`,
  });
  const g = new THREE.PlaneGeometry(LAKE.rx * 2, LAKE.rz * 2, 1, 1);
  const mesh = new THREE.Mesh(g, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(LAKE.x, WATER_Y, LAKE.z);
  return { mesh, uni };
}

/** 把一处灯影"落"进水里：几片竖直的渐隐薄面 */
function lightColumns(scene, seeds) {
  const tex = TX.columnFade();
  const grp = new THREE.Group();
  const items = [];
  for (const [x, z, color, w, h] of seeds) {
    const m = new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color(color).multiplyScalar(1.5), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    m.toneMapped = false;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    plane.position.set(x, WATER_Y + h * 0.5 - 0.6, z);
    plane.rotation.y = Math.PI / 2;
    grp.add(plane);
    items.push(plane);
  }
  scene.add(grp);
  return {
    grp,
    update(t) {
      items.forEach((p, i) => {
        p.material.opacity = 0.5 + 0.32 * Math.sin(t * 0.9 + i * 1.3);
      });
    },
    setBright(v) { grp.visible = v > 0.03; },
  };
}

export function buildWater(scene) {
  const lake = lakeSurface();
  scene.add(lake.mesh);
  // 岸线：库区边的堤与几处灯位
  const seeds = [];
  for (let i = 0; i < 9; i++) {
    const a = -0.9 + (i / 8) * 1.9;
    const x = LAKE.x + Math.sin(a) * LAKE.rx * 0.78 + LAKE.rx * 0.2;
    const z = LAKE.z + Math.cos(a) * LAKE.rz * 0.7;
    if (heightAt(x, z) < WATER_Y + 1) continue;
    seeds.push([x, z, i % 3 === 0 ? '#ff8a5c' : PAL.lanternWarm, 5 + (i % 3) * 2, 16 + (i % 4) * 5]);
  }
  // 红庙自己的一列灯影
  seeds.push([WANSHOU.x - 20, WANSHOU.z + 26, '#ff8a5c', 9, 26]);
  const columns = lightColumns(scene, seeds);
  return { lake, columns };
}

export { glow };
