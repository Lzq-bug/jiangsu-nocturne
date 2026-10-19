import io

def edit(path, pairs, must=True):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            if must:
                raise SystemExit('NOT FOUND in %s: %r' % (path, old[:80]))
            continue
        s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8', newline='').write(s)
    print('ok', path)

# A 船体：rows 里的 y 偏移取错了对象，整条船的顶点全成 NaN
edit('src/boats.js', [
    ("      const y = s.yf + (r.k === 2 ? s.sheer * 0.18 : 0);",
     "      const y = r.yf + (r.k === 2 ? s.sheer * 0.18 : 0);"),
    ("    pos.push(s.x, s.yf + 0.62 + s.sheer * 0.18 - 0.06, -s.w * 0.86, s.x, s.yf + 0.62 + s.sheer * 0.18 - 0.06, s.w * 0.86);",
     "    const dy = 0.62 + s.sheer * 0.18 - 0.06;\n    pos.push(s.x, dy, -s.w * 0.86, s.x, dy, s.w * 0.86);"),
    ("    map: T.softGlow('255,196,124', 0.05), size: scale * 1.9, transparent: true,",
     "    map: T.softGlow('255,196,124', 0.05), size: scale * 1.05, transparent: true,"),
])

# B 天光与月光：粉墙黛瓦要吃得到光，屋面才分得出前后
edit('src/sky.js', [
    ("new THREE.HemisphereLight(0x3d5f7c, 0x171a18, 0.85)", "new THREE.HemisphereLight(0x47688a, 0x1b2126, 1.55)"),
    ("new THREE.DirectionalLight(0xc8dcf7, 1.05)", "new THREE.DirectionalLight(0xd4e5fb, 2.2)"),
    ("new THREE.DirectionalLight(0xffa066, 0.45)", "new THREE.DirectionalLight(0xffa066, 0.55)"),
    ("new THREE.DirectionalLight(0x7fa6b6, 0.52)", "new THREE.DirectionalLight(0x7fa6b6, 0.62)"),
])
edit('src/main.js', [
    ("renderer.toneMappingExposure = 0.95;", "renderer.toneMappingExposure = 1.12;"),
    ("const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.3, 0.5, 0.98);",
     "const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.22, 0.55, 1.02);"),
])

# C 光晕：一盏灯糊成一个球是最刺眼的假
edit('src/lamps.js', [
    ("halos.push([x, y, z, (r ?? 0.3) * 7.4]);", "halos.push([x, y, z, (r ?? 0.3) * 3.2]);"),
    ("  spots.forEach(([x, y, z, s = 2.4], i) => {", "  spots.forEach(([x, y, z, s = 1.6], i) => {"),
    ("    s.scale.set(halo, halo, 1);", "    s.scale.set(halo * 0.6, halo * 0.6, 1);"),
])
edit('src/bridges.js', [
    ("  const halo = new THREE.Sprite(new THREE.SpriteMaterial({", "  const halo = new THREE.Sprite(new THREE.SpriteMaterial({"),
])

# D 树：冠收小、往街里让，不许挡河
edit('src/plants.js', [
    ("    const r = rr(2.1, 3.4);", "    const r = rr(1.6, 2.6);"),
    ("  const crown = blobGeometry(rr(1.5, 2.1), { detail: 1, amp: 0.34, squash: 0.6, seed: (h * 3) | 0 });",
     "  const crown = blobGeometry(rr(1.1, 1.6), { detail: 1, amp: 0.34, squash: 0.6, seed: (h * 3) | 0 });"),
    ("    const r0 = rr(1.2, 2.1), drop0 = rr(2.4, 3.6);", "    const r0 = rr(1.0, 1.6), drop0 = rr(1.8, 2.7);"),
    ("      const x = f.x - f.nx * 1.5, z = f.z - f.nz * 1.5;", "      const x = f.x - f.nx * 2.9, z = f.z - f.nz * 2.9;"),
    ("    for (let s = 6; s < frames.total; s += rr(12, 19)) {", "    for (let s = 6; s < frames.total; s += rr(19, 28)) {"),
])

# E 园池：水面要落到岸顶之下，池沿要读得出边
edit('src/garden.js', [
    ("const POND_Y = BANK - 0.16;", "const POND_Y = BANK - 0.58;"),
    ("  const roof = pavilionRoof({ half: half + 1.2, rise: 1.9, eaveY: 0.42 + h, lift: 1.0, cornerOut: 0.85, sides: 4, perSide: 6, nv: 8 });",
     "  const roof = pavilionRoof({ half: half + 1.05, rise: 1.78, eaveY: 0.42 + h, lift: 0.44, cornerOut: 0.44, sides: 4, perSide: 6, nv: 8 });"),
    ("    span: w + 1.9, depth: d + 3.8, rise: o.rise ?? 2.0, eaveY: 0.55 + h,\n    lift: 0.44, cornerOut: 0.85, nu: 20, nv: 8,",
     "    span: w + 1.9, depth: d + 3.8, rise: o.rise ?? 2.0, eaveY: 0.55 + h,\n    lift: 0.3, cornerOut: 0.55, nu: 20, nv: 8,"),
])

# F 水面与倒影：夜里的河不能只是一块黑
edit('src/water.js', [
    ("    uShallow: { value: new THREE.Color('#13242b') },", "    uShallow: { value: new THREE.Color('#1d333c') },"),
    ("        col = mix(col, skyAt(normalize(r)) * 1.42, 0.10 + 0.44*fres);",
     "        col = mix(col, skyAt(normalize(r)) * 1.95, 0.14 + 0.52*fres);"),
    ("    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.62);",
     "    const c = (src.color || new THREE.Color(0xffffff)).clone().multiplyScalar(0.82);"),
    ("      opacity: src.emissiveMap ? 0.86 : 0.56,", "      opacity: src.emissiveMap ? 0.92 : 0.72,"),
])

# G 机位与默认档
edit('src/data.js', [
    ("    at: [-108, 8.5], hOff: EYE,\n    look: [140, 20, 4.2],", "    at: [-104, 9.6], hOff: EYE + 0.2,\n    look: [150, 22, 3.0],"),
    ("    at: [-260, 720], hOff: 178,\n    look: [20, 20, 22],", "    at: [-210, 560], hOff: 104,\n    look: [30, 10, 13],"),
    ("  window: 62,", "  window: 82,"),
    ("  bloom: 30,", "  bloom: 22,"),
])
edit('index.html', [
    ('<label for="s-window">家家窗灯 <b id="v-window">62%</b></label>', '<label for="s-window">家家窗灯 <b id="v-window">82%</b></label>'),
    ('<input type="range" id="s-window" min="0" max="150" step="5" value="62">', '<input type="range" id="s-window" min="0" max="150" step="5" value="82">'),
    ('<label for="s-bloom">灯影辉光 <b id="v-bloom">0.30</b></label>', '<label for="s-bloom">灯影辉光 <b id="v-bloom">0.22</b></label>'),
    ('<input type="range" id="s-bloom" min="0" max="150" step="5" value="30">', '<input type="range" id="s-bloom" min="0" max="150" step="5" value="22">'),
])
print('ALL DONE')
