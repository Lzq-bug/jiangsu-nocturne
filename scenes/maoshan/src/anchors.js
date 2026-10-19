/**
 * 锚点解析：data.js 里的机位只写"站在哪块台基的哪一角"，高度在这里按标高场算。
 * 手写 y 是这一类场景最容易翻车的地方——挪一次台基，机位就埋进山体或者悬在半空。
 */
import { PADS } from './data.js';
import { padTop, padOf, heightAt, atPath } from './relief.js';

/**
 * 支持的锚点写法：
 *   ['pad', padId, dx, dz, dy]      站在某块台基上（相对中心的位移 + 离台面高）
 *   ['ground', x, z, dy]            站在自然地面上
 *   ['path', pathId, t, off, dy]    站在登山道上，t∈[0,1]、off 为横向偏移
 *   ['air', x, y, z]                空中，直接给坐标
 */
export function resolve(a) {
  if (!a) return null;
  const kind = a[0];
  if (kind === 'pad') {
    const p = padOf(a[1]);
    if (!p) throw new Error(`锚点指的 pad ${a[1]} 不存在`);
    const x = p.x + (a[2] || 0), z = p.z + (a[3] || 0);
    return { x, y: padTop(a[1]) + (a[4] || 0), z };
  }
  if (kind === 'ground') return { x: a[1], y: heightAt(a[1], a[2]) + (a[3] || 0), z: a[2] };
  if (kind === 'path') {
    const p = atPath(a[1], a[2], a[3] || 0, a[4] || 0);
    if (!p) throw new Error(`锚点指的路径 ${a[1]} 不存在`);
    return { x: p.x, y: p.y, z: p.z };
  }
  if (kind === 'air') return { x: a[1], y: a[2], z: a[3] };
  throw new Error(`未知锚点类型 ${kind}`);
}

export const padCenter = (id) => {
  const p = PADS.find((q) => q.id === id);
  return p ? { x: p.x, y: padTop(p.id), z: p.z } : null;
};

/** 把机位的 eye/look/mark 三段锚点换成世界坐标，供 CameraRig 与 Hotspots 直接用 */
export function buildStations(list) {
  return list.map((s) => {
    const eye = resolve(s.eye);
    const look = resolve(s.look);
    const mark = s.mark ? resolve(s.mark) : null;
    if (!eye || !look) throw new Error(`机位 ${s.id} 的锚点解析失败`);
    return {
      ...s,
      pos: [eye.x, eye.y, eye.z],
      look: [look.x, look.y, look.z],
      mark: mark ? [mark.x, mark.y, mark.z] : null,
    };
  });
}
