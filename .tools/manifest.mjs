/**
 * 生成 docs/FINAL_ART_ASSET_MANIFEST.md（本地工具，不入库）
 * 数据源：src/tarot/data（卡牌元数据）+ src/assets/cards（正式 SVG）+ src/tarot/artwork.ts（登记表）
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.tools', '_data.mjs');
const esbuildJs = readdirSync(join(root, 'node_modules/.pnpm'))
  .filter((d) => d.startsWith('esbuild@'))
  .map((d) => join(root, 'node_modules/.pnpm', d, 'node_modules/esbuild/bin/esbuild'))[0];

execFileSync(process.execPath, [
  esbuildJs,
  join(root, 'src/tarot/data/index.ts'),
  '--bundle', '--format=esm', '--platform=node', '--log-level=silent',
  `--outfile=${out}`,
], { stdio: 'inherit' });

const { ALL_CARDS } = await import('file://' + out.replace(/\\/g, '/'));

// 正式美术登记表
const artSrc = readFileSync(join(root, 'src/tarot/artwork.ts'), 'utf8');
const FILE_BY_CARD = {};
for (const m of artSrc.matchAll(/'([a-z0-9-]+)':\s*'([^']+)'/g)) FILE_BY_CARD[m[1]] = m[2];

const sizes = {};
for (const dir of ['major', 'minor']) {
  const p = join(root, 'src/assets/cards', dir);
  for (const f of readdirSync(p)) {
    if (!f.endsWith('.svg')) continue;
    sizes[`${dir}/${f}`] = statSync(join(p, f)).size;
  }
}

const SUIT_ZH = { wands: '权杖', cups: '圣杯', swords: '宝剑', pentacles: '星币' };
const SUIT_EN = { wands: 'Wands', cups: 'Cups', swords: 'Swords', pentacles: 'Pentacles' };
const RANK_ZH = { 1: '王牌', 11: '侍从', 12: '骑士', 13: '王后', 14: '国王' };
const RANK_EN = { 1: 'Ace', 11: 'Page', 12: 'Knight', 13: 'Queen', 14: 'King' };

/** 生产阶段：按 artwork.ts 中的批次注释切分（注释形如  // —— Batch 01（正式量产）—— ） */
const phaseByCard = {};
{
  const lines = artSrc.split('\n');
  let phase = 'pilot-8';
  for (const line of lines) {
    const cm = /^\s*\/\/\s*(.+?)\s*$/.exec(line);
    if (cm && /[\u4e00-\u9fa5A-Za-z]/.test(cm[1])) {
      const label = cm[1]
        .replace(/[\u2014\u2015—–-]+/g, '')
        .replace(/[（(][^）)]*[）)]/g, '')
        .trim();
      if (label) phase = label;
      continue;
    }
    const km = /^\s*'([a-z0-9-]+)':/.exec(line);
    if (km) phaseByCard[km[1]] = phase;
  }
}

const rows = ALL_CARDS.map((c) => {
  const file = FILE_BY_CARD[c.id];
  const key = file ? `${c.arcana}/${file}.svg` : null;
  const size = key ? sizes[key] : undefined;
  const isCourt = c.arcana === 'minor' && c.rank >= 11;
  const suitZh = c.arcana === 'minor' ? SUIT_ZH[c.suit] : '—';
  const rankZh = c.arcana === 'minor' ? (RANK_ZH[c.rank] ?? `数字 ${c.rank}`) : `第 ${c.num + 1} 席`;
  return {
    id: c.id,
    zh: c.nameZh,
    en: c.nameEn,
    arcana: c.arcana === 'major' ? 'Major' : 'Minor',
    suit: suitZh,
    rank: rankZh,
    court: isCourt ? 'Y' : '—',
    file,
    size,
    phase: phaseByCard[c.id] ?? '—',
  };
});

const missing = rows.filter((r) => !r.file || !r.size);
const totBytes = rows.reduce((a, r) => a + (r.size || 0), 0);
const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;

let md = `# FINAL ART ASSET MANIFEST · 正式美术资产清单

> 本文件由 \`src/tarot/data\`（卡牌元数据）、\`src/assets/cards\`（正式 SVG 文件）
> 与 \`src/tarot/artwork.ts\`（卡面登记表）交叉核对生成，为唯一权威资产清单。

| 项 | 值 |
| --- | --- |
| ARTWORK_COUNT | **${rows.filter((r) => r.size).length}** |
| Major Arcana | **${rows.filter((r) => r.arcana === 'Major' && r.size).length} / 22** |
| Minor Arcana | **${rows.filter((r) => r.arcana === 'Minor' && r.size).length} / 56** |
| Court Cards | **${rows.filter((r) => r.court === 'Y' && r.size).length} / 16** |
| 资产总体积 | **${fmt(totBytes)}**（${totBytes} B） |
| 状态 | 全部 **FROZEN** |
| 缺失 / 未登记 | ${missing.length === 0 ? '**0**' : missing.map((m) => m.id).join(', ')} |

- 所有卡面均为**原创程序化 SVG**（手写矢量指令，无位图、无外部素材、无 AI 生成图）。
- 构建期 \`vite.config.ts\` 设 \`assetsInlineLimit: 0\`，78 张 SVG **一律独立发射为文件**，
  不内联进 JS，保证可缓存与懒加载。
- 本清单标记的「生产阶段」对应 \`docs/ART_PRODUCTION_SESSION_0*.md\` 与 \`src/tarot/artwork.ts\` 中的批次注释。

## 78 张正式卡面

| # | id | 中文 | EN | Arcana | Suit | Rank | Court | SVG 文件 | 体积 | 生产阶段 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
`;

rows.forEach((r, i) => {
  md += `| ${i + 1} | \`${r.id}\` | ${r.zh} | ${r.en} | ${r.arcana} | ${r.suit} | ${r.rank} | ${r.court} | \`${r.file ?? '—'}.svg\` | ${r.size ? fmt(r.size) : '—'} | ${r.phase} | ${r.size ? 'FROZEN' : 'MISSING'} |\n`;
});

md += `
## 校验方式

\`\`\`bash
npm run typecheck     # 卡面登记表与数据一致性
npm test              # src/tarot/artwork.test.ts：78 张登记完整性
\`\`\`

\`src/tarot/artwork.test.ts\` 断言：登记表条目数 = 78、每张牌均有对应资产文件、无多余登记。
`;

mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs/FINAL_ART_ASSET_MANIFEST.md'), md);
console.log(JSON.stringify({ count: rows.length, withArt: rows.filter((r) => r.size).length, missing: missing.map((m) => m.id), totBytes, phases: [...new Set(rows.map((r) => r.phase))] }, null, 2));
