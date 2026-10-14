/**
 * 夜签 · 56 个江苏夜景（四大夜色系列 × 14）
 * 灯影（原权杖）· 水岸（原圣杯）· 山寺（原宝剑）· 城垣（原星币）
 */
import type { MinorRank, SpotArt, SuitKey } from '@/tarot/types';

export interface MinorSpotSeed {
  rank: MinorRank;
  nameZh: string;
  nameEn: string;
  city: string;
  keywords: string[];
  /** 缺省用系列主色 */
  accent?: string;
  meaning: string;
  oracle: string;
  art: SpotArt;
}

export const MINOR_SPOTS: Record<SuitKey, MinorSpotSeed[]> = {
  /* ---------------- 灯影 · 灯会夜市楼阁灯火 ---------------- */
  wands: [
    {
      rank: 1, nameZh: '老门东', nameEn: 'Laomendong', city: '南京',
      keywords: ['牌坊', '灯串', '深巷'], meaning: '城墙根下，一整条巷子的灯笼刚点齐。',
      oracle: '灯串把巷口的高度，定在人间的肩膀上。',
      art: { motifs: ['street'], moon: 0.74 },
    },
    {
      rank: 2, nameZh: '山塘街', nameEn: 'Shantang Street', city: '苏州',
      keywords: ['七里', '水巷', '灯市'], meaning: '七里灯市沿河铺开，半条街在桥影里。',
      oracle: '白居易修的堤，今夜用来泊灯。',
      art: { motifs: ['street', 'bridge'], moon: 0.7 },
    },
    {
      rank: 3, nameZh: '南长街', nameEn: 'Nanchang Street', city: '无锡',
      keywords: ['枕河', '灯影', '人家'], meaning: '千年运河人家，把灯火挂在枕河的窗口。',
      oracle: '窗一扇，灯一盏，河一梦。',
      art: { motifs: ['street'], moon: 0.68 },
    },
    {
      rank: 4, nameZh: '皮市街', nameEn: 'Pishi Street', city: '扬州',
      keywords: ['市集', '烟火', '暖黄'], meaning: '文艺小街的夜，被小吃摊的暖黄统治。',
      oracle: '人间烟火气，最抚凡人心。',
      art: { motifs: ['street'], moon: 0.76 },
    },
    {
      rank: 5, nameZh: '双桂坊', nameEn: 'Shuanggui Fang', city: '常州',
      keywords: ['老坊', '食香', '灯火'], meaning: '百年老坊的夜，从一笼热气开始。',
      oracle: '香气总是比灯先亮。',
      art: { motifs: ['street'], moon: 0.72 },
    },
    {
      rank: 6, nameZh: '稻河古街', nameEn: 'Daohe Old Street', city: '泰州',
      keywords: ['市河', '瓦檐', '灯河'], meaning: '稻河两岸，瓦檐下的灯一盏盏数着流水。',
      oracle: '河抱街，街抱灯，灯抱晚归人。',
      art: { motifs: ['street'], moon: 0.66 },
    },
    {
      rank: 7, nameZh: '盐镇水街', nameEn: 'Yanzhen Water Street', city: '盐城',
      keywords: ['水街', '戏台', '灯筏'], meaning: '水街的夜有戏腔，灯筏顺水漂成一句唱词。',
      oracle: '灯筏是水街寄给夜的请柬。',
      art: { motifs: ['street', 'ferry'], moon: 0.62 },
    },
    {
      rank: 8, nameZh: '花街', nameEn: 'Hua Street', city: '淮安',
      keywords: ['花灯', '石板', '巷陌'], meaning: '花街不长，灯火却开得比花还密。',
      oracle: '街以花名，夜以灯为蕊。',
      art: { motifs: ['street'], moon: 0.78 },
    },
    {
      rank: 9, nameZh: '新盛街', nameEn: 'Xinsheng Street', city: '宿迁',
      keywords: ['老街', '新灯', '灯市'], meaning: '老街重新亮起来，像旧信封贴了新邮票。',
      oracle: '老街的夜，新旧灯各点一半。',
      art: { motifs: ['street'], moon: 0.64 },
    },
    {
      rank: 10, nameZh: '回龙窝', nameEn: 'Huilongwo', city: '徐州',
      keywords: ['院落', '灯巷', '汉风'], meaning: '汉风院落间，灯火把巷子折成回字。',
      oracle: '巷子回了几折，灯就跟了几折。',
      art: { motifs: ['street'], moon: 0.7 },
    },
    {
      rank: 11, nameZh: '盐河巷', nameEn: 'Yanhe Lane', city: '连云港',
      keywords: ['盐河', '夜市', '霓虹'], meaning: '盐河两岸夜市开张，霓虹落进河里结成盐霜。',
      oracle: '河水尝一口，是咸的，也是亮的。',
      art: { motifs: ['street'], moon: 0.6 },
    },
    {
      rank: 12, nameZh: '唐闸古镇', nameEn: 'Tangzha Town', city: '南通',
      keywords: ['工房', '钟楼', '灯河'], meaning: '近代工业遗存的夜里，红灯点亮了百年钟楼。',
      oracle: '钟楼报时，灯河报夜。',
      art: { motifs: ['street', 'skyscraper'], moon: 0.58 },
    },
    {
      rank: 13, nameZh: '熙南里', nameEn: 'Xinanli', city: '南京',
      keywords: ['甘熙故居', '灯坊', '闹市'], meaning: '九十九间半的宅院旁，灯只点亮安静的一半。',
      oracle: '大宅的夜，留一半灯给月亮。',
      art: { motifs: ['street', 'garden'], moon: 0.72 },
    },
    {
      rank: 14, nameZh: '月光码头', nameEn: 'Moonlight Marina', city: '苏州',
      keywords: ['金鸡湖', '游艇', '灯港'], meaning: '金鸡湖畔的夜港，灯火排成靠岸的雁阵。',
      oracle: '月亮也在这里泊船。',
      art: { motifs: ['skyscraper', 'lake'], moon: 0.54, phase: 'full' },
    },
  ],

  /* ---------------- 水岸 · 水乡河街画舫桨声 ---------------- */
  cups: [
    {
      rank: 1, nameZh: '南京长江大桥', nameEn: 'Nanjing Yangtze Bridge', city: '南京',
      keywords: ['钢桁', '桥头堡', '灯链'], meaning: '一桥飞架，灯链把长江别上一枚发卡。',
      oracle: '灯链量出江的宽度，也量出夜的高度。',
      art: { motifs: ['bridge'], moon: 0.5, phase: 'full' },
    },
    {
      rank: 2, nameZh: '周庄古镇', nameEn: 'Zhouzhuang', city: '苏州',
      keywords: ['双桥', '水阁', '乌篷'], meaning: '双桥收拢了全部水声，乌篷载着灯影过夜。',
      oracle: '水阁的窗，是周庄睁着的眼睛。',
      art: { motifs: ['street', 'ferry'], moon: 0.66 },
    },
    {
      rank: 3, nameZh: '同里古镇', nameEn: 'Tongli', city: '苏州',
      keywords: ['三桥', '退思园', '灯水'], meaning: '三桥环抱着水镇的心事，灯把夜摇得很软。',
      oracle: '桥桥相望，灯水相亲。',
      art: { motifs: ['bridge', 'street'], moon: 0.7 },
    },
    {
      rank: 4, nameZh: '甪直古镇', nameEn: 'Luzhi', city: '苏州',
      keywords: ['桥都', '水巷', '灯影'], meaning: '甪直的桥多得数不清，灯影替你数。',
      oracle: '一座桥，一个水位的灯。',
      art: { motifs: ['bridge', 'street'], moon: 0.64 },
    },
    {
      rank: 5, nameZh: '千灯古镇', nameEn: 'Qiandeng', city: '苏州',
      keywords: ['石板街', '灯河', '昆腔'], meaning: '千灯的夜名不虚传——水巷处处是灯。',
      oracle: '一千盏灯里，总有一盏在等你。',
      accent: '#E8C25A',
      art: { motifs: ['street'], moon: 0.72 },
    },
    {
      rank: 6, nameZh: '荡口古镇', nameEn: 'Dangkou', city: '无锡',
      keywords: ['水弄堂', '仓廪', '灯河'], meaning: '鹅湖之畔，水弄堂把灯排成一行省略号。',
      oracle: '灯在水里写省略号，写了一整夜。',
      art: { motifs: ['street'], moon: 0.68 },
    },
    {
      rank: 7, nameZh: '古运河夜游', nameEn: 'Grand Canal Night Cruise', city: '扬州',
      keywords: ['画舫', '灯带', '运河'], meaning: '画舫犁开的不是水，是两岸灯带织的绸。',
      oracle: '夜游的终点，是把自己泊进灯里。',
      art: { motifs: ['ferry'], moon: 0.58 },
    },
    {
      rank: 8, nameZh: '东坡公园', nameEn: 'Dongpo Park', city: '常州',
      keywords: ['舣舟亭', '古渡', '灯水'], meaning: '东坡泊舟处，今夜的灯替他守着渡口。',
      oracle: '渡口不问归期，只留一盏灯。',
      art: { motifs: ['pavilion'], moon: 0.66 },
    },
    {
      rank: 9, nameZh: '溱湖夜泊', nameEn: 'Qinhu Lake Night', city: '泰州',
      keywords: ['湿地', '芦影', '渔灯'], meaning: '溱湖的夜交给芦苇和渔灯，水鸟都睡了。',
      oracle: '芦影摇处，湖在均匀呼吸。',
      art: { motifs: ['lake'], moon: 0.62 },
    },
    {
      rank: 10, nameZh: '水绘园', nameEn: 'Shuihui Garden', city: '南通',
      keywords: ['水绘', '亭影', '灯月'], meaning: '天下名园之夜，水绘着亭，灯绘着水。',
      oracle: '水绘园的夜，是灯在水上作画。',
      art: { motifs: ['garden'], moon: 0.7 },
    },
    {
      rank: 11, nameZh: '河下古镇', nameEn: 'Hexia Ancient Town', city: '淮安',
      keywords: ['石板街', '文楼', '灯巷'], meaning: '河下的夜安静，静得听见灯芯开花。',
      oracle: '石板街上，灯是夜的标点。',
      art: { motifs: ['street'], moon: 0.74 },
    },
    {
      rank: 12, nameZh: '骆马湖', nameEn: 'Luoma Lake', city: '宿迁',
      keywords: ['湖岸', '水色', '星光'], meaning: '骆马湖把星空接了一段，铺在湖面上。',
      oracle: '湖是星星的第二故乡。',
      art: { motifs: ['lake'], moon: 0.56, phase: 'full' },
    },
    {
      rank: 13, nameZh: '窑湾古镇', nameEn: 'Yaowan Ancient Town', city: '徐州',
      keywords: ['运河', '老街', '灯影'], meaning: '运河拐弯处，窑湾把灯影泊了千年。',
      oracle: '拐弯的水最懂留灯。',
      art: { motifs: ['street', 'lake'], moon: 0.6 },
    },
    {
      rank: 14, nameZh: '莫愁湖', nameEn: 'Mochou Lake', city: '南京',
      keywords: ['湖亭', '灯月', '烟水'], meaning: '莫愁的夜不愁，湖亭与灯月两两相照。',
      oracle: '湖上有亭，亭上有月，月下无愁。',
      art: { motifs: ['pavilion', 'lake'], moon: 0.64, phase: 'full' },
    },
  ],

  /* ---------------- 山寺 · 山林古寺塔影钟声 ---------------- */
  swords: [
    {
      rank: 1, nameZh: '灵山大佛', nameEn: 'Grand Buddha at Lingshan', city: '无锡',
      keywords: ['大佛', '莲灯', '梵音'], meaning: '八十八米慈悲俯瞰，莲灯在夜色里次第开合。',
      oracle: '佛不语，灯替山说了晚安。',
      art: { motifs: ['buddha'], moon: 0.68 },
    },
    {
      rank: 2, nameZh: '鸡鸣寺', nameEn: 'Jiming Temple', city: '南京',
      keywords: ['药师塔', '山门', '灯影'], meaning: '药师佛塔亮起，鸡笼山的夜有了灯芯。',
      oracle: '塔灯七层，一层一个安宁。',
      art: { motifs: ['pagoda', 'temple'], moon: 0.7 },
    },
    {
      rank: 3, nameZh: '牛首山', nameEn: 'Niushou Mountain', city: '南京',
      keywords: ['佛顶宫', '穹顶', '灯华'], meaning: '佛顶宫的夜，像一枚落在山里的星穹。',
      oracle: '穹顶之下，灯火也在合十。',
      art: { motifs: ['temple', 'hill'], moon: 0.62 },
    },
    {
      rank: 4, nameZh: '虎丘', nameEn: 'Tiger Hill', city: '苏州',
      keywords: ['虎丘塔', '剑池', '塔影'], meaning: '千年斜塔的夜影，替姑苏守着最老的传说。',
      oracle: '塔斜了一千年，夜从不觉得歪。',
      art: { motifs: ['pagoda', 'hill'], moon: 0.66 },
    },
    {
      rank: 5, nameZh: '北寺塔', nameEn: 'North Temple Pagoda', city: '苏州',
      keywords: ['报恩塔', '灯檐', '古塔'], meaning: '报恩寺塔亮起灯檐，姑苏城心有了一座灯塔。',
      oracle: '塔高不过报恩心。',
      art: { motifs: ['pagoda'], moon: 0.72 },
    },
    {
      rank: 6, nameZh: '北固山', nameEn: 'Beigu Mountain', city: '镇江',
      keywords: ['甘露寺', '江灯', '多景楼'], meaning: '北固亭望去，江上灯火与星子混作一处。',
      oracle: '何处望神州？满眼灯光胜星流。',
      art: { motifs: ['hill', 'temple'], moon: 0.58 },
    },
    {
      rank: 7, nameZh: '茅山', nameEn: 'Maoshan Mountain', city: '镇江',
      keywords: ['道宫', '山灯', '云雾'], meaning: '道家第一福地的夜，山灯在云雾里明明灭灭。',
      oracle: '山中无历日，灯开就是夜。',
      art: { motifs: ['hill', 'temple'], moon: 0.54 },
    },
    {
      rank: 8, nameZh: '文笔塔', nameEn: 'Wenbi Pagoda', city: '常州',
      keywords: ['塔影', '灯晕', '文脉'], meaning: '文笔塔尖挑起一粒灯，像笔尖蘸了光。',
      oracle: '塔是一支笔，夜是一张卷。',
      art: { motifs: ['pagoda'], moon: 0.68 },
    },
    {
      rank: 9, nameZh: '狼山', nameEn: 'Langshan Mountain', city: '南通',
      keywords: ['江海', '山寺', '烛光'], meaning: '江海第一山的夜，烛光与江灯互道平安。',
      oracle: '山不高，夜一到就辽阔。',
      art: { motifs: ['hill', 'temple'], moon: 0.6 },
    },
    {
      rank: 10, nameZh: '云龙山', nameEn: 'Yunlong Mountain', city: '徐州',
      keywords: ['放鹤亭', '山径', '灯影'], meaning: '放鹤亭的夜风里，山径灯影像一行归鹤。',
      oracle: '鹤已归去，灯替山守夜。',
      art: { motifs: ['hill', 'pavilion'], moon: 0.64 },
    },
    {
      rank: 11, nameZh: '花果山', nameEn: 'Huaguo Mountain', city: '连云港',
      keywords: ['水帘洞', '山灯', '云台'], meaning: '云台山的夜，山灯一路开到水帘洞口。',
      oracle: '山有仙名，灯有野趣。',
      art: { motifs: ['hill'], moon: 0.56 },
    },
    {
      rank: 12, nameZh: '大报恩寺', nameEn: 'Dabaoen Temple Ruins', city: '南京',
      keywords: ['琉璃塔', '灯彩', '遗址'], meaning: '琉璃塔亮起，遗址公园把六百年的灯火接续。',
      oracle: '塔亮了，夜就有了报恩的形状。',
      art: { motifs: ['pagoda', 'temple'], moon: 0.6 },
    },
    {
      rank: 13, nameZh: '三台山', nameEn: 'Santai Mountain', city: '宿迁',
      keywords: ['衲田', '林海', '灯径'], meaning: '衲田花海的夜，灯径像绣在田间的金线。',
      oracle: '田衲着花，夜衲着灯。',
      art: { motifs: ['hill'], moon: 0.62 },
    },
    {
      rank: 14, nameZh: '海春轩塔', nameEn: 'Haichunxuan Pagoda', city: '盐城',
      keywords: ['唐塔', '灯影', '西溪'], meaning: '江苏最老的塔守着西溪的夜，灯影七层。',
      oracle: '塔老心不老，夜夜点灯。',
      art: { motifs: ['pagoda'], moon: 0.66 },
    },
  ],

  /* ---------------- 城垣 · 城墙园林老宅肌理 ---------------- */
  pentacles: [
    {
      rank: 1, nameZh: '台城明城墙', nameEn: 'Taicheng Wall', city: '南京',
      keywords: ['雉堞', '灯带', '玄武'], meaning: '台城的灯带沿着雉堞爬行，六百岁的砖一夜未老。',
      oracle: '城墙把自己站成灯的长堤。',
      art: { motifs: ['wall'], moon: 0.7 },
    },
    {
      rank: 2, nameZh: '惠山古镇', nameEn: 'Huishan Ancient Town', city: '无锡',
      keywords: ['祠堂', '老街', '灯影'], meaning: '祠堂老街的夜，灯火把千年肌理照得温润。',
      oracle: '一街祠堂，半街灯火。',
      art: { motifs: ['street'], moon: 0.7 },
    },
    {
      rank: 3, nameZh: '朝天宫', nameEn: 'Chaotian Palace', city: '南京',
      keywords: ['棂星门', '红墙', '宫灯'], meaning: '红墙内的宫灯亮起，飞檐把月光梳齐。',
      oracle: '红墙收留月光，宫灯收留夜。',
      art: { motifs: ['temple'], moon: 0.68 },
    },
    {
      rank: 4, nameZh: '盘门三景', nameEn: 'Pan Gate Trio', city: '苏州',
      keywords: ['水陆城门', '瑞光塔', '吴门桥'], meaning: '水陆并存的城门夜里泛光，塔与桥各守一角。',
      oracle: '盘门一开，夜色就有水陆两条路。',
      art: { motifs: ['wall', 'pagoda'], moon: 0.62 },
    },
    {
      rank: 5, nameZh: '沧浪亭', nameEn: 'Canglang Pavilion', city: '苏州',
      keywords: ['复廊', '花窗', '灯影'], meaning: '未入园门，灯影先借水透出一园清幽。',
      oracle: '沧浪之水，夜里也清。',
      art: { motifs: ['garden'], moon: 0.72 },
    },
    {
      rank: 6, nameZh: '小娄巷', nameEn: 'Xiaolou Lane', city: '无锡',
      keywords: ['明清', '宅巷', '灯穗'], meaning: '明清宅巷的灯穗下，石库门里飘出茶香。',
      oracle: '巷子瘦，夜肥，灯正好。',
      art: { motifs: ['street'], moon: 0.7 },
    },
    {
      rank: 7, nameZh: '篦箕巷', nameEn: 'Biji Lane', city: '常州',
      keywords: ['老铺', '运河', '灯市'], meaning: '铺面亮到深夜，梳篦与灯影同梳一条运河。',
      oracle: '巷子细如篦齿，灯密如月梳。',
      art: { motifs: ['street'], moon: 0.66 },
    },
    {
      rank: 8, nameZh: '梦溪园巷', nameEn: 'Mengxi Garden Lane', city: '镇江',
      keywords: ['故居', '巷灯', '书香'], meaning: '沈括著书处，巷灯把《梦溪笔谈》照亮几行。',
      oracle: '梦里溪山，灯下旧卷。',
      art: { motifs: ['garden'], moon: 0.68 },
    },
    {
      rank: 9, nameZh: '个园', nameEn: 'Ge Garden', city: '扬州',
      keywords: ['四季假山', '竹影', '夜园'], meaning: '个园的夜，竹影把假山描了一层银边。',
      oracle: '竹是为月准备的，灯是为竹准备的。',
      art: { motifs: ['garden'], moon: 0.64 },
    },
    {
      rank: 10, nameZh: '二分明月楼', nameEn: 'Two-Thirds Moon Tower', city: '扬州',
      keywords: ['明月', '灯楼', '诗境'], meaning: '天下三分明月夜，二分无赖是扬州——今夜全归这栋楼。',
      oracle: '楼不高，分到的月亮却最多。',
      art: { motifs: ['pavilion'], moon: 0.34, phase: 'full' },
    },
    {
      rank: 11, nameZh: '网师园', nameEn: 'Master of Nets Garden', city: '苏州',
      keywords: ['夜花园', '曲廊', '灯月'], meaning: '夜花园里，曲廊灯月把宋时意境演到今夜。',
      oracle: '园小，夜长，戏正好。',
      art: { motifs: ['garden'], moon: 0.66 },
    },
    {
      rank: 12, nameZh: '南通博物苑', nameEn: 'Nantong Museum', city: '南通',
      keywords: ['百年苑', '馆灯', '濠水'], meaning: '中国第一座公共博物馆的夜，馆灯像未熄的讲义。',
      oracle: '灯下陈列的，是时间本身。',
      art: { motifs: ['temple'], moon: 0.6 },
    },
    {
      rank: 13, nameZh: '镇淮楼', nameEn: 'Zhenhuai Tower', city: '淮安',
      keywords: ['谯楼', '更鼓', '灯楼'], meaning: '淮安城心的谯楼亮了，更鼓声换成了灯的更次。',
      oracle: '楼守城，灯守楼。',
      art: { motifs: ['gate'], moon: 0.66 },
    },
    {
      rank: 14, nameZh: '安丰古镇', nameEn: 'Anfeng Ancient Town', city: '盐城',
      keywords: ['明清街', '七里', '灯串'], meaning: '七里明清长街，灯串从街头一直数到盐课司。',
      oracle: '盐是咸的，夜是暖的，街是长的。',
      art: { motifs: ['street'], moon: 0.68 },
    },
  ],
};
