import io, re
p = 'data.js'
s = io.open(p, encoding='utf-8').read()

# ---- 1) blockPoly：顶点必须按行走顺序排，乱序会把自己交成蝴蝶结
i0 = s.index('/**\n * 一块地 = 四个界桩之间的多边形')
i1 = s.index('/**\n * 九块地')
new_bp = """/**
 * 一块地 = 四个界桩之间的多边形。角上收圆、边上按确定性随机抖一点，
 * 于是镇子不是棋盘，但每一轮刷新都是同一个镇子。
 * 顶点按行走顺序排：弧 → 边 → 弧 → 边……乱序会把自己交成蝴蝶结。
 */
function blockPoly(x0, x1, z0, z1, { corner = 12, jitter = 1.6, seg = 3 } = {}) {
  const cs = Math.min(corner, (x1 - x0) / 2, (z1 - z0) / 2);
  const arcs = [
    [x0 + cs, z0 + cs, -Math.PI, -Math.PI / 2],
    [x1 - cs, z0 + cs, -Math.PI / 2, 0],
    [x1 - cs, z1 - cs, 0, Math.PI / 2],
    [x0 + cs, z1 - cs, Math.PI / 2, Math.PI],
  ];
  const edges = [
    [[x0 + cs, z0], [x1 - cs, z0]], [[x1, z0 + cs], [x1, z1 - cs]],
    [[x1 - cs, z1], [x0 + cs, z1]], [[x0, z1 - cs], [x0, z0 + cs]],
  ];
  const out = [];
  for (let k = 0; k < 4; k++) {
    const [cx, cz, a0, a1] = arcs[k];
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (a1 - a0) * (i / 4);
      out.push([cx + cs * Math.cos(a), cz + cs * Math.sin(a)]);
    }
    const [[ax, az], [bx, bz]] = edges[k];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (bz - az) / L, nz = -(bx - ax) / L;
    for (let i = 1; i <= seg; i++) {
      const t = i / (seg + 1);
      const o = (rand() - 0.5) * 2 * jitter;
      out.push([ax + (bx - ax) * t + nx * o, az + (bz - az) * t + nz * o]);
    }
  }
  const dedup = [];
  for (const q of out) {
    const a = dedup[dedup.length - 1];
    if (a && Math.abs(a[0] - q[0]) < 0.08 && Math.abs(a[1] - q[1]) < 0.08) continue;
    dedup.push(q);
  }
  return dedup;
}

"""
s = s[:i0] + new_bp + s[i1:]

# ---- 2) 界河从"镇界"改成真的缝：往里挪，两侧各留一条沿河圩
s = s.replace("{ id: 'west', zh: '西界河', x: -450, z0: -420, z1: 400, width: 12 },",
              "{ id: 'west', zh: '西界河', x: -360, z0: -420, z1: 420, width: 12 },")
s = s.replace("{ id: 'east', zh: '东长港', x: 470, z0: -400, z1: 460, width: 12 },",
              "{ id: 'east', zh: '东长港', x: 372, z0: -420, z1: 460, width: 12 },")

# ---- 3) 地块：主块收到 -350..362，东西各多出一条沿河圩（共十一块）
old_isl = s[s.index("export const ISLANDS = ["):s.index("export const ISLAND = {};")]
new_isl = """export const ISLANDS = [
  { id: 'n1', name: '镇北', poly: blockPoly(-350, 362, -352, -258, { corner: 14 }) },
  { id: 'n2', name: '镇中北 · 西', poly: blockPoly(-350, -148, -242, -155, { corner: 10 }) },
  { id: 'n3', name: '镇中北 · 东', poly: blockPoly(-132, 362, -242, -155, { corner: 10 }) },
  { id: 'm1', name: '镇中 · 西', poly: blockPoly(-350, -148, -145, 11, { corner: 12 }) },
  { id: 'm2', name: '镇中 · 东', poly: blockPoly(-132, 362, -145, 11, { corner: 12 }) },
  { id: 's1', name: '镇南 · 西', poly: blockPoly(-350, 195, 29, 266, { corner: 14 }) },
  { id: 's2', name: '镇南 · 东北', poly: blockPoly(205, 362, 29, 145, { corner: 10 }) },
  { id: 's3', name: '镇南 · 东南', poly: blockPoly(205, 362, 155, 266, { corner: 10 }) },
  { id: 'r1', name: '镇南圩', poly: blockPoly(-350, 362, 283, 350, { corner: 12 }) },
  { id: 'ws', name: '西圩', poly: blockPoly(-442, -370, -340, 340, { corner: 14 }) },
  { id: 'es', name: '东圩', poly: blockPoly(382, 458, -336, 336, { corner: 14 }) },
];

"""
s = s.replace(old_isl, new_isl)

# ---- 4) 桥跨按缝宽给足：桥头一定要落到岸上
old_br = s[s.index("  { id: 'taiping', name: '太平桥'"):s.index("/** 三桥的次序")]
new_br = """  { id: 'taiping', name: '太平桥', over: 'mid', at: [-40, 20], dir: D, type: 'arch', span: 23, width: 4.2, rise: 2.5 },
  { id: 'jili', name: '吉利桥', over: 'mid', at: [52, 20], dir: D, type: 'beam', span: 23, width: 3.8, rise: 0.3 },
  { id: 'changqing', name: '长庆桥', over: 'mid', at: [140, 20], dir: D, type: 'arch', span: 23, width: 4.4, rise: 2.4 },
  { id: 'b_n1', over: 'north', at: [-260, -250], dir: D, type: 'arch', span: 20, width: 3.6, rise: 2.2 },
  { id: 'b_n2', over: 'north', at: [230, -250], dir: D, type: 'arch', span: 20, width: 3.8, rise: 2.1 },
  { id: 'b_n3', over: 'north', at: [60, -250], dir: D, type: 'beam', span: 20, width: 3.2 },
  { id: 'b_s1', over: 'south', at: [-80, 275], dir: D, type: 'arch', span: 20, width: 3.4, rise: 2.0 },
  { id: 'b_s2', over: 'south', at: [300, 275], dir: D, type: 'arch', span: 20, width: 3.2, rise: 1.9 },
  { id: 'b_w1', over: 'west', at: [-360, -120], dir: 0, type: 'arch', span: 24, width: 3.4, rise: 2.0 },
  { id: 'b_w2', over: 'west', at: [-360, 150], dir: 0, type: 'beam', span: 24, width: 3.2 },
  { id: 'b_e1', over: 'east', at: [372, -60], dir: 0, type: 'arch', span: 24, width: 3.4, rise: 2.0 },
  { id: 'b_e2', over: 'east', at: [372, 220], dir: 0, type: 'beam', span: 24, width: 3.2 },
  { id: 'b_l1', over: 'lane1', at: [-140, -200], dir: 0, type: 'arch', span: 20, width: 3.0, rise: 1.6 },
  { id: 'b_l2', over: 'lane1', at: [-140, -60], dir: 0, type: 'beam', span: 20, width: 2.8 },
  { id: 'b_l3', over: 'lane2', at: [200, 90], dir: 0, type: 'beam', span: 14, width: 2.6 },
  { id: 'b_l4', over: 'lane2', at: [200, 210], dir: 0, type: 'beam', span: 14, width: 2.6 },
  { id: 'b_l5', over: 'lane3', at: [-250, -150], dir: D, type: 'beam', span: 14, width: 2.8 },
  { id: 'b_l6', over: 'lane3', at: [250, -150], dir: D, type: 'arch', span: 14, width: 3.0, rise: 1.4 },
  { id: 'b_l7', over: 'lane4', at: [300, 150], dir: D, type: 'beam', span: 14, width: 2.6 },
  { id: 'b_x1', over: 'lane3', at: [-60, -150], dir: D, type: 'beam', span: 14, width: 2.6 },
  { id: 'b_x2', over: 'west', at: [-360, -290], dir: 0, type: 'arch', span: 24, width: 3.0, rise: 1.8 },
];

"""
s = s.replace(old_br, new_br)

# ---- 5) 航线跟着改道的界河走；湖望那一站要站到圩堤上
s = s.replace("""    [-260, -250], [-450, -250], [-450, -340], [-420, -420],""","""    [-260, -250], [-360, -250], [-360, -340], [-420, -420],""")
s = s.replace("""    [140, 20], [52, 20], [-40, 20], [-140, 20], [-140, -80], [-140, -200], [-140, -250],""","""    [140, 20], [52, 20], [-40, 20], [-140, 20], [-140, -80], [-140, -200], [-140, -250],""")
s = s.replace("""    [520, 420], [492, 348], [470, 250], [470, 60], [470, 20], [380, 20], [240, 20],""","""    [520, 420], [452, 348], [390, 250], [372, 60], [372, 20], [300, 20], [240, 20],""")
s = s.replace("at: [-60, -604], hOff: EYE + 0.4, floorY: DEP,", "at: [-445, -590], hOff: EYE + 0.4, floorY: DEP,")
s = s.replace("look: [60, -330, 5.0],", "look: [20, 20, 12],")
s = s.replace("mark: [-330, -576, 3.6],", "mark: [-520, -604, 3.4],")
s = s.replace("at: [208, -288], hOff: EYE - 0.1, floorY: BANK + 0.1,", "at: [216, -278], hOff: EYE - 0.1, floorY: BANK + 0.1,")

# ---- 6) 机位里的西河街那一站挪到新岸线上
s = s.replace("at: [-300, 6], hOff: EYE,", "at: [-286, 5], hOff: EYE,")
io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
