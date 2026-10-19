/**
 * 门与口：山门殿门、钟楼平座、客船船篷、碑廊——点光环进出，不必另设景点按钮。
 */
import * as THREE from 'three';
import { LAYOUT } from './architecture.js';
import { STATIONS, CANAL } from './data.js';

const Q = CANAL.deckY;
const RANGE = 42;

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
  const torus = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.075, 8, 26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#a8cfe0').multiplyScalar(1.7) }));
  torus.material.toneMapped = false;
  torus.material.fog = false;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.98, 28), discMat());
  const outer = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.02, 6, 26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#2d5468').multiplyScalar(1.4) }));
  outer.material.toneMapped = false;
  const label = labelSprite(text);
  label.position.y = 1.55;
  g.add(torus, inner, outer, label);
  g.position.set(...pose.at);
  g.rotation.y = pose.face;
  g.userData = { target, space, hit: [torus, inner, outer] };
  return g;
}

export function buildPortals(scene, rig, boat) {
  const hl = LAYOUT.hall;
  const bl = LAYOUT.bell;
  const st = LAYOUT.stele;
  const dacheng = STATIONS.find((s) => s.id === 'dacheng');
  const zhonglou = STATIONS.find((s) => s.id === 'zhonglou');
  const shanmen = STATIONS.find((s) => s.id === 'shanmen');
  const kechuan = STATIONS.find((s) => s.id === 'kechuan');
  const b = (v) => boat.localToWorld(new THREE.Vector3(...v)).toArray();

  const defs = [
    {
      id: 'hall',
      in: {
        at: [hl.frontX + 0.9, hl.floorY + 2.3, hl.cz], face: Math.PI / 2, text: '入殿',
        target: { pos: [hl.cx + 3.2, hl.floorY + 1.7, hl.cz], look: [hl.cx - 5.5, hl.floorY + 3.0, hl.cz] },
      },
      out: {
        at: [hl.cx + hl.w / 2 - 1.4, hl.floorY + 2.3, hl.cz], face: -Math.PI / 2, text: '出殿',
        target: { pos: dacheng.pos, look: dacheng.look },
      },
    },
    {
      id: 'bell',
      in: {
        at: [bl.cx, bl.deckY + 1.6, bl.cz - 5.6], face: 0, text: '登钟楼',
        target: { pos: [bl.cx, bl.deckY + 1.55, bl.cz - 1.9], look: [bl.bellPos.x, bl.bellPos.y + 0.9, bl.bellPos.z] },
      },
      out: {
        at: [bl.cx, bl.deckY + 1.6, bl.cz - 2.4], face: Math.PI, text: '下楼',
        target: { pos: zhonglou.pos, look: zhonglou.look },
      },
    },
    {
      id: 'stele',
      in: {
        at: [st.x, Q + 2.3, st.back - 1.4], face: Math.PI, text: '看碑',
        target: { pos: [st.x, Q + 2.55, st.z + 2.7], look: [st.x, Q + 2.6, st.z] },
      },
      out: {
        at: [st.x, Q + 2.3, st.z + 3.4], face: 0, text: '离碑',
        target: { pos: shanmen.pos, look: shanmen.look },
      },
    },
    {
      id: 'boat',
      in: {
        at: b([0, 1.85, 3.2]), face: Math.PI, text: '入舱',
        target: { pos: b([0, 1.62, 2.2]), look: b([0, 1.45, -6.2]) },
      },
      out: {
        at: b([0, 1.75, 1.2]), face: 0, text: '出舱',
        target: { pos: kechuan.pos, look: kechuan.look },
      },
    },
  ];

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

  const api = {
    get space() { return space; },
    nearest(cameraPos) {
      let best = null, bd = 7.0;
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
      api.onSpace && api.onSpace(space);
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
  return api;
}
