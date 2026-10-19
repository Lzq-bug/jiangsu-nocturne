/**
 * Doorway portals between the riverside and the interiors — no extra station
 * buttons: you walk up to a glowing ring and click it (or press E when near).
 */
import * as THREE from 'three';
import { LAYOUT } from './architecture.js';
import { RIVER, STATIONS } from './data.js';

const Q = RIVER.quayY;
const RANGE = 46;

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(6,14,18,0.55)';
  x.beginPath(); x.roundRect(18, 18, 220, 60, 30); x.fill();
  x.strokeStyle = 'rgba(140,240,205,0.85)'; x.lineWidth = 3; x.stroke();
  x.fillStyle = '#d8fff0';
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
      float swirl = 0.5 + 0.5*sin(a*4.0 + r*8.0 - uTime*2.1);
      float edge = smoothstep(1.0, 0.42, r);
      vec3 col = mix(vec3(0.10,0.55,0.46), vec3(0.62,0.98,0.86), swirl*0.6);
      col += vec3(0.25,0.16,0.05) * pow(1.0-r, 3.0);
      gl_FragColor = vec4(col * 1.5, edge * (0.22 + 0.26*swirl));
    }`,
});

function ring(text, pose, target, space) {
  const g = new THREE.Group();
  const torus = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.075, 8, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ff0cd').multiplyScalar(1.7) }));
  torus.material.toneMapped = false;
  torus.material.fog = false;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.98, 28), discMat());
  const outer = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.02, 6, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color('#2f6f60').multiplyScalar(1.4) }));
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
  const t = LAYOUT.templeInterior;
  const gl = LAYOUT.gallery;
  const al = LAYOUT.alley;
  const dacheng = STATIONS.find((s) => s.id === 'dacheng');
  const gallery = STATIONS.find((s) => s.id === 'gallery');
  const gongyuan = STATIONS.find((s) => s.id === 'gongyuan');
  const taoye = STATIONS.find((s) => s.id === 'taoye');
  const b = (v) => boat.localToWorld(new THREE.Vector3(...v)).toArray();

  const defs = [
    {
      id: 'temple',
      in: { at: [t.doorX - 1.1, t.floorY + 2.4, 0], face: -Math.PI / 2, text: '入殿', target: { pos: [t.x0 + 5.2, t.floorY + 1.7, 0], look: [t.statueX, t.floorY + 2.7, 0] } },
      out: { at: [t.doorX + 1.3, t.floorY + 2.4, 0], face: Math.PI / 2, text: '出殿', target: { pos: dacheng.pos, look: dacheng.look } },
    },
    {
      id: 'gallery',
      in: { at: [gl.x0 + 1.4, Q + 2.35, -19], face: Math.PI / 2, text: '入廊', target: { pos: [(gl.x0 + gl.x1) / 2, gl.deckY + 1.75, -6], look: [gl.x0 + 1.4, gl.eaveY - 1.4, 30] } },
      out: { at: [gl.x0 + 1.4, gl.deckY + 2.25, -13], face: -Math.PI / 2, text: '出廊', target: { pos: gallery.pos, look: gallery.look } },
    },
    {
      id: 'cells',
      in: { at: [al.x, Q + 2.3, al.z0 - 2.4], face: Math.PI, text: '入号舍', target: { pos: [al.x, al.floorY + 1.68, al.z0 + 3.2], look: [al.x + 1.1, al.floorY + 1.25, al.z1 - 1] } },
      out: { at: [al.x, al.floorY + 2.3, al.z0 + 1.4], face: 0, text: '出号舍', target: { pos: gongyuan.pos, look: gongyuan.look } },
    },
    {
      id: 'boat',
      in: { at: b([0, 2.5, 6.9]), face: 0, text: '入舱', target: { pos: b([0, 2.72, 1.6]), look: b([0, 2.5, -6.5]) } },
      out: { at: b([0, 2.45, 4.4]), face: Math.PI, text: '出舱', target: { pos: taoye.pos, look: [-18.5, 3.4, -76] } },
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
    /** nearest usable ring, so the keyboard shortcut can act without aiming */
    nearest(cameraPos) {
      let best = null, bd = 7.5;
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
