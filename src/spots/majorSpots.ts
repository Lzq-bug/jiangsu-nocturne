/**
 * 城章 · 22 个最具代表性的江苏夜景地标
 * 文案三层结构：灯语短句 / 夜话解读 / 收藏者批注（见视觉规范）
 */
import type { SpotArt } from '@/tarot/types';

export interface MajorSpotSeed {
  /** 牌位 0-21 */
  slot: number;
  nameZh: string;
  nameEn: string;
  city: string;
  keywords: string[];
  /** 夜色主光色 */
  accent: string;
  meaning: string;
  oracle: string;
  interpretation: string;
  note: string;
  art: SpotArt;
}

export const MAJOR_SPOTS: MajorSpotSeed[] = [
  {
    slot: 0, nameZh: '夫子庙·秦淮画舫', nameEn: 'Qinhuai Night Ferry', city: '南京',
    keywords: ['画舫', '灯影', '桨声'], accent: '#F2B24C',
    meaning: '一河灯影载着金陵的旧梦与人间烟火。',
    oracle: '灯是河写给夜的信。',
    interpretation: '自六朝起，这条河就把灯火当作母语——画舫推开的每一道波纹，都是被灯照亮的水写给夜的回执。你在桥上看见的不是倒影，是金陵一千七百年的夜，正被游船一桨一桨地摇进此刻。',
    note: '画舫过尽，灯影还在袖口停了一站。——夜航手记·第一页',
    art: { motifs: ['ferry', 'street'], moon: 0.8 },
  },
  {
    slot: 1, nameZh: '中华门·瓮城灯阵', nameEn: 'Zhonghua Gate at Night', city: '南京',
    keywords: ['瓮城', '藏兵洞', '灯阵'], accent: '#E08A4E',
    meaning: '三重瓮城，把六百年的月光围在掌心。',
    oracle: '城砖的缝隙里，藏着六百年的更声。',
    interpretation: '世界上保存最完好的瓮城，夜里比白昼更接近它的本意——灯阵沿雉堞排开，把藏兵洞的深浅逐一标注。城是静的，灯是它的呼吸：一层城门一重夜，走进去，就走进明代点起的第一盏。',
    note: '数灯阵数到第三重，忘了自己是要进城还是出城。——夜航手记·第二页',
    art: { motifs: ['gate', 'wall'], moon: 0.24, phase: 'full' },
  },
  {
    slot: 2, nameZh: '拙政园·拙政问雅', nameEn: 'Humble Garden by Moonlight', city: '苏州',
    keywords: ['夜园', '月洞门', '雅集'], accent: '#9CC79A',
    meaning: '借一夜月光，还园林半阙宋词。',
    oracle: '月洞门框住的，是五百年前的这轮月。',
    interpretation: '白日的拙政园属于游客，夜晚属于月光。问雅夜游把灯藏进花窗与廊影，亭台成了砚，池水成了纸——五百年前造园人埋下的每一处借景，都在夜里兑了现。你走过一道月洞门，就翻过一页园主的夜稿。',
    note: '在月洞门里站了一会儿，替五百年前的月亮收了个信。——夜航手记·第三页',
    art: { motifs: ['garden'], moon: 0.7 },
  },
  {
    slot: 3, nameZh: '平江路·灯河夜巷', nameEn: 'Pingjiang Lane Lights', city: '苏州',
    keywords: ['水巷', '评弹', '灯河'], accent: '#E8B04A',
    meaning: '一条河牵着两条街，评弹声在三步之外。',
    oracle: '摇橹声过处，水巷把灯揉碎了又拼上。',
    interpretation: '平江路是苏州城左手的掌纹，八百年没改过走向。夜里灯沿河点齐，水巷把灯影揉碎又拼上，评弹的三弦从某扇半开的木窗里漏出来。走在这条街上要慢——一快，就把宋代的夜走成了今天。',
    note: '三弦声追了我半条街，在桥头替我付了灯影的钱。——夜航手记·第四页',
    art: { motifs: ['street', 'bridge'], moon: 0.76 },
  },
  {
    slot: 4, nameZh: '金鸡湖·东方之门', nameEn: 'Gate of the Orient', city: '苏州',
    keywords: ['天际线', '湖畔', '新城'], accent: '#7FD6D0',
    meaning: '湖面把整座新城的灯，又建了一遍。',
    oracle: '夜给新城第二次落成典礼。',
    interpretation: '白天的金鸡湖属于写字楼与游艇，夜里属于倒影。东方之门立在天际线上，像一个通向明天的门框；湖面不甘示弱，把整排灯火原样再建一遍。老苏州在小巷里睡去，新苏州在湖畔醒着——两种夜色隔水相安。',
    note: '数了数，水里的城比岸上的城亮得还认真些。——夜航手记·第五页',
    art: { motifs: ['skyscraper'], moon: 0.3, phase: 'full' },
  },
  {
    slot: 5, nameZh: '寒山寺·枫桥夜泊', nameEn: 'Maple Bridge Night Mooring', city: '苏州',
    keywords: ['钟声', '渔火', '客船'], accent: '#D9A441',
    meaning: '千年前那盏渔火，至今仍停在枫桥边。',
    oracle: '夜半钟声到客船——你也是客船。',
    interpretation: '月落、乌啼、霜满天，张继把整座江南的夜压缩进二十八个字。如今枫桥仍在，渔火换成了灯影，钟声照旧在半夜出发，去寻每一艘迟到的客船。所谓夜泊，泊的不是船，是每个赶路人没说出口的心事。',
    note: '钟声敲到第三下，我终于承认自己是被一首诗带到这里来的。——夜航手记·第六页',
    art: { motifs: ['pagoda', 'bridge'], moon: 0.18 },
  },
  {
    slot: 6, nameZh: '瘦西湖·五亭桥月', nameEn: 'Five Pavilion Bridge Moon', city: '扬州',
    keywords: ['桥亭', '湖月', '烟花'], accent: '#C9A25C',
    meaning: '十五个桥洞，含着十五个月亮。',
    oracle: '亭是桥的冠，月是湖的心事。',
    interpretation: '五亭桥像一朵浮在湖上的莲，十五个桥洞在满月之夜各含一轮月影——这是扬州替中国守了三百年的月色。夜游的画舫从桥洞里穿进穿出，把乾隆年间的水路原样走了一遍。所谓烟花三月，不过是扬州夜的序章。',
    note: '十五个月亮数到最后，分不清哪个是正本，也不必分了。——夜航手记·第七页',
    art: { motifs: ['bridge'], moon: 0.62, phase: 'full' },
  },
  {
    slot: 7, nameZh: '东关街·灯火长街', nameEn: 'Dongguan Street Lights', city: '扬州',
    keywords: ['长街', '青石板', '老铺'], accent: '#E0985A',
    meaning: '一千二百米的青石板，从唐代亮到今夜。',
    oracle: '长街尽头，晚风正在分装甜香。',
    interpretation: '东关街是扬州抄给后人的一页唐代手稿，一千二百米的青石板路，两边的老铺把灯次第点亮。藕粉、酱菜、三把刀的传说混在甜香里，晚风成了分装师傅。走到街尾城楼下回头——整条街的灯火，像一条搁浅在人间的银河。',
    note: '替远道的朋友捎了一包灯影，店家说不收钱，说这东西管够。——夜航手记·第八页',
    art: { motifs: ['street'], moon: 0.28 },
  },
  {
    slot: 8, nameZh: '清名桥·运河灯河', nameEn: 'Qingming Bridge Canal', city: '无锡',
    keywords: ['拱桥', '枕河人家', '运河'], accent: '#6FC2C9',
    meaning: '古运河把最温柔的一弯，留给了清名桥。',
    oracle: '桥洞是运河睁着的一只眼睛。',
    interpretation: '运河在无锡拐了一个温柔的弯，把枕河人家尽数揽进怀里，又在清名桥处拱起一道石弯。夜里桥洞映着灯河，像运河睁着的一只眼睛，看摇橹船载着灯影进出。所谓江南水弄堂，到这里才算正文。',
    note: '船从桥洞钻出来的那一刻，运河眨了一下眼。——夜航手记·第九页',
    art: { motifs: ['bridge', 'street'], moon: 0.72 },
  },
  {
    slot: 9, nameZh: '鼋头渚·太湖灯塔', nameEn: 'Turtle Head Isle Lighthouse', city: '无锡',
    keywords: ['太湖', '灯塔', '渚',], accent: '#86C5D4',
    meaning: '太湖佳绝处，灯塔替渔火守着夜。',
    oracle: '灯转一圈，湖就把夜数了一遍。',
    interpretation: '鼋头渚是太湖伸出来的一只手，接住了三万六千顷的浩渺。夜里的灯塔沿着旧时刻度旋转，光扫过湖面，水就亮一次——像有人在给太湖定时把脉。樱花谢了的季节，夜色就是这里的花期。',
    note: '灯塔扫过第七圈时，湖对岸有一颗星主动报了到。——夜航手记·第十页',
    art: { motifs: ['lighthouse', 'hill'], moon: 0.66 },
  },
  {
    slot: 10, nameZh: '西津渡·一眼千年', nameEn: 'Xijin Ferry Wharf', city: '镇江',
    keywords: ['古渡', '街巷', '千年'], accent: '#D9814E',
    meaning: '一步之内，唐宋元明清的街石次第亮起。',
    oracle: '石阶向下三寸，就是唐朝的夜。',
    interpretation: '西津渡是长江边最老的一处渡口，玻璃罩着唐代的街石，一层压着一层，像时间的千层饼。夜里灯笼沿街挂齐，从待渡亭到救生会，灯影把「一眼千年」四个字亮给你看。渡口早没了船，夜色仍在等渡。',
    note: '在待渡亭坐了半刻，替一千年的摆渡人说了个晚安。——夜航手记·第十一页',
    art: { motifs: ['street'], moon: 0.74 },
  },
  {
    slot: 11, nameZh: '金山寺·江天禅夜', nameEn: 'Jinshan Temple Night', city: '镇江',
    keywords: ['寺裹山', '慈寿塔', '江夜'], accent: '#E3C27E',
    meaning: '寺裹山，山裹灯，灯裹一江夜色。',
    oracle: '塔尖的灯，是江面最早睡去的一颗星。',
    interpretation: '金山寺的特别在于「寺裹山」——殿宇层层把小山包住，夜里灯从山脚亮到慈寿塔尖，整座山成了一盏立着的灯笼。长江在山脚下放轻了脚步，白蛇传的水漫金山沉在夜的底稿里，只剩禅意与灯光互道平安。',
    note: '上山时灯亮着，下山时江雾提灯来接。——夜航手记·第十二页',
    art: { motifs: ['temple', 'pagoda'], moon: 0.22 },
  },
  {
    slot: 12, nameZh: '天宁宝塔·天宁佛光', nameEn: 'Tianning Pagoda Glow', city: '常州',
    keywords: ['宝塔', '金顶', '梵夜'], accent: '#F0C25E',
    meaning: '一百五十三米的金顶，把整座城安顿在宁静里。',
    oracle: '塔灯次第亮起，像一句拖得很长的晚安。',
    interpretation: '天宁宝塔是中国最高的佛塔，夜里灯光自下而上次第点亮，像有人把一句晚安慢慢说完。塔影落在京杭运河上，古刹的钟声与城市的灯火在同一水面和解。它不参与喧嚣，只负责在夜色里替全城兜底。',
    note: '塔灯亮完那一秒，整个常州都像被盖好了被子。——夜航手记·第十三页',
    art: { motifs: ['pagoda'], moon: 0.34 },
  },
  {
    slot: 13, nameZh: '青果巷·运河灯巷', nameEn: 'Qingguo Lane Night', city: '常州',
    keywords: ['名士巷', '运河', '灯影'], accent: '#E8A05C',
    meaning: '江南名士第一巷，灯影落在百年门槛上。',
    oracle: '巷子很窄，窄得只容月光和历史并肩。',
    interpretation: '青果巷走出了半个常州的文化家谱，唐荆川、周有光都在这里点过灯。夜里的巷子窄而深，灯影落在百年门槛上，运河在不远处替它押着韵。巷子不长，走完却要很久——每一步都踩在某位名士的旧脚印旁边。',
    note: '在周有光旧居门口借了一盏灯的光，读完了半页巷志。——夜航手记·第十四页',
    art: { motifs: ['street'], moon: 0.7 },
  },
  {
    slot: 14, nameZh: '濠河·环濠夜画', nameEn: 'Haohe River Night Ring', city: '南通',
    keywords: ['护城河', '灯带', '夜画'], accent: '#7AC0B8',
    meaning: '一条护城河，把整座城围成一幅夜画。',
    oracle: '濠河不流急水，只流灯光。',
    interpretation: '濠河是国内保存最完整的古护城河之一，千百年来只做一件事：把南通温柔地围起来。夜里灯带沿河亮成一笔闭环，游船像画笔在环上描摹——博物馆、塔影、绿岸都被装进这幅会流动的夜画。城在画中，画在夜里。',
    note: '船行一周，恰好把濠河这幅画从头到尾临了一遍。——夜航手记·第十五页',
    art: { motifs: ['lake', 'bridge'], moon: 0.6, phase: 'full' },
  },
  {
    slot: 15, nameZh: '连岛·在海一方', nameEn: 'Liandao by the Sea', city: '连云港',
    keywords: ['海岛', '渔火', '长堤'], accent: '#8FB8D9',
    meaning: '海风把渔火与星光吹成一片。',
    oracle: '浪声是海在给夜读诗。',
    interpretation: '连岛是江苏最大的海岛，长堤把它与大陆轻轻挽住。夜里渔火泊在港湾，浪一层层把白天的游客账目抹平，只剩海风、礁石与星光对账。在这里的夜不需要节目——海自己就是全部节目。',
    note: '海风把外套吹成船帆，我果断决定把今夜泊在这里。——夜航手记·第十六页',
    art: { motifs: ['sea', 'lighthouse'], moon: 0.5 },
  },
  {
    slot: 16, nameZh: '云龙湖·苏公塔影', nameEn: 'Yunlong Lake Pagoda', city: '徐州',
    keywords: ['湖山', '苏公塔', '倒影'], accent: '#C7CEDD',
    meaning: '湖是彭城的一砚墨，塔是蘸墨的笔。',
    oracle: '苏公塔把自己站成湖最长的倒影。',
    interpretation: '云龙湖是徐州递给江南的一封回信——北方的城，也有如此温润的湖山。苏公塔沿东坡遗韵立在湖畔，夜里塔身亮起，倒影笔直入水，像一支蘸满灯墨的笔。湖山相依处，楚汉的雄浑与江南的婉约握手言和。',
    note: '塔影入水那一笔，替彭城把今夜写完了。——夜航手记·第十七页',
    art: { motifs: ['pagoda', 'lake'], moon: 0.64 },
  },
  {
    slot: 17, nameZh: '凤城河·望海楼夜', nameEn: 'Wanghai Tower Night', city: '泰州',
    keywords: ['望海楼', '凤城河', '千灯'], accent: '#D9A75E',
    meaning: '江淮第一楼望出去，是凤城河的千灯。',
    oracle: '楼名为望海，今夜望的是满河灯火。',
    interpretation: '望海楼是泰州的文化天际线，楼名里藏着这片土地与海的旧缘分。夜里登楼，凤城河的千灯沿水铺开，找不到海，就找到一条被灯火养得很富态的河。戏剧家梅兰芳的乡音，混在水腔灯调里轻轻回放。',
    note: '在楼上替古人望了一会儿海，海没来，灯全来了。——夜航手记·第十八页',
    art: { motifs: ['pavilion'], moon: 0.68 },
  },
  {
    slot: 18, nameZh: '清江浦·里运河灯', nameEn: 'Qingjiangpu Canal Night', city: '淮安',
    keywords: ['清江浦', '漕运', '运河夜'], accent: '#E0B054',
    meaning: '南船北马交汇处，运河的夜从不打烊。',
    oracle: '漕运的更鼓远了，灯还在接力。',
    interpretation: '清江浦曾是明清漕运的心脏，「南船北马」在此换乘。如今更鼓声远了，里运河两岸的灯却一场没落下——把六百年的航运史，换成了一场永不散场的灯会。国师塔立在水口，像一枚按在运河乐谱上的定音印。',
    note: '在浦楼边听了一晚上水声，替漕运总署值了半宿的班。——夜航手记·第十九页',
    art: { motifs: ['gate', 'pagoda'], moon: 0.26 },
  },
  {
    slot: 19, nameZh: '大纵湖·东晋水城', nameEn: 'Dongzong Water Town', city: '盐城',
    keywords: ['水城', '湖荡', '灯影'], accent: '#9FB6D9',
    meaning: '一座水上城池，把宋夜的灯火泊在湖心。',
    oracle: '水城把倒影收进城门，夜就深了一倍。',
    interpretation: '大纵湖畔的东晋水城，把一段北宋的建城史泊在湖荡之间。夜里城墙与水街一同亮灯，倒影沉进湖心，城便有了上下两份灯火。芦苇在远处替它压着韵脚——苏北的夜，原来可以这样软。',
    note: '数城里的灯数到一半，另一半在水里接着数。——夜航手记·第二十页',
    art: { motifs: ['wall', 'lake'], moon: 0.58 },
  },
  {
    slot: 20, nameZh: '项王故里·灯火雄风', nameEn: 'Hometown of Xiang Yu', city: '宿迁',
    keywords: ['项王', '梧桐', '灯幡'], accent: '#D96A4E',
    meaning: '梧桐灯下，一声楚韵仍带千钧。',
    oracle: '力拔山兮的气，如今用来点亮满院灯。',
    interpretation: '项王故里把西楚霸王的少年气留在了一座庭院里：千年梧桐、项里桐、手植的传说与灯幡一起守夜。夜灯把仿古的城阙照得棱角分明，楚韵在灯影里仍是硬的——这里的夜不缠绵，它负责扛。',
    note: '灯幡在风里立了半宿，比我想象中的霸王温柔，比温柔的更结实。——夜航手记·第二十一页',
    art: { motifs: ['banner', 'gate'], moon: 0.3 },
  },
  {
    slot: 21, nameZh: '江海夜潮·奔流入海', nameEn: 'River Meets Sea at Night', city: '江海交汇',
    keywords: ['长江', '入海', '星潮'], accent: '#A8D8D8',
    meaning: '万里长江在此，把整段旅途写成海。',
    oracle: '江水至此，把一路的灯都交给了星光。',
    interpretation: '全册的终章不在任何一座城，而在江与海交割的地方。万里长江自雪山而来，把金陵的灯、姑苏的桥、淮扬的月悉数收进行囊，在夜潮里一次交还给太平洋。七十八帧夜色至此合卷——夜泊的下一站，是海。',
    note: '合上册子那晚，梦见自己成了一段终于入海的江。——夜航手记·终章',
    art: { motifs: ['sea'], moon: 0.46, phase: 'full' },
  },
];
