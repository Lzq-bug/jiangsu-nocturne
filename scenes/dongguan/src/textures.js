import * as THREE from 'three';

const cache = new Map();
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

function tex(c, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/* deterministic speckle — the street must look identical on every reload */
let seed = 86293;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** radial falloff — lamp halos, ground light pools, moon glow */
export function softGlow(hue = '255,190,120', hard = 0.14) {
  return memo(`glow-${hue}-${hard}`, () => {
    const { c, x } = canvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(hard, 'rgba(255,244,226,0.7)');
    g.addColorStop(0.45, `rgba(${hue},0.24)`);
    g.addColorStop(1, `rgba(${hue},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return tex(c);
  });
}

export function noise() {
  return memo('noise', () => {
    const { c, x } = canvas(128, 128);
    for (let i = 0; i < 5200; i++) {
      const v = 70 + rnd() * 130;
      x.fillStyle = `rgba(${v},${v},${v},0.5)`;
      x.fillRect(rnd() * 128, rnd() * 128, 2, 2);
    }
    return tex(c, { srgb: false });
  });
}

/** vertical fade for the light columns dragged down the canal */
export function columnFade() {
  return memo('column', () => {
    const { c, x } = canvas(32, 128);
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.14, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128);
    const s = x.createLinearGradient(0, 0, 32, 0);
    s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.5, 'rgba(255,255,255,1)'); s.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-in';
    x.fillStyle = s; x.fillRect(0, 0, 32, 128);
    return tex(c);
  });
}

/* ---------------------------------------------------------------- 街面与铺装 */

/**
 * 条石街面：u 沿街向分档、纵向三档石宽，两道车辙留在轮距上。
 * tileX/tileY 是这张图覆盖的米数——几何体 UV 按米生成，改这里等于改石板尺度。
 */
export function streetPaving({ tileX = 24, tileY = 12, base = '#312f2b' } = {}) {
  return memo(`pave-${tileX}-${tileY}-${base}`, () => {
    const W = 1024, H = 384;
    const { c, x } = canvas(W, H);
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    const joints = 22;
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 2.4;
    for (let i = 0; i <= joints; i++) {
      const px = (i / joints) * W + (rnd() - 0.5) * 5;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px, H); x.stroke();
    }
    for (let k = 1; k < 3; k++) {
      x.beginPath(); x.moveTo(0, (k / 3) * H); x.lineTo(W, (k / 3) * H); x.stroke();
    }
    for (let i = 0; i < joints; i++) {
      for (let k = 0; k < 3; k++) {
        const v = 128 + rnd() * 96;
        x.fillStyle = `rgba(${v},${v},${v - 10},0.05)`;
        x.fillRect((i / joints) * W + 3, (k / 3) * H + 3, W / joints - 6, H / 3 - 6);
      }
    }
    // 轮辙磨亮的两条带
    x.globalCompositeOperation = 'lighter';
    for (const z of [0.36, 0.64]) {
      const g = x.createLinearGradient(0, z * H - 15, 0, z * H + 15);
      g.addColorStop(0, 'rgba(255,214,168,0)');
      g.addColorStop(0.5, 'rgba(255,220,178,0.14)');
      g.addColorStop(1, 'rgba(255,214,168,0)');
      x.fillStyle = g; x.fillRect(0, z * H - 15, W, 30);
    }
    x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 5200; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.13)';
      x.fillRect(rnd() * W, rnd() * H, 2, 2);
    }
    // 几何体 UV 按米生成，所以这张图一律 1:1 铺设：tileX/tileY 就是它覆盖的米数
    return tex(c);
  });
}

/** 广场/河堤的方石 */
export function blockPaving({ tile = 8, base = '#2a2823' } = {}) {
  return memo(`block-${tile}-${base}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(0,0,0,0.5)'; x.lineWidth = 2;
    for (let k = 0; k <= 4; k++) {
      x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, 256); x.stroke();
      x.beginPath(); x.moveTo(0, k * 64); x.lineTo(256, k * 64); x.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      x.fillRect(rnd() * 256, rnd() * 256, 2, 2);
    }
    return tex(c);
  });
}

/* ------------------------------------------------------------------ 铺面面门 */

/**
 * 一层板门、二层支摘窗。tileX 米宽 x tileY 米高一循环，层高 floorH 米，
 * 所以建筑高度只取 floorH 的整数倍时窗格才对得上檐口。
 * emissive 图在无光处保持透明，灯柱与水面叠加时才不会被暗矩形盖住。
 */
export function shopMaps({ tileX = 24, tileY = 14, floorH = 3.5, bay = 2.4, litRatio = 0.62 } = {}) {
  return memo(`shop-${tileX}-${tileY}-${floorH}-${bay}-${litRatio}`, () => {
    const S = 1024;
    const { c: ca, x: a } = canvas(S, S);
    const { c: ce, x: e } = canvas(S, S);
    const floors = Math.round(tileY / floorH);
    const bays = Math.round(tileX / bay);
    const cw = S / bays, ch = S / floors;

    const g = a.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#1c1d1b');
    g.addColorStop(0.6, '#28211a');
    g.addColorStop(1, '#302519');
    a.fillStyle = g; a.fillRect(0, 0, S, S);
    // 亮度一律烘进 rgb、alpha 拉满：CanvasTexture 预乘会把半透明的窗灯再压暗一档
    e.fillStyle = '#000000'; e.fillRect(0, 0, S, S);

    for (let f = 0; f < floors; f++) {
      const rowY = S - (f + 1) * ch;   // canvas y 向下，楼层向上长
      const ground = f === 0;
      for (let i = 0; i < bays; i++) {
        const x0 = i * cw;
        if (ground) {
          a.fillStyle = '#181210';
          a.fillRect(x0 + cw * 0.16, rowY + ch * 0.26, cw * 0.68, ch * 0.74);
          a.strokeStyle = 'rgba(150,116,74,0.45)'; a.lineWidth = 1.6;
          for (let k = 1; k < 4; k++) {
            const px = x0 + cw * (0.16 + k * 0.17);
            a.beginPath(); a.moveTo(px, rowY + ch * 0.26); a.lineTo(px, S); a.stroke();
          }
          a.fillStyle = '#3b2d1d';
          a.fillRect(x0 + cw * 0.08, rowY + ch * 0.17, cw * 0.84, ch * 0.09);
          if (rnd() < litRatio) {
            e.fillStyle = 'rgb(232,158,78)';
            e.fillRect(x0 + cw * 0.16, rowY + ch * 0.3, cw * 0.68, ch * 0.7);
            e.fillStyle = 'rgb(255,214,158)';
            e.fillRect(x0 + cw * 0.2, rowY + ch * 0.52, cw * 0.6, ch * 0.2);
          }
        } else {
          a.fillStyle = '#16110e';
          a.fillRect(x0 + cw * 0.2, rowY + ch * 0.3, cw * 0.6, ch * 0.44);
          const on = rnd() < litRatio;
          if (on) {
            e.fillStyle = 'rgb(214,142,66)';
            e.fillRect(x0 + cw * 0.2, rowY + ch * 0.3, cw * 0.6, ch * 0.44);
            e.strokeStyle = 'rgba(20,12,6,0.85)'; e.lineWidth = 3.4;
            for (let k = 1; k < 3; k++) {
              const px = x0 + cw * (0.2 + k * 0.2);
              e.beginPath(); e.moveTo(px, rowY + ch * 0.3); e.lineTo(px, rowY + ch * 0.74); e.stroke();
            }
            e.beginPath(); e.moveTo(x0 + cw * 0.2, rowY + ch * 0.52); e.lineTo(x0 + cw * 0.8, rowY + ch * 0.52); e.stroke();
          }
          a.strokeStyle = 'rgba(150,128,100,0.35)'; a.lineWidth = 1.4;
          for (let k = 1; k < 3; k++) {
            const px = x0 + cw * (0.2 + k * 0.2);
            a.beginPath(); a.moveTo(px, rowY + ch * 0.3); a.lineTo(px, rowY + ch * 0.74); a.stroke();
          }
        }
      }
      a.fillStyle = 'rgba(8,6,4,0.6)';
      a.fillRect(0, rowY + ch - 4, S, 4);
    }
    return {
      albedo: tex(ca),
      emissive: tex(ce),
    };
  });
}

/** 小青瓦：u 沿檐口方向，v 沿坡 */
export function roofTiles({ tileX = 10, tileY = 3.2, base = '#232528' } = {}) {
  return memo(`roof-${tileX}-${tileY}`, () => {
    const { c, x } = canvas(512, 256);
    x.fillStyle = base; x.fillRect(0, 0, 512, 256);
    const rows = 11;
    for (let r = 0; r < rows; r++) {
      const y = (r / rows) * 256;
      x.fillStyle = r % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.3)';
      x.fillRect(0, y, 512, (256 / rows) * 0.62);
      x.strokeStyle = 'rgba(0,0,0,0.4)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(0, y + 256 / rows); x.lineTo(512, y + 256 / rows); x.stroke();
    }
    x.strokeStyle = 'rgba(0,0,0,0.32)'; x.lineWidth = 3;
    for (let k = 0; k <= 30; k++) {
      const px = (k / 30) * 512;
      x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 256); x.stroke();
      x.fillStyle = 'rgba(186,198,208,0.07)';
      x.beginPath(); x.arc(px, 250, 5, 0, 7); x.fill();
    }
    for (let i = 0; i < 2200; i++) {
      x.fillStyle = 'rgba(0,0,0,0.16)';
      x.fillRect(rnd() * 512, rnd() * 256, 2, 2);
    }
    return tex(c);
  });
}

/** 立柱、檐枋、门槛的竖纹木 */
export function woodGrain({ tile = 2.2, base = '#3a2a1d' } = {}) {
  return memo(`wood-${tile}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 42; i++) {
      const v = 38 + rnd() * 66;
      x.fillStyle = `rgba(${v + 26},${v + 4},${v - 10},0.18)`;
      x.fillRect(rnd() * 256, 0, 3 + rnd() * 9, 256);
    }
    x.strokeStyle = 'rgba(0,0,0,0.38)'; x.lineWidth = 1.6;
    for (let k = 0; k <= 6; k++) {
      x.beginPath(); x.moveTo(k * 42.6, 0); x.lineTo(k * 42.6, 256); x.stroke();
    }
    return tex(c);
  });
}

/** 对岸与远处民居的零星窗灯 */
export function scatterWindows({ warm = 0.86, density = 0.15, tile = 6 } = {}) {
  return memo(`scatter-${warm}-${density}-${tile}`, () => {
    const { c, x } = canvas(256, 256);
    x.fillStyle = '#080a0e'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      if (rnd() > density) continue;
      x.fillStyle = rnd() < warm ? 'rgba(255,188,118,0.9)' : 'rgba(176,208,255,0.7)';
      x.fillRect(rnd() * 256, rnd() * 256, 2.4, 3.4);
    }
    return tex(c);
  });
}

/* ---------------------------------------------------------------- 幌子与匾额 */

const HAND = '"KaiTi","STKaiti","SimSun","Noto Serif SC",serif';

/** 竖幌图集：一格一条布招，字自上而下。图集序号分配给几何体 UV，全部幌子合成一次绘制。 */
export function bannerAtlas(words, { cols = 4, cell = 256 } = {}) {
  return memo(`banner-${words.join('|')}`, () => {
    const rows = Math.ceil(words.length / cols);
    const { c, x } = canvas(cols * cell, rows * cell);
    const cloths = [['#8d2f20', '#f7e6c4'], ['#1f2f48', '#efe1bf'], ['#4a3a1c', '#f7ecd0'], ['#21372b', '#eee5c6']];
    words.forEach((w, i) => {
      const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
      const [bg, fg] = cloths[i % cloths.length];
      x.fillStyle = bg; x.fillRect(cx + 6, cy + 4, cell - 12, cell - 8);
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 3;
      x.strokeRect(cx + 6, cy + 4, cell - 12, cell - 8);
      for (let k = 0; k < 7; k++) {
        x.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.09})`;
        x.fillRect(cx + 8 + rnd() * (cell - 16), cy + 4, 3, cell - 8);
      }
      const chars = [...w];
      const n = Math.max(1, chars.length);
      x.fillStyle = fg;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `${Math.min(64, (cell - 34) / n)}px ${HAND}`;
      chars.forEach((ch, k) => {
        x.fillText(ch, cx + cell / 2, cy + 24 + (k + 0.5) * ((cell - 48) / n));
      });
    });
    return { texture: tex(c), cols, rows, count: words.length };
  });
}

/** 横匾图集 */
export function plaqueAtlas(words, { cols = 3, cell = 192 } = {}) {
  return memo(`plaque-${words.join('|')}`, () => {
    const rows = Math.ceil(words.length / cols);
    const { c, x } = canvas(cols * cell, rows * cell);
    words.forEach((w, i) => {
      const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
      x.fillStyle = '#1b1510'; x.fillRect(cx + 5, cy + 6, cell - 10, cell - 12);
      x.strokeStyle = 'rgba(198,160,98,0.5)'; x.lineWidth = 4;
      x.strokeRect(cx + 9, cy + 10, cell - 18, cell - 20);
      x.fillStyle = '#f0dcb4';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `${Math.min(56, (cell - 30) / Math.max(1, [...w].length))}px ${HAND}`;
      x.fillText(w, cx + cell / 2, cy + cell / 2);
    });
    return { texture: tex(c), cols, rows, count: words.length };
  });
}
