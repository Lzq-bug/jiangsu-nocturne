/**
 * 正式卡面美术注册表（数据驱动 fallback）
 *
 * 约定：`src/assets/cards/{major,minor}/` 下的每个 SVG 文件，
 * 以文件名（去扩展名）在 FILE_BY_CARD 中登记到对应 cardId。
 * 有登记且文件存在 → CardArt 渲染正式插画；否则回退程序化纹章。
 * 新增正式美术时：放入 SVG 文件 + 在 FILE_BY_CARD 增加一行，零组件改动。
 */
const files = import.meta.glob('../assets/cards/**/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const URL_BY_FILE: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const base = path.split('/').pop()?.replace(/\.svg$/, '');
  if (base) URL_BY_FILE[base] = url;
}

/** cardId → 资产文件基名 */
const FILE_BY_CARD: Record<string, string> = {
  // —— 正式试制 8 张（视觉冻结基线 v1，见 docs/CARD_ART_STYLE_LOCK.md）——
  'major-0': 'major-00-the-fool',
  'major-6': 'major-06-the-lovers',
  'major-13': 'major-13-death',
  'major-21': 'major-21-the-world',
  'minor-wands-1': 'minor-wands-1',
  'minor-cups-2': 'minor-cups-2',
  'minor-swords-3': 'minor-swords-3',
  'minor-pentacles-14': 'minor-pentacles-14',
  // —— Batch 01（正式量产）——
  'major-1': 'major-01-the-magician',
  'major-2': 'major-02-the-high-priestess',
  'minor-wands-2': 'minor-wands-2',
  'minor-cups-3': 'minor-cups-3',
  // —— Batch 02 ——
  'major-3': 'major-03-the-empress',
  'major-4': 'major-04-the-emperor',
  'minor-swords-2': 'minor-swords-2',
  'minor-pentacles-2': 'minor-pentacles-2',
  // —— Batch 03 ——
  'major-5': 'major-05-the-hierophant',
  'major-7': 'major-07-the-chariot',
  'minor-wands-3': 'minor-wands-3',
  'minor-cups-4': 'minor-cups-4',
  // —— Batch 04 ——
  'major-8': 'major-08-strength',
  'major-9': 'major-09-the-hermit',
  'minor-swords-4': 'minor-swords-4',
  'minor-pentacles-3': 'minor-pentacles-3',
  // —— Batch 05（窗口 #2）——
  'major-10': 'major-10-wheel-of-fortune',
  'major-11': 'major-11-justice',
  'minor-wands-4': 'minor-wands-4',
  'minor-cups-5': 'minor-cups-5',
  // —— Batch 06 ——
  'major-12': 'major-12-the-hanged-man',
  'major-14': 'major-14-temperance',
  'minor-swords-5': 'minor-swords-5',
  'minor-pentacles-4': 'minor-pentacles-4',
  // —— Batch 07 ——
  'major-15': 'major-15-the-devil',
  'major-16': 'major-16-the-tower',
  'minor-wands-5': 'minor-wands-5',
  'minor-cups-6': 'minor-cups-6',
  // —— Batch 08 ——
  'major-17': 'major-17-the-star',
  'major-18': 'major-18-the-moon',
  'minor-swords-6': 'minor-swords-6',
  'minor-pentacles-5': 'minor-pentacles-5',
  // —— Batch 09（窗口 #3，月章 22/22 收官）——
  'major-19': 'major-19-the-sun',
  'major-20': 'major-20-judgement',
  'minor-wands-6': 'minor-wands-6',
  'minor-cups-7': 'minor-cups-7',
  // —— Batch 10 ——
  'minor-wands-7': 'minor-wands-7',
  'minor-cups-8': 'minor-cups-8',
  'minor-swords-7': 'minor-swords-7',
  'minor-pentacles-6': 'minor-pentacles-6',
  // —— Batch 11 ——
  'minor-wands-8': 'minor-wands-8',
  'minor-cups-9': 'minor-cups-9',
  'minor-swords-8': 'minor-swords-8',
  'minor-pentacles-7': 'minor-pentacles-7',
};

export const ARTWORK_BY_CARD: Readonly<Record<string, string | undefined>> = Object.fromEntries(
  Object.entries(FILE_BY_CARD).map(([cardId, file]) => [cardId, URL_BY_FILE[file]]),
);

/** 有正式美术且资产存在 → 返回 URL；否则 undefined（走程序化 fallback） */
export function artworkFor(cardId: string): string | undefined {
  return ARTWORK_BY_CARD[cardId];
}

/** 当前正式美术数量（测试与文档用） */
export const ARTWORK_COUNT = Object.values(ARTWORK_BY_CARD).filter(Boolean).length;
