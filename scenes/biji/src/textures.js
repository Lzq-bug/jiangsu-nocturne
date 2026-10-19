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

/* deterministic — the lane is laid out the same way on every reload */
const rnd = (() => {
  let s = 20261014;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

/** radial falloff — moon halo, lamp glows, lantern bloom, ember sprites */
export function softGlow(hue = '255,205,140', hard = 0.12) {
  return memo(`glow-${hue}-${hard}`, () => {
    const { c, x } = canvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(hard, `rgba(${hue},0.72)`);
    g.addColorStop(0.45, `rgba(${hue},0.22)`);
    g.addColorStop(1, `rgba(${hue},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return tex(c);
  });
}

export function noise() {
  return memo('noise', () => {
    const { c, x } = canvas(128, 128);
    const d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return tex(c, { srgb: false });
  });
}

/** vertical gradient for the light columns a lantern drags down the water */
export function columnFade() {
  return memo('column', () => {
    const { c, x } = canvas(32, 128);
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 128);
    const s = x.createLinearGradient(0, 0, 32, 0);
    s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.5, 'rgba(255,255,255,1)'); s.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-in';
    x.fillStyle = s; x.fillRect(0, 0, 32, 128);
    return tex(c);
  });
}

/** soft horizontal band — the glowing edge of a eave or a quay coping */
export function edgeGlow() {
  return memo('edge', () => {
    const { c, x } = canvas(64, 16);
    const g = x.createLinearGradient(0, 0, 0, 16);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 16);
    return tex(c);
  });
}

/* ------------------------------------------------------------------ 粉墙黛瓦 */

/**
 * 粉墙 — lime-washed garden wall. Mostly pale, but at night it reads as a grey
 * sheet with rain streaks and a dark rising damp band along the base.
 * Tile repeats in metres via `repeat`, so one texture serves every wall.
 */
export function plaster({ base = '#d9d4c7', repeat = [1, 1] } = {}) {
  return memo(`plaster-${base}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    // lime mottling
    for (let i = 0; i < 900; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(70,66,58,0.05)';
      const r = 2 + rnd() * 9;
      x.beginPath(); x.arc(rnd() * S, rnd() * S, r, 0, 6.3); x.fill();
    }
    // rain streaks from the eaves
    x.globalAlpha = 0.5;
    for (let i = 0; i < 24; i++) {
      const gx = rnd() * S, w = 1 + rnd() * 2.6;
      const g = x.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, 'rgba(58,56,52,0.2)');
      g.addColorStop(0.6, 'rgba(58,56,52,0.06)');
      g.addColorStop(1, 'rgba(46,44,40,0)');
      x.fillStyle = g; x.fillRect(gx, 0, w, S);
    }
    x.globalAlpha = 1;
    // damp band at ground level
    const damp = x.createLinearGradient(0, S, 0, S * 0.82);
    damp.addColorStop(0, 'rgba(40,42,40,0.34)');
    damp.addColorStop(1, 'rgba(40,42,40,0)');
    x.fillStyle = damp; x.fillRect(0, S * 0.82, S, S * 0.18);
    return tex(c, { repeat });
  });
}

/** 黛瓦 — small clay roof tiles laid in ribs running down the slope */
export function roofTiles({ base = '#2b3138', cols = 11, repeat = [1, 1] } = {}) {
  return memo(`tile-${base}-${cols}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    const w = S / cols;
    for (let i = 0; i < cols; i++) {
      const gx = i * w;
      const g = x.createLinearGradient(gx, 0, gx + w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.02)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.32)');
      g.addColorStop(1, 'rgba(0,0,0,0.12)');
      x.fillStyle = g; x.fillRect(gx, 0, w, S);
      // the every-third-tile ridge
      if (i % 3 === 0) {
        x.fillStyle = 'rgba(210,220,230,0.07)';
        x.fillRect(gx + w * 0.32, 0, w * 0.36, S);
      }
    }
    // course seams + moss in the valleys
    for (let j = 0; j < 8; j++) {
      x.fillStyle = 'rgba(0,0,0,0.22)';
      x.fillRect(0, j * (S / 8), S, 1.6);
      if (rnd() > 0.55) {
        x.fillStyle = `rgba(58,86,52,${0.1 + rnd() * 0.16})`;
        x.fillRect(rnd() * S, j * (S / 8), 8 + rnd() * 30, 2.6);
      }
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.08)';
      x.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
    }
    return tex(c, { repeat });
  });
}

/** 青石 / 石板路 — flagstones with seams, wet sheen handled by roughness map */
export function paving(base = '#4a4f57', slab = 4, repeat = [1, 1]) {
  return memo(`pave-${base}-${slab}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    const n = 2, cell = S / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = 0.9 + rnd() * 0.25;
        x.fillStyle = `rgba(${Math.round(74 * k)},${Math.round(79 * k)},${Math.round(87 * k)},0.9)`;
        x.fillRect(i * cell + 1.5, j * cell + 1.5, cell - 3, cell - 3);
      }
    }
    for (let i = 0; i < 5200; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)';
      x.fillRect(rnd() * S, rnd() * S, 1.7, 1.7);
    }
    x.strokeStyle = 'rgba(12,14,18,0.55)'; x.lineWidth = 2.4;
    for (let k = 0; k <= n; k++) {
      x.beginPath(); x.moveTo(k * cell, 0); x.lineTo(k * cell, S); x.stroke();
      x.beginPath(); x.moveTo(0, k * cell); x.lineTo(S, k * cell); x.stroke();
    }
    return tex(c, { repeat });
  });
}

/** 条石驳岸 — quarry-faced stone courses, used for the quay wall and the tower body */
export function stoneCourses(base = '#6b6f74', rows = 8, repeat = [1, 1]) {
  return memo(`course-${base}-${rows}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    const rh = S / rows;
    for (let j = 0; j < rows; j++) {
      let px = -rnd() * 40;
      while (px < S) {
        const w = 34 + rnd() * 60;
        const k = 0.86 + rnd() * 0.3;
        x.fillStyle = `rgba(${Math.round(112 * k)},${Math.round(116 * k)},${Math.round(118 * k)},0.85)`;
        x.fillRect(px + 1.5, j * rh + 1.5, w - 3, rh - 3);
        px += w;
      }
      x.fillStyle = 'rgba(10,12,14,0.5)';
      x.fillRect(0, j * rh, S, 2);
    }
    for (let i = 0; i < 4200; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)';
      x.fillRect(rnd() * S, rnd() * S, 1.8, 1.8);
    }
    // water line darkening on the quay side
    const damp = x.createLinearGradient(0, S, 0, S * 0.6);
    damp.addColorStop(0, 'rgba(20,40,34,0.42)');
    damp.addColorStop(1, 'rgba(20,40,34,0)');
    x.fillStyle = damp; x.fillRect(0, S * 0.6, S, S * 0.4);
    return tex(c, { repeat });
  });
}

/** 木 — dark lacquered timber for shop fronts, columns and the comb drying racks */
export function wood(base = '#4a3223', repeat = [1, 1]) {
  return memo(`wood-${base}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 78; i++) {
      const gy = rnd() * S;
      x.strokeStyle = rnd() > 0.5 ? 'rgba(255,224,180,0.05)' : 'rgba(20,10,4,0.24)';
      x.lineWidth = 0.6 + rnd() * 2.2;
      x.beginPath();
      x.moveTo(0, gy);
      for (let px = 0; px <= S; px += 16) x.lineTo(px, gy + Math.sin(px * 0.05 + i) * 2.6 + (rnd() - 0.5) * 2);
      x.stroke();
    }
    // knots
    for (let i = 0; i < 6; i++) {
      const gx = rnd() * S, gy = rnd() * S;
      const g = x.createRadialGradient(gx, gy, 0, gx, gy, 6 + rnd() * 6);
      g.addColorStop(0, 'rgba(18,9,4,0.55)');
      g.addColorStop(1, 'rgba(18,9,4,0)');
      x.fillStyle = g; x.beginPath(); x.arc(gx, gy, 12, 0, 6.3); x.fill();
    }
    return tex(c, { repeat });
  });
}

/** 竹 — bamboo split stock the 篦 teeth are cut from */
export function bamboo(base = '#c8a768', repeat = [1, 1]) {
  return memo('bamboo', () => {
    const S = 128, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 120; i++) {
      x.strokeStyle = rnd() > 0.5 ? 'rgba(255,242,205,0.14)' : 'rgba(96,64,26,0.16)';
      x.lineWidth = 0.5 + rnd() * 1.4;
      const gy = rnd() * S;
      x.beginPath(); x.moveTo(0, gy); x.lineTo(S, gy + (rnd() - 0.5) * 3); x.stroke();
    }
    return tex(c, { repeat });
  });
}

/* ------------------------------------------------------------------ 窗棂 与 灯笼 */

/**
 * 窗棂 — lattice window. The albedo carries the warm paper behind the bars, the
 * emissive sheet carries only the lit paper, so a slider can dim the lamp inside.
 */
export function lattice({ pattern = '方眼', size = 256, lit = '255,196,120', k = 0.75 } = {}) {
  return memo(`lat-${pattern}-${k.toFixed(2)}`, () => {
    const { c: ca, x: a } = canvas(size, size);
    const { c: ce, x: e } = canvas(size, size);
    a.fillStyle = '#1b1310'; a.fillRect(0, 0, size, size);
    e.fillStyle = 'rgba(0,0,0,1)'; e.fillRect(0, 0, size, size);
    const paper = a.createLinearGradient(0, 0, size, size);
    paper.addColorStop(0, `rgba(${lit},${0.32 + k * 0.4})`);
    paper.addColorStop(1, `rgba(${lit},${0.18 + k * 0.3})`);
    a.fillStyle = paper; a.fillRect(0, 0, size, size);
    e.fillStyle = `rgb(${lit.split(',').map((n) => Math.round(Number(n) * (0.3 + k * 0.7))).join(',')})`;
    e.fillRect(0, 0, size, size);

    const bars = (x2) => { x2.fillStyle = '#140d0a'; };
    const gap = pattern === '冰裂' ? 0 : size / 8;
    if (pattern === '方眼') {
      [a, e].forEach((x2) => {
        bars(x2);
        for (let i = 0; i <= 8; i++) {
          x2.fillRect(i * gap - 2.5, 0, 5, size);
          x2.fillRect(0, i * gap - 2.5, size, 5);
        }
      });
    } else if (pattern === '直棂') {
      [a, e].forEach((x2) => {
        bars(x2);
        for (let i = 0; i <= 6; i++) x2.fillRect(i * (size / 6) - 3, 0, 6, size);
        x2.fillRect(0, size * 0.48, size, 7);
      });
    } else {
      // 冰裂 — irregular cracks
      [a, e].forEach((x2) => {
        bars(x2);
        x2.lineWidth = 6; x2.strokeStyle = '#140d0a';
        for (let i = 0; i < 22; i++) {
          const x0 = rnd() * size, y0 = rnd() * size;
          const ang = rnd() * Math.PI * 2, len = 22 + rnd() * 60;
          x2.beginPath();
          x2.moveTo(x0, y0);
          x2.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
          x2.lineTo(x0 + Math.cos(ang + 1.2) * len * 0.7, y0 + Math.sin(ang + 1.2) * len * 0.7);
          x2.stroke();
        }
      });
    }
    return {
      albedo: tex(ca),
      emissive: tex(ce),
    };
  });
}

/** 灯笼 — ribbed paper sphere skin; emissive so the bloom catches it */
export function lanternSkin({ hue = '255,120,72', k = 0.9 } = {}) {
  return memo(`lant-${hue}-${k.toFixed(2)}`, () => {
    const S = 128, { c, x } = canvas(S, S);
    const g = x.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, `rgba(${hue},0.6)`);
    g.addColorStop(0.5, `rgba(${hue},1)`);
    g.addColorStop(1, `rgba(${hue},0.6)`);
    x.fillStyle = `rgb(${hue.split(',').map((n) => Math.round(Number(n) * k)).join(',')})`;
    x.fillRect(0, 0, S, S);
    x.fillStyle = g; x.globalAlpha = 0.35; x.fillRect(0, 0, S, S); x.globalAlpha = 1;
    x.strokeStyle = 'rgba(90,26,12,0.5)'; x.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      x.beginPath(); x.moveTo(0, i * (S / 9)); x.lineTo(S, i * (S / 9)); x.stroke();
    }
    return tex(c);
  });
}

/** 幌子 — the vertical cloth shop banner, with a soft woven grain */
export function bannerCloth(base = '#d9c48a') {
  return memo(`banner-${base}`, () => {
    const S = 128, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 3) {
      x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(0, i, S, 1);
      x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(i, 0, 1, S);
    }
    const v = x.createLinearGradient(0, 0, 0, S);
    v.addColorStop(0, 'rgba(255,255,255,0.1)');
    v.addColorStop(1, 'rgba(40,26,10,0.22)');
    x.fillStyle = v; x.fillRect(0, 0, S, S);
    return tex(c);
  });
}

/**
 * 招牌幌子 with a single glyph down the length — the vertical shop banner that
 * tells you which trade is behind the door. One texture per character.
 */
export function signboard(text, { base = '#d9c48a', ink = '#2a1408', edge = 'rgba(90,46,16,0.55)' } = {}) {
  return memo(`sign-${text}-${base}`, () => {
    const W = 128, H = 512, { c, x } = canvas(W, H);
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 4) {
      x.fillStyle = 'rgba(0,0,0,0.045)'; x.fillRect(i, 0, 1, H);
    }
    for (let i = 0; i < H; i += 5) {
      x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, i, W, 1);
    }
    x.strokeStyle = edge; x.lineWidth = 6; x.strokeRect(3, 3, W - 6, H - 6);
    x.fillStyle = ink;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const chars = [...text];
    const step = H / (chars.length + 0.4);
    chars.forEach((ch, i) => {
      x.font = `${Math.round(step * 0.82)}px "Songti SC","STSong","SimSun","KaiTi",serif`;
      x.fillText(ch, W / 2, step * (i + 0.7));
    });
    // weathering so the banner is not a flat sticker
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(30,16,6,0.2)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    return tex(c);
  });
}

/** 门版 — the plank shop door / 排门 board face */
export function planks(base = '#3a2517') {
  return memo(`plank-${base}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    const n = 7, w = S / n;
    for (let i = 0; i < n; i++) {
      const g = x.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.34)');
      g.addColorStop(0.5, 'rgba(255,220,180,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.3)');
      x.fillStyle = g; x.fillRect(i * w, 0, w, S);
    }
    x.fillStyle = 'rgba(20,10,4,0.5)';
    x.fillRect(0, S * 0.16, S, 6); x.fillRect(0, S * 0.8, S, 6);
    return tex(c);
  });
}

/* ------------------------------------------------------------------ 梳篦 */

/**
 * 梳齿 / 篦齿 — the tooth row of a comb, drawn as a repeating strip so the same
 * canvas serves a wooden 梳 (wide teeth) and a bamboo 篦 (hair-fine teeth).
 * `teeth` is the count across the strip; the texture repeats along X.
 */
export function combTeeth({ teeth = 22, base = '#d8b884', tooth = '#120c08', repeat = [1, 1] } = {}) {
  return memo(`comb-${teeth}-${base}`, () => {
    const S = 256, { c, x } = canvas(S, S);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    const w = S / teeth;
    for (let i = 0; i < teeth; i++) {
      x.fillStyle = tooth;
      x.fillRect(i * w + w * 0.52, 0, Math.max(0.9, w * 0.3), S);
    }
    for (let i = 0; i < 900; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(60,32,10,0.06)';
      x.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
    }
    return tex(c, { repeat });
  });
}

/**
 * 匾额 — a horizontal plaque with gold glyphs on lacquer, used on the 阁 front
 * and the 牌坊 额坊. Width follows the character count so three-char and
 * four-char plaques both keep their proportion.
 */
export function plaque(text, { base = '#221611', ink = '#e8c986' } = {}) {
  return memo(`plaque-${text}-${base}`, () => {
    const chars = [...text];
    const H = 128, W = Math.max(192, chars.length * 128);
    const { c, x } = canvas(W, H);
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
      x.fillRect(rnd() * W, rnd() * H, 2.2, 2.2);
    }
    x.strokeStyle = ink; x.globalAlpha = 0.5; x.lineWidth = 4;
    x.strokeRect(7, 7, W - 14, H - 14); x.globalAlpha = 1;
    x.fillStyle = ink;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `${Math.round(H * 0.66)}px "Songti SC","STSong","SimSun","KaiTi",serif`;
    const step = W / chars.length;
    chars.forEach((ch, i) => x.fillText(ch, step * (i + 0.5), H * 0.54));
    return tex(c);
  });
}

/** generic lit-window tile for the modern towers behind the old lane */
export function cityWindows({ warm = 0.78, density = 0.3 } = {}) {
  return memo(`citywin-${warm.toFixed(2)}-${density.toFixed(2)}`, () => {
    const S = 128, { c, x } = canvas(S, S);
    const cols = 6, rows = 6, cw = S / cols, chh = S / rows;
    // across the canal the new city has to read as one dim sheet of light, not a
    // wall of coloured LEDs
    const CITY = ['255,238,208', '255,226,186', '214,232,250', '236,242,250'];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (rnd() > density) continue;
        const hue = CITY[(rnd() * CITY.length) | 0];
        const k = 0.2 + rnd() * 0.4;
        const [r, g, b] = hue.split(',').map((n) => Math.round(Number(n) * k));
        x.fillStyle = `rgb(${r},${g},${b})`;
        x.fillRect(i * cw + cw * 0.22, j * chh + chh * 0.3, cw * 0.56, chh * 0.4);
      }
    }
    return tex(c);
  });
}
