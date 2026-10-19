import io, glob, re

# 1) kit.js：加一个统一的合并入口
p = 'src/kit.js'
s = io.open(p, encoding='utf-8').read()
if 'export function mergeAll' not in s:
    s = s.replace("""export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeGeometries(parts) : parts;""","""/**
 * 统一的合并入口：Box/Cylinder/Sphere 这类内置几何带 index，而 Extrude、Shape
 * 与 quadGrid 出来的不带——混在一起 mergeGeometries 会静默失败、返回 null，
 * 表现为"整栋楼没了"。这里一律先转成非索引再合。
 */
export function mergeAll(parts) {
  const list = [];
  for (const g of parts) {
    if (!g) continue;
    list.push(g.index ? g.toNonIndexed() : g);
  }
  return list.length ? mergeGeometries(list) : null;
}

export function mesh(parts, material) {
  const g = Array.isArray(parts) ? mergeAll(parts) : parts;""")
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('kit.js: mergeAll added')

# 2) 场景模块：mergeGeometries( → mergeAll(，并把 import 换掉
for f in glob.glob('src/*.js'):
    if f.endswith('kit.js'):
        continue
    s = io.open(f, encoding='utf-8').read()
    if 'mergeGeometries(' not in s:
        continue
    s = s.replace('mergeGeometries(', 'mergeAll(')
    # 去掉 addons 的 import，改从 kit 引 mergeAll
    s = re.sub(r"import \{ mergeGeometries \} from 'three/addons/utils/BufferGeometryUtils\.js';\n", '', s)
    if 'mergeAll' in s and "from './kit.js'" in s:
        # 在 kit 的具名 import 里补 mergeAll
        def add(m):
            inner = m.group(1)
            if 'mergeAll' in inner:
                return m.group(0)
            return "import { mergeAll," + inner + "from './kit.js';"
        s = re.sub(r"import \{([^}]*)\}from './kit\.js';", add, s.replace("from './kit.js'", "from './kit.js'"), count=1)
        if "mergeAll" not in s.split('\n\n')[0]:
            lines = s.split('\n')
            for i, L in enumerate(lines):
                if "from './kit.js'" in L and 'import {' in L:
                    if 'mergeAll' not in L:
                        lines[i] = L.replace('import { ', 'import { mergeAll, ', 1)
                    break
            s = '\n'.join(lines)
    io.open(f, 'w', encoding='utf-8', newline='').write(s)
    print('patched', f)
