import io
p = 'src/data.js'
lines = io.open(p, encoding='utf-8').read().split('\n')

def sub(old, new):
    for i, L in enumerate(lines):
        if old in L:
            lines[i] = L.replace(old, new)
            return True
    raise SystemExit('NOT FOUND: ' + old[:60])

# 三条东西河收在两条南北界河为止：镇子的水网是个格子，外圈由界河收边
sub("{ id: 'north', zh: '北河', z: -250, x0: -600, x1: 620, width: 16 },",
    "{ id: 'north', zh: '北河', z: -250, x0: -372, x1: 388, width: 16 },")
sub("{ id: 'mid', zh: '中河', z: 20, x0: -620, x1: 640, width: 18 },",
    "{ id: 'mid', zh: '中河', z: 20, x0: -372, x1: 390, width: 18 },")
sub("{ id: 'south', zh: '南河', z: 275, x0: -580, x1: 600, width: 15 },",
    "{ id: 'south', zh: '南河', z: 275, x0: -370, x1: 386, width: 15 },")

# 桥头要真的落到岸上
sub("over: 'north', at: [230, -250], dir: D, type: 'arch', span: 20,",
    "over: 'north', at: [230, -250], dir: D, type: 'arch', span: 22,")
sub("over: 'south', at: [-80, 275], dir: D, type: 'arch', span: 20,",
    "over: 'south', at: [-80, 275], dir: D, type: 'arch', span: 22,")
sub("over: 'west', at: [-360, 150], dir: 0, type: 'beam', span: 24,",
    "over: 'west', at: [-360, 150], dir: 0, type: 'beam', span: 27,")
sub("over: 'east', at: [372, 220], dir: 0, type: 'beam', span: 24,",
    "over: 'east', at: [372, 220], dir: 0, type: 'beam', span: 27,")
sub("over: 'lane3', at: [-250, -150], dir: D, type: 'beam', span: 14,",
    "over: 'lane3', at: [-250, -150], dir: D, type: 'beam', span: 16,")

# 航线：贴着收边后的水网走，出镇北口改走西界河的北端
i0 = next(i for i, L in enumerate(lines) if L.strip() == 'route: [')
i1 = next(i for i in range(i0, len(lines)) if lines[i].strip().startswith('],'))
lines[i0:i1] = [
    '  route: [',
    '    [520, 420], [440, 352], [374, 250], [372, 60], [372, 20], [300, 20], [240, 20],',
    '    [140, 20], [52, 20], [-40, 20], [-140, 20], [-140, -80], [-140, -200], [-140, -250],',
    '    [-260, -250], [-360, -250], [-360, -350], [-368, -424], [-300, -478], [-100, -516],',
    '    [120, -536], [300, -524], [450, -384], [560, -160], [700, 60], [800, 262], [838, 366],',
]
io.open(p, 'w', encoding='utf-8', newline='').write('\n'.join(lines))

p2 = 'tools/geom.mjs'
g = io.open(p2, encoding='utf-8').read()
g = g.replace("""  if (s.id === 'chuan') continue;""", """  if (s.id === 'chuan' || s.id === 'aerial') continue;   // 一个在船头、一个飞在湖上""")
g = g.replace("""  if (s.id === 'chuan') continue;                 // 这一站本来就在船头""", """  if (s.id === 'chuan' || s.id === 'aerial') continue;  // 一个在船头、一个飞在湖上""")
g = g.replace("  const dirX = Math.cos(b.dir), dirZ = Math.sin(b.dir);",
              "  const dirX = Math.cos(b.dir), dirZ = -Math.sin(b.dir);   // 绕 Y 转 dir：局部 +X → (cos, -sin)")
io.open(p2, 'w', encoding='utf-8', newline='').write(g)
print('patch2 done')
