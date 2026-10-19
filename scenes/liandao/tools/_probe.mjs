// 临时探针：在 Node 里数值验证地形/水线/潮位（跑完即删）
const grad = () => ({ addColorStop() {} });
const ctx2d = () => new Proxy({}, {
  get: (_t, k) => {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return grad;
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(64) });
    if (k === 'measureText') return () => ({ width: 8 });
    return () => {};
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, style: {}, getContext: ctx2d }),
};
globalThis.window = globalThis;

const E = await import('../src/environment.js');
const { tideAt, tideWord, nextTurn, hhmm } = await import('../src/tide.js');

let hiH = 0, loH = 0;
for (let h = 0; h < 12.83; h += 0.01) { if (tideAt(h) > tideAt(hiH)) hiH = h; if (tideAt(h) < tideAt(loH)) loH = h; }
const hi = tideAt(hiH), lo = tideAt(loH), st = tideAt(19.4);
console.log('极值小时 =', hiH.toFixed(2), loH.toFixed(2), '| 潮位 高/低/入夜 =', hi.toFixed(2), lo.toFixed(2), st.toFixed(2), '| 极差 =', (hi - lo).toFixed(2), 'm');
console.log('五更时刻', hhmm(19.4), hhmm(21.6), hhmm(23.9), hhmm(2.4), hhmm(4.8));
console.log('潮态 19.4/2.4 =', tideWord(19.4), '/', tideWord(2.4), '| 距转流', nextTurn(19.4).toFixed(1), 'h');
console.log('倍率14分/秒 → 一夜 9.4h 需', ((9.4 * 60) / 14).toFixed(0), '秒');

console.log('\n岸线 shoreAt: 大沙湾', E.shoreAt(-60).toFixed(1), '| 苏马湾', E.shoreAt(250).toFixed(1), '| 羊窝头', E.shoreAt(640).toFixed(1));
const zHi = E.shoreZat(-60, hi), zLo = E.shoreZat(-60, lo);
console.log('水线 shoreZat(-60): 高潮', zHi.toFixed(1), '低潮', zLo.toFixed(1), '→ 滩面进退', Math.abs(zLo - zHi).toFixed(1), 'm');

const pts = [
  ['滩后夜客', -150, 42], ['潮线机位', -60, 88], ['滩前', -60, 160], ['外海', -60, 400],
  ['苏马湾', 250, 96], ['岬角', 128, 60], ['羊窝头', 642, 22], ['观日亭', 316, 44], ['刻石亭', 352, 14],
  ['烟墩', 470, -86], ['岛脊', -180, -268], ['港池心', -620, -215], ['码头面', -548, -286],
  ['防波堤头', -300, -12], ['灯塔下', -306, -18], ['大堤中段', -910, -140], ['大堤岛端', -704, 2],
  ['墟沟', -1620, -520], ['云台山方向', 0, -1400],
];
let nonFinite = 0;
for (const [n, x, z] of pts) {
  const h = E.terrainH(x, z);
  if (!Number.isFinite(h)) nonFinite++;
  const tag = h > hi ? '高潮也干' : h < lo ? '全程泡水' : '潮间带';
  console.log(`${n}\t(${x},${z})\th=${h.toFixed(2)}\tzone=${E.zoneAt(x, z)}\t${tag}`);
}
console.log(nonFinite ? `!! 非有限高程 ${nonFinite} 处` : '全部有限');
