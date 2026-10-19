/**
 * 落笔前的静态核对（不启动浏览器，一秒出结果）：
 *   node maoshan/tools/relief-check.mjs
 * 查四件事——① data.js 的常量在各模块里是否都取得到（undefined 进算术会变成 NaN 剔除整组几何）；
 * ② 峰高、台基与地标是否落在标高场上站得住的高度；③ 登山道的纵坡是否还像它声称的那种路；
 * ④ 机位是否埋在山体里、俯仰看得清东西、热点锚点贴不贴得住。
 * 用的是运行期同一套 relief/anchors，所以查出来的数就是画面里的数。
 */
import * as D from '../src/data.js';
import { heightAt, slopeAt, peakAlt, padTop, padOf, pathSamples, naturalAt, padZoneGap, padBlend } from '../src/relief.js';
import { buildStations } from '../src/anchors.js';

const num = (v) => (Number.isFinite(v) ? v.toFixed(1) : `!!${v}`);
let bad = 0;
const flag = (m) => { bad++; console.log(`  ✗ ${m}`); };

/* ---- 1. 引用核对 */
console.log('引用核对');
const need = [
  ['EXTENT', D.EXTENT], ['FOOT_Y', D.FOOT_Y], ['WATER_Y', D.WATER_Y],
  ['MOUNT.peaks', D.MOUNT?.peaks], ['MOUNT.ridges', D.MOUNT?.ridges], ['MOUNT.maxHeight', D.MOUNT?.maxHeight],
  ['PADS', D.PADS], ['PATHS', D.PATHS], ['CLOUD.y', D.CLOUD?.y], ['CLOUD.inner', D.CLOUD?.inner], ['CLOUD.outer', D.CLOUD?.outer],
  ['LAKE.rx', D.LAKE?.rx],
  ['DINGGONG.halls', D.DINGGONG?.halls], ['DINGGONG.gates', D.DINGGONG?.gates],
  ['YINGONG.halls', D.YINGONG?.halls], ['YINGONG.wings', D.YINGONG?.wings],
  ['LAOZI.totalH', D.LAOZI?.totalH], ['LAOZI.bodyH', D.LAOZI?.bodyH], ['LAOZI.podiumD', D.LAOZI?.podiumD],
  ['LAOZI.panels', D.LAOZI?.panels], ['LAOZI.gallery', D.LAOZI?.gallery],
  ['HUAYANG.chamber', D.HUAYANG?.chamber], ['HUAYANG.cutFrom', D.HUAYANG?.cutFrom], ['HUAYANG.steles', D.HUAYANG?.steles],
  ['GATE.paifang', D.GATE?.paifang], ['MEMORIAL.steps', D.MEMORIAL?.steps], ['MJJ.w', D.MJJ?.w],
  ['DEYOU.halls', D.DEYOU?.halls], ['WANSHOU.pad', D.WANSHOU?.pad], ['SHUTTLE.cars', D.SHUTTLE?.cars],
  ['FESTIVAL.zhai', D.FESTIVAL?.zhai], ['VERSES.chuhuazhong', D.VERSES?.chuhuazhong],
  ['STATIONS', D.STATIONS], ['DEFAULTS', D.DEFAULTS],
  ['LANTERN_LINE', D.LANTERN_LINE], ['CAVE_LINE', D.CAVE_LINE],
];
for (const [k, v] of need) if (v === undefined || v === null) flag(`data.js 缺 ${k}`);

/* ---- 2. 标高场 */
console.log('标高场');
for (const p of D.MOUNT.peaks) {
  const nat = peakAlt(p.id);
  console.log(`  ${p.name} 自然地面 ${num(nat)} m（意图 ${num(p.alt)}）`);
  if (!Number.isFinite(nat)) flag(`${p.name} 标高 NaN`);
  else if (Math.abs(nat - p.alt) > 3) flag(`${p.name} 自然地面 ${num(nat)} 与意图 ${num(p.alt)} 差 ${num(nat - p.alt)} m——脊或邻峰给多了，反解出的峰高被吃掉`);
}
for (const pad of D.PADS) {
  const y = heightAt(pad.x, pad.z);
  const top = padTop(pad.id);
  const sl = slopeAt(pad.x, pad.z, 6);
  // 台基边上不许出现"刀切"：从台基内 0.7 倍半轴起往外逐段量坡
  // 带勒脚挡土墙的台地（wall: true）允许陡，由 terrace.js 用石墙收口，只报数不判错
  // 只量台基收口区（边内 0.85 倍到边外 0.7 倍 feather）的坡，别把自然山坡算成刀切
  const f = pad.feather ?? 60;
  let maxG = 0, atG = '';
  const probe = (dx, dz, tag) => {
    const g = slopeAt(pad.x + dx, pad.z + dz, 5);
    if (g > maxG) { maxG = g; atG = tag; }
  };
  for (const [sx, sz, tag] of [[1, 0, 'E'], [-1, 0, 'W'], [0, 1, 'S'], [0, -1, 'N']]) {
    probe(sx * pad.rx * 0.85, sz * pad.rz * 0.85, `${tag}内`);
    probe(sx * (pad.rx + f * 0.3), sz * pad.rz, `${tag}30`);
    probe(sx * (pad.rx + f * 0.7), sz * pad.rz, `${tag}70`);
    probe(sx * pad.rx, sz * (pad.rz + f * 0.3), `${tag}30`);
    probe(sx * pad.rx, sz * (pad.rz + f * 0.7), `${tag}70`);
  }
  const nat = naturalAt(pad.x, pad.z);
  console.log(`  pad ${pad.id.padEnd(9)} 台面 ${num(top)} 实测 ${num(y)} 中心坡度 ${sl.toFixed(2)} 挖填 ${num(nat - top)} 收口段最大纵坡 ${(maxG * 100).toFixed(0)}%${pad.wall ? '（台地·有勒脚墙）' : ''}`);
  if (Math.abs(y - top) > 0.6) flag(`pad ${pad.id} 台面没削平（${num(y)} vs ${num(top)}）——多半是别的台地收口区搭了进来`);
  if (sl > 0.12) flag(`pad ${pad.id} 中心坡度 ${sl.toFixed(2)}，殿角会插进坡里`);
  if (!pad.wall && maxG > 0.6) flag(`pad ${pad.id} 收口段纵坡 ${(maxG * 100).toFixed(0)}%（t=${atG}）且没有勒脚墙，会露出生土坡面——要么加宽 feather，要么标 wall: true`);
  if (Math.abs(nat - top) > 120) flag(`pad ${pad.id} 挖方 ${num(nat - top)} m，台地切得太深，山体读不出原来的坡`);
}
// 台地是按数组顺序逐块削的，所以只禁"后排的收口区伸进前排的台面"
for (let i = 0; i < D.PADS.length; i++) {
  for (let j = i + 1; j < D.PADS.length; j++) {
    const a = D.PADS[i], b = D.PADS[j];
    const gap = padZoneGap(a, b);
    if (gap < (b.feather ?? 60)) flag(`pad ${b.id}（第 ${j} 位）的收口区伸进 ${a.id}（第 ${i} 位）的台面：两块只隔 ${num(gap)} m < ${num(b.feather ?? 60)} m，${a.id} 会被带斜`);
  }
}
for (const [name, site] of [['DINGGONG', D.DINGGONG], ['YINGONG', D.YINGONG], ['LAOZI', D.LAOZI],
  ['HUAYANG', D.HUAYANG], ['GATE', D.GATE], ['MEMORIAL', D.MEMORIAL], ['MJJ', D.MJJ], ['WANSHOU', D.WANSHOU]]) {
  const p = padOf(site.pad);
  if (!p) { flag(`${name} 指的 pad ${site.pad} 不存在`); continue; }
  const inside = Math.abs(site.x - p.x) <= p.rx && Math.abs(site.z - p.z) <= p.rz;
  const dy = heightAt(site.x, site.z) - padTop(site.pad);
  console.log(`  ${name.padEnd(9)} 站于 ${num(heightAt(site.x, site.z))}（台面差 ${num(dy)}）${inside ? '· 在台基内' : '· ⚠ 在台基外'}`);
  if (!inside) flag(`${name} 落在 pad ${site.pad} 之外，脚下不是平台`);
  if (Math.abs(dy) > 0.8) flag(`${name} 的地面与台面差 ${num(dy)} m，脚下不是平的`);
}
// 志书"华阳洞北距印宫约 300 米"——总平面是按这条摆的，改了坐标就要回来核
const dHy = Math.hypot(D.HUAYANG.x - D.YINGONG.x, D.HUAYANG.z - D.YINGONG.z);
console.log(`  华阳洞↔印宫 平面距离 ${num(dHy)} m（志书：约 ${D.HUAYANG.fromYingong} m）`);
if (Math.abs(dHy - D.HUAYANG.fromYingong) > 60) flag(`华阳洞距印宫 ${num(dHy)} m，与可考的 ${D.HUAYANG.fromYingong} m 对不上`);

/* ---- 3. 登山道 */
console.log('登山道');
for (const p of D.PATHS) {
  const S = pathSamples(p.id, p.perSeg || 22);
  if (!S || S.length < 2) { flag(`path ${p.id} 采样为空`); continue; }
  let len = 0, rise = 0, maxG = 0, maxGNat = 0, apron = 0, steep = 0;
  for (let i = 1; i < S.length; i++) {
    const planar = Math.hypot(S[i].x - S[i - 1].x, S[i].z - S[i - 1].z);
    const dy = S[i].y - S[i - 1].y;
    const g = Math.abs(dy) / Math.max(0.15, planar);
    len += planar; rise += dy;
    // 台地收口段是勒脚墙与坡道，属于工程做法，不算自然纵坡：只计数不判错
    const w = padBlend(S[i].x, S[i].z);
    if (w > 0.02 && w < 0.98) { apron += planar; maxG = Math.max(maxG, g); continue; }
    maxGNat = Math.max(maxGNat, g);
    if (g > 0.45) steep += planar;
  }
  const avg = rise / Math.max(1, len);
  console.log(`  ${p.id.padEnd(15)} ${num(len)} m，爬升 ${num(rise)} m（均坡 ${(avg * 100).toFixed(1)}%），自然坡最大 ${(maxGNat * 100).toFixed(0)}%，收口段 ${num(apron)} m（最大 ${(maxG * 100).toFixed(0)}%）`);
  if (!Number.isFinite(avg)) flag(`path ${p.id} 采样出 NaN`);
  if (p.kind === 'road' && avg > 0.17) flag(`road ${p.id} 平均纵坡 ${(avg * 100).toFixed(1)}%，"宽阔平坦的黑色公路"不该这么陡——再加几道之字弯`);
  if (p.kind === 'road' && maxGNat > 0.52) flag(`road ${p.id} 自然坡最大 ${(maxGNat * 100).toFixed(0)}%，驳运车上不去——之字弯的腰要贴着等高线走`);
  if (p.kind === 'stair' && maxGNat > 0.95) flag(`stair ${p.id} 自然坡最大 ${(maxGNat * 100).toFixed(0)}%，台阶段在生坡上打滑`);
}

/* ---- 4. 机位 */
console.log('机位');
let built = [];
try {
  built = buildStations(D.STATIONS);
} catch (e) {
  flag(`机位锚点解析失败：${e.message}`);
}
for (const s of built) {
  const [x, y, z] = s.pos;
  const g = heightAt(x, z);
  const eye = y - g;
  const dd = Math.hypot(x - s.look[0], z - s.look[2]);
  const pitch = Math.atan2(s.look[1] - y, dd) * 180 / Math.PI;
  console.log(`  ${s.id.padEnd(10)} 眼高 ${num(eye)} m（站于 ${num(g)}），目标平距 ${num(dd)} m、俯仰 ${pitch.toFixed(0)}°`);
  if (eye < 0.9) flag(`机位 ${s.id} 埋在山体里（眼高 ${num(eye)}）`);
  if (eye > 6 && s.eye[0] !== 'air') flag(`机位 ${s.id} 离地 ${num(eye)} m，脚下没有可站的地方`);
  if (Math.abs(pitch) > 62) flag(`机位 ${s.id} 俯仰 ${pitch.toFixed(0)}°，几乎在正上/正下看`);
  if (s.mark) {
    const d = Math.hypot(x - s.mark[0], z - s.mark[2]);
    const dy = s.mark[1] - heightAt(s.mark[0], s.mark[2]);
    console.log(`             mark 距 ${num(d)} m，锚于地面上方 ${num(dy)} m`);
    if (dy < 0.5) flag(`机位 ${s.id} 的 mark 贴不住（地面下或刚冒头 ${num(dy)} m）`);
    if (d > 1500) flag(`机位 ${s.id} 的 mark 在 ${num(d)} m 外，标签会糊成一团`);
  }
}
console.log(bad ? `\n${bad} 处需要修` : '\n全部通过');
process.exit(bad ? 1 : 0);
