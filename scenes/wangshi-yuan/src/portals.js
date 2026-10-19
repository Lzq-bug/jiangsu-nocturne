/**
 * 门与口：大门、万卷堂、殿春簃、濯缨水阁——点光环进出，不必另设按钮。
 */
import * as THREE from 'three';
import { LAYOUT } from './architecture.js';
import { STATIONS, DECK } from './data.js';

const RANGE = 22;

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,14,26,0.58)';
  x.beginPath(); x.roundRect(18, 18, 220, 60, 30); x.fill();
  x.strokeStyle = 'rgba(168,207,224,0.85)'; x.lineWidth = 3; x.stroke();
  x.fillStyle = '#e4f1f8';
  x.font = '600 40px "KaiTi","STKaiti","Songti SC",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, sizeAttenuation: false });
  m.toneMapped = false;
  const s = new THREE.Sprite(m);
  s.scale.set(0.11, 0.041, 1);
  s.renderOrder = 21;
  return s;
}

const discMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform float uTime; varying vec2 vU;
    void main(){
      vec2 p = vU*2.0-1.0;
      float r = length(p);
      if (r > 1.0) discard;
      float a = atan(p.y, p.x);
      float swirl = 0.5 + 0.5*sin(a*3.0 + r*7.0 - uTime*1.8);
      float edge = smoothstep(1.0, 0.44, r);
      vec3 col = mix(vec3(0.16,0.40,0.52), vec3(0.78,0.92,0.98), swirl*0.55);
      col += vec3(0.30,0.18,0.05) * pow(1.0-r, 3.0);
      gl_FragColor = vec4(col * 1.45, edge * (0.20 + 0.24*swirl));
    }`,
});

function ring(text, pose, target, space) {
  const g = new THREE.Group();
  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#a8cfe0').multiplyScalar(1.7) }));
  torus.material.toneMapped = false;
  torus.material.fog = false;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.58, 28), discMat());
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.016, 6, 26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#2d5468').multiplyScalar(1.4) }));
  outer.material.toneMapped = false;
  const label = labelSprite(text);
  label.position.y = 1.0;
  g.add(torus, inner, outer, label);
  g.position.set(...pose.at);
  g.rotation.y = pose.face;
  g.userData = { target, space, hit: [torus, inner, outer] };
  return g;
}

export function buildPortals(scene, rig) {
  const st = (id) => STATIONS.find((s) => s.id === id);
  const hallOf = (key) => LAYOUT[key];
  const defs = [];

  // 大门：从巷里进府，穿过门厅落到轿前天井
  const gate = LAYOUT.gate;
  if (gate) {
    defs.push({
      id: 'gate',
      in: {
        at: [gate.front[0], DECK + 2.1, gate.front[1] - 1.2], face: Math.PI, text: '入府',
        target: { pos: st('jiaoting').pos, look: st('jiaoting').look },
      },
      out: {
        at: [21, DECK + 2.1, 38.6], face: 0, text: '出府',
        target: { pos: st('menfang').pos, look: st('menfang').look },
      },
    });
  }
  // 三处进得去的屋子：大厅、书斋、水阁
  for (const [key, stationId, name, faceSign] of [
    ['juanshuitang', 'juanshuitang', '入堂', 's'],
    ['dianshun', 'dianshun', '入簃', 's'],
    ['yanying', 'yanying', '登阁', 'n'],
  ]) {
    const b = hallOf(key);
    if (!b) continue;
    const s = st(stationId);
    const back = faceSign === 's' ? -1 : 1;
    const doorZ = faceSign === 's' ? b.cz + b.d / 2 + 0.7 : b.cz - b.d / 2 - 0.7;
    defs.push({
      id: key,
      in: {
        at: [b.cx, DECK + 2.2, doorZ], face: faceSign === 's' ? 0 : Math.PI, text: name,
        target: {
          pos: [b.cx, DECK + 1.62, b.cz - back * 0.8],
          look: [b.cx, DECK + 1.9, b.cz + back * (b.d / 2 - 0.6)],
        },
      },
      out: {
        at: [b.cx, DECK + 2.2, b.cz + back * (b.d / 2 - 1.0)], face: faceSign === 's' ? Math.PI : 0, text: '出去',
        target: { pos: s.pos, look: s.look },
      },
    });
  }

  const grp = new THREE.Group();
  grp.name = 'portals';
  const all = [];
  const mats = [];
  for (const d of defs) {
    const inRing = ring(d.in.text, d.in, d.in.target, d.id);
    const outRing = ring(d.out.text, d.out, d.out.target, d.id);
    inRing.userData.isIn = true;
    outRing.userData.isIn = false;
    grp.add(inRing, outRing);
    all.push(inRing, outRing);
    inRing.traverse((o) => o.material && o.material.uniforms && mats.push(o.material));
    outRing.traverse((o) => o.material && o.material.uniforms && mats.push(o.material));
  }
  scene.add(grp);

  let space = 'exterior';

  return {
    get space() { return space; },
    nearest(cameraPos) {
      let best = null, bd = 5.0;
      for (const p of all) {
        if (!p.visible) continue;
        const d = p.position.distanceTo(cameraPos);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    use(portal) {
      if (!portal) return false;
      const tg = portal.userData.target;
      space = portal.userData.isIn ? portal.userData.space : 'exterior';
      rig.goTo(tg.pos, tg.look, { animate: true, seconds: 1.35 });
      this.onSpace && this.onSpace(space);
      return true;
    },
    pick(ndc, camera) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(all.filter((p) => p.visible), true);
      for (const h of hits) {
        let o = h.object;
        while (o && !o.userData.target) o = o.parent;
        if (o) return o;
      }
      return null;
    },
    update(t, cameraPos) {
      for (const m of mats) m.uniforms.uTime.value = t;
      for (const p of all) {
        const wanted = p.userData.space === space ? !p.userData.isIn : (space === 'exterior' && p.userData.isIn);
        const near = p.position.distanceTo(cameraPos) < RANGE;
        p.visible = wanted && near;
      }
    },
  };
}
