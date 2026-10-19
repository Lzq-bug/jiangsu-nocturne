// 临时 loader：把 'three' / 'three/addons/*' 解析到 vendor/，让地形函数能在 Node 里跑（跑完即删）
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve as pathResolve } from 'node:path';

const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function resolve(spec, context, next) {
  if (spec === 'three') {
    return { url: pathToFileURL(join(ROOT, 'vendor/three.module.js')).href, shortCircuit: true };
  }
  if (spec.startsWith('three/addons/')) {
    return { url: pathToFileURL(join(ROOT, 'vendor', spec.slice('three/'.length))).href, shortCircuit: true };
  }
  return next(spec, context);
}
