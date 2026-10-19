/**
 * Bundles the whole scene into one self-contained HTML file that opens with a
 * double-click — no server, no modules, no network.
 *   node tools/build-single.mjs [outfile]
 *
 * Each ES module becomes a factory in a tiny registry, so the top-level names of
 * three.js, its addons and our own sources keep their own scopes instead of
 * colliding in one shared script.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENTRY = 'src/main.js';

const ALIAS = {
  three: 'vendor/three.module.js',
  'three/addons/': 'vendor/addons/',
};

function resolveId(spec, from) {
  // longest prefix first, otherwise "three" swallows "three/addons/"
  for (const key of Object.keys(ALIAS).sort((a, b) => b.length - a.length)) {
    if (spec === key) return ALIAS[key];
    if (spec.startsWith(key)) return ALIAS[key] + spec.slice(key.length);
  }
  if (spec.startsWith('./') || spec.startsWith('../')) return normalizeId(join(dirname(from), spec));
  throw new Error(`${from}: cannot resolve "${spec}" (bare specifier with no alias)`);
}

const normalizeId = (p) => p.split(/[\\/]/).filter(Boolean).join('/');

/** rewrite one module's import/export syntax into registry calls */
function transform(id, src) {
  const exported = [];
  let body = src;

  body = body.replace(/^[ \t]*import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm,
    (_m, name, spec) => `const ${name} = __req(${JSON.stringify(resolveId(spec, id))});`);

  body = body.replace(/^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm,
    (_m, names, spec) => {
      const bindings = names.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
          const [fromId, toName] = entry.split(/\s+as\s+/).map((t) => t.trim());
          return toName ? `${fromId}: ${toName}` : fromId;
        });
      return `const { ${bindings.join(', ')} } = __req(${JSON.stringify(resolveId(spec, id))});`;
    });

  body = body.replace(/^[ \t]*import\s*['"]([^'"]+)['"];?[ \t]*$/gm,
    (_m, spec) => `__req(${JSON.stringify(resolveId(spec, id))});`);

  body = body.replace(/^[ \t]*export\s*\{([\s\S]*?)\}\s*;?[ \t]*$/gm, (_m, names) => {
    names.split(',').map((s) => s.trim()).filter(Boolean).forEach((entry) => {
      const [local, alias] = entry.split(/\s+as\s+/).map((t) => t.trim());
      exported.push([alias || local, local]);
    });
    return '';
  });

  body = body.replace(
    /^[ \t]*export[ \t]+((?:async[ \t]+function|function|class|const|let|var)[ \t]+[A-Za-z_$][\w$]*)/gm,
    (_m, decl) => {
      const name = decl.replace(/^(?:async[ \t]+function|function|class|const|let|var)[ \t]+/, '');
      exported.push([name, name]);
      return decl;
    },
  );

  const tail = exported.length
    ? `\nreturn { ${exported.map(([e, l]) => (e === l ? e : `${e}: ${l}`)).join(', ')} };\n`
    : '\nreturn {};\n';

  return `__def(${JSON.stringify(id)}, function (__req) {\n${body}\n${tail}});\n`;
}

async function collect(entry) {
  const seen = new Map();
  const stack = [[entry, null]];
  const edges = new Map();
  while (stack.length) {
    const [id, parent] = stack.pop();
    if (parent !== null) {
      const list = edges.get(parent) || [];
      list.push(id);
      edges.set(parent, list);
    }
    if (seen.has(id)) continue;
    const src = await readFile(join(ROOT, id), 'utf8');
    seen.set(id, src);
    const specs = [...src.matchAll(/^[ \t]*import\s*(?:[\s\S]*?from\s*)?['"]([^'"]+)['"];?[ \t]*$/gm)]
      .map((m) => resolveId(m[1], id));
    for (const dep of specs) stack.push([dep, id]);
  }

  // a cycle would hand a factory a half-filled namespace object
  const state = new Map();
  const walk = (id) => {
    if (state.get(id) === 1) throw new Error(`import cycle through ${id}`);
    if (state.get(id) === 2) return;
    state.set(id, 1);
    (edges.get(id) || []).forEach(walk);
    state.set(id, 2);
  };
  for (const id of seen.keys()) walk(id);

  // dependencies must be defined before their dependents
  const order = [];
  const done = new Set();
  const visit = (id) => {
    if (done.has(id)) return;
    done.add(id);
    (edges.get(id) || []).forEach(visit);
    order.push(id);
  };
  for (const id of seen.keys()) visit(id);

  return order.map((id) => transform(id, seen.get(id))).join('\n');
}

const out = process.argv[2] || 'dist/连岛开渔夏夜-3D夜景.html';
const [html, css, bundle] = await Promise.all([
  readFile(join(ROOT, 'index.html'), 'utf8'),
  readFile(join(ROOT, 'styles.css'), 'utf8'),
  collect(ENTRY),
]);

// replacement must come from a function: the bundle contains `'$'` from three.js,
// which String.replace would otherwise expand as the "after-match" pattern
const page = html
  .replace(/<link rel="stylesheet" href="[^"]*">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n/, () => '')
  .replace(/<script type="module" src="[^"]*"><\/script>/, () =>
    `<script>\n(function () {\n  var __defs = {}, __cache = {};\n`
    + `  function __def(id, fn) { __defs[id] = fn; }\n`
    + `  function __req(id) { if (!__cache[id]) __cache[id] = __defs[id](__req); return __cache[id]; }\n`
    + `  try {\n${bundle}\n    __req(${JSON.stringify(ENTRY)});\n  } catch (err) {\n`
    + `    var p = document.querySelector('#loader p');\n`
    + `    if (p) p.textContent = '场景加载失败：' + err.message;\n    console.error(err);\n  }\n})();\n</script>`);

await mkdir(dirname(resolve(ROOT, out)), { recursive: true });
await writeFile(resolve(ROOT, out), page, 'utf8');
console.log(`已打包单文件：${resolve(ROOT, out)}  (${(Buffer.byteLength(page) / 1048576).toFixed(2)} MB)`);
