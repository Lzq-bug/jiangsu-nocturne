import io
p = 'src/data.js'
s = io.open(p, encoding='utf-8').read()

# 门前空地：宅第的门楼前要留一块人站得住的地方（机位也站在这一块上）
s = s.replace("""export function inReserve(x, z, pad = 1.6) {
  for (const r of RESERVE) {
    if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return r.id;
  }
  return null;
}""","""/**
 * 门前空地：宅第门楼之前那一块不盖屋的场地。
 * 民居与树都要避让——机位也正好站在这一块的中央，镜头才不会被自家的屋檐挡住。
 */
export const FORECOURT = [
  { id: 'chongben-f', x0: 274, x1: 330, z0: -300, z1: -286 },
  { id: 'jiayin-f', x0: -318, x1: -262, z0: -306, z1: -292 },
  { id: 'gengle-f', x0: -270, x1: -206, z0: 78, z1: 94 },
  { id: 'chen-f', x0: 300, x1: 356, z0: -96, z1: -80 },
  { id: 'gate-f', x0: 266, x1: 282, z0: -318, z1: -292 },
];

export function inReserve(x, z, pad = 1.6) {
  for (const r of RESERVE.concat(FORECOURT)) {
    if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return r.id;
  }
  return null;
}""")

# 机位挪到街band与门前空地上
s = s.replace("at: [-108, 4], hOff: EYE,", "at: [-108, 8.5], hOff: EYE,")
s = s.replace("at: [-286, 5], hOff: EYE,", "at: [-286, 8.5], hOff: EYE,")
s = s.replace("at: [292, -305], hOff: EYE,", "at: [276, -305], hOff: EYE,")
s = s.replace("at: [302, -286], hOff: EYE,", "at: [302, -291], hOff: EYE,")
s = s.replace("at: [-290, -288], hOff: EYE,", "at: [-290, -297], hOff: EYE,")
s = s.replace("at: [-238, 88], hOff: EYE,", "at: [-238, 88], hOff: EYE,")
s = s.replace("at: [330, -86], hOff: EYE,", "at: [328, -86], hOff: EYE,")
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patch3 done')
