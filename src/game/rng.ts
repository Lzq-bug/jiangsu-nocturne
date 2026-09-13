/** 可种子化的确定性随机数（mulberry32），引擎层唯一随机来源 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 以随机种子创建运行期 RNG */
export function createRng(): { rng: Rng; seed: number } {
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  return { rng: mulberry32(seed), seed };
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[randomInt(rng, list.length)];
}
