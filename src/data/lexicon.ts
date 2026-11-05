// 内置词根音系库：人族/精灵族/妖鬼族/混血音节块、职业/地形/职权/绰号等词根、构词规则配置、组合量公式
// 音节块为用户给定数据完整预置；词根为按用户规则扩展的代表性预置
// v4：音节扩充至四倍，并加入性别音系偏好与人口权重姓氏

import type { NameGender, NameTypeKey, RaceKey, RarityTier } from '@/lib/types';
import { ELF_COMMON_SURNAMES, ELF_LEXICON, ELF_RARE_SURNAMES, ELF_SYLLABLE_GENDER_BIAS, ELF_SYLLABLES } from './lexicon-elf';
import { YAOGUI_COMMON_SURNAMES, YAOGUI_LEXICON, YAOGUI_RARE_SURNAMES, YAOGUI_SYLLABLE_GENDER_BIAS, YAOGUI_SYLLABLES } from './lexicon-yaogui';

// 每个字符串都是一个独立音节块；数组每行 20 个条目，避免资料表被格式化器拆成单列。
// prettier-ignore
const BASE_SYLLABLES: Record<'human' | 'elf' | 'yaogui', string[]> = {
  human: [
    '雷', '恩', '托', '瓦', '德', '罗', '卡', '尔', '玛', '伦', '奥', '伊', '萨', '维', '兰', '蒂', '诺', '琳', '凯', '安',
    '塞', '弥', '斐', '瑟', '莱', '赫', '洛', '缇', '茵', '珂', '珞', '薇', '琉', '鲁', '祈', '米', '娜', '涅', '希', '乌',
    '赤', '青', '白', '黑', '金', '银', '玉', '星', '月', '日', '曦', '曜', '晨', '暮', '云', '岚', '风', '雨', '雪', '霜',
    '山', '川', '河', '海', '林', '森', '木', '花', '叶', '藤', '光', '影', '音', '歌', '诗', '书', '画', '琴', '笛', '钟',
    '允', '言', '信', '诚', '善', '真', '义', '礼', '仁', '和', '君', '王', '公', '侯', '伯', '子', '士', '民', '客', '使',
    '龙', '凤', '麟', '虎', '狼', '鹰', '鹿', '鹤', '鲤', '燕', '东', '西', '南', '北', '春', '夏', '秋', '冬', '昼', '夜',
    '灵', '元', '清', '玄', '微', '远', '近', '明', '暗', '虚', '岑', '岫', '屿', '崖', '溪', '泉', '潭', '洲', '浦', '津',
    '商', '旅', '工', '农', '医', '巫', '祭', '铸', '织', '猎', '温', '柔', '刚', '毅', '慧', '敏', '静', '宁', '悦', '姬',
  ],
  elf: ELF_SYLLABLES,
  yaogui: YAOGUI_SYLLABLES,
};

export const SYLLABLES: Record<RaceKey, string[]> = {
  ...BASE_SYLLABLES,
  mixed: Array.from(new Set([...BASE_SYLLABLES.human, ...BASE_SYLLABLES.elf])),
};

const BASE_SYLLABLE_GENDER_BIAS: Record<'human' | 'elf' | 'yaogui', Record<Exclude<NameGender, 'any'>, string[]>> = {
  human: {
    // prettier-ignore
    male: [
      '雷', '托', '德', '罗', '卡', '尔', '伦', '奥', '凯', '安', '塞', '赫', '鲁', '乌', '山', '川', '林', '木', '光', '诺',
      '言', '信', '诚', '善', '真', '义', '礼', '仁', '和', '君', '王', '公', '侯', '伯', '子', '士', '龙', '虎', '狼', '鹰',
    ],
    // prettier-ignore
    female: [
      '薇', '娜', '琳', '茵', '珂', '缇', '珞', '兰', '伊', '米', '花', '叶', '诗', '琴', '柔', '慧', '静', '宁', '悦', '雪',
      '霜', '月', '星', '曦', '燕', '凤', '姬',
    ],
    neutral: ['云', '岚', '风', '雨', '光', '影', '音', '歌', '诗', '书', '琴', '诺', '言', '灵', '清', '微', '远', '明', '和'],
  },
  elf: ELF_SYLLABLE_GENDER_BIAS,
  yaogui: YAOGUI_SYLLABLE_GENDER_BIAS,
};

export const SYLLABLE_GENDER_BIAS: Record<RaceKey, Record<Exclude<NameGender, 'any'>, string[]>> = {
  ...BASE_SYLLABLE_GENDER_BIAS,
  mixed: {
    male: Array.from(new Set([...BASE_SYLLABLE_GENDER_BIAS.human.male, ...BASE_SYLLABLE_GENDER_BIAS.elf.male])),
    female: Array.from(new Set([...BASE_SYLLABLE_GENDER_BIAS.human.female, ...BASE_SYLLABLE_GENDER_BIAS.elf.female])),
    neutral: Array.from(new Set([...BASE_SYLLABLE_GENDER_BIAS.human.neutral, ...BASE_SYLLABLE_GENDER_BIAS.elf.neutral])),
  },
};

export interface WeightedSurname {
  name: string;
  populationShare: number;
  rare: boolean;
  rarity: RarityTier;
}

export const SURNAME_RARE_POPULATION_SHARE = 0.0001; // 0.01%
export const SURNAME_NATURAL_BIAS = 0;
export const SURNAME_BALANCED_BIAS = 50;
export const SURNAME_MAX_BIAS = 100;
// 稀有倾斜的最大指数：控制滑块从「均衡」到「极稀有」时低人口姓氏权重的放大上限。
// 取 0.5 可让 70 附近只是温和偏向稀有，而不会一档就几乎必出 SSSR。
export const SURNAME_RARE_BIAS_MAX_EXPONENT = 0.5;

// prettier-ignore
const HUMAN_COMMON_SURNAMES = [
  '雷恩', '托瓦', '德罗', '卡尔', '玛伦', '奥伊', '萨维', '兰蒂', '诺琳', '凯安', '塞弥', '斐瑟', '莱赫', '洛缇', '茵珂', '珞薇', '琉鲁', '祈米', '娜涅', '希乌',
  '赤青', '白金', '星月', '曦曜', '晨暮', '云岚', '风雨', '雪霜', '山川', '河海', '森林', '木花', '叶藤', '光影', '音歌', '诗书', '画琴', '笛钟', '诺言', '信诚',
  '善真', '义礼', '仁和', '君王', '公侯', '伯子', '士民', '客使', '龙凤', '麟虎', '狼鹰', '鹿鹤', '鲤燕', '东西', '南北', '春夏', '秋冬', '昼夜', '灵元', '清玄',
  '微远', '近明', '暗虚', '岑岫', '屿崖', '溪泉', '潭洲', '浦津', '商旅', '工农', '医巫', '祭铸',
];

// prettier-ignore
const HUMAN_RARE_SURNAMES = ['烬岚', '蜃洲', '星浦', '曜津', '魇川', '琉焰', '烬薇', '骸月'];

function createSurnamePool(common: string[], rare: string[]): WeightedSurname[] {
  const commonPopulation = 1 - rare.length * SURNAME_RARE_POPULATION_SHARE;
  const pool = [
    ...common.map((name) => ({ name, populationShare: commonPopulation / common.length, rare: false })),
    ...rare.map((name) => ({ name, populationShare: SURNAME_RARE_POPULATION_SHARE, rare: true })),
  ];
  // 稀有度按姓氏池的相对人口排名分档：最稀有 10% = SSSR，其后 10% = SSS，
  // 再后 20% = SS，其余 = S。人口占比相同的姓氏按名称稳定排序，保证每次生成一致。
  const ranked = [...pool].sort((a, b) => a.populationShare - b.populationShare || a.name.localeCompare(b.name, 'zh-CN'));
  const rarityByName = new Map<string, RarityTier>();
  ranked.forEach((surname, index) => {
    const ratio = ranked.length <= 1 ? 0 : index / (ranked.length - 1);
    rarityByName.set(surname.name, ratio < 0.1 ? 'SSSR' : ratio < 0.2 ? 'SSS' : ratio < 0.4 ? 'SS' : 'S');
  });
  return pool.map((surname) => ({ ...surname, rarity: rarityByName.get(surname.name) ?? 'S' }));
}

const BASE_SURNAMES: Record<'human' | 'elf' | 'yaogui', WeightedSurname[]> = {
  human: createSurnamePool(HUMAN_COMMON_SURNAMES, HUMAN_RARE_SURNAMES),
  elf: createSurnamePool(ELF_COMMON_SURNAMES, ELF_RARE_SURNAMES),
  yaogui: createSurnamePool(YAOGUI_COMMON_SURNAMES, YAOGUI_RARE_SURNAMES),
};

export const SURNAMES: Record<RaceKey, WeightedSurname[]> = {
  ...BASE_SURNAMES,
  mixed: Array.from(new Map([...BASE_SURNAMES.human, ...BASE_SURNAMES.elf].map((surname) => [surname.name, surname])).values()),
};

/**
 * 将滑块值映射到采样权重：
 * 0 使用人口占比，50 让所有姓氏等概率，100 对最稀有姓氏施加最强倾斜。
 * 稀有倾斜采用线性递增的指数（最大 0.5），避免中等档位就过度放大稀有姓氏。
 */
export function surnameSelectionWeight(populationShare: number, bias: number): number {
  const normalized = Math.max(SURNAME_NATURAL_BIAS, Math.min(SURNAME_MAX_BIAS, Math.round(bias)));
  const safeShare = Math.max(SURNAME_RARE_POPULATION_SHARE, populationShare);
  if (normalized <= SURNAME_BALANCED_BIAS) {
    return Math.pow(safeShare, 1 - normalized / SURNAME_BALANCED_BIAS);
  }
  const rarityInfluence = (normalized - SURNAME_BALANCED_BIAS) / (SURNAME_MAX_BIAS - SURNAME_BALANCED_BIAS);
  return Math.pow(safeShare, -SURNAME_RARE_BIAS_MAX_EXPONENT * rarityInfluence);
}

export interface LexiconRoots {
  professions: string[]; // 职业
  abilities: string[]; // 特殊能力
  placePrefix2: string[]; // 地名前缀（双字）
  placePrefix1: string[]; // 地名前缀（单字）
  placeSuffix1: string[]; // 地名后缀（单字）
  placeSuffix2: string[]; // 地名后缀（双字）
  officeTerritories: string[]; // 官职属地（地点/部落）
  officePowers: string[]; // 职权
  officeLevels: string[]; // 层级
  nickProfession: string[]; // 绰号·职业
  nickAppearance: string[]; // 绰号·外貌
  nickDeed: string[]; // 绰号·事迹
  nickTerrain: string[]; // 绰号·地形
  nickContract: string[]; // 绰号·契约
  nickSingles: string[]; // 绰号补字（用于 3/5/7 字绰号）
  contractTitles: string[]; // 契约称号
  bloodTitles: string[]; // 血统称号（人名后缀·血统）
  titleWords: string[]; // 封号尊称（人名后缀·封号）
}

const BASE_LEXICON: Record<'human' | 'elf' | 'yaogui', LexiconRoots> = {
  human: {
    // prettier-ignore
    professions: [
      '剑修', '药师', '符师', '阵师', '丹师', '器师', '猎手', '织者', '匠人', '乐师', '卜者', '镖师', '牧者', '樵夫', '渔人', '铁匠', '裁缝', '铸剑', '炼器', '御兽',
      '驯鹰', '船夫', '马倌', '厨者', '茶人', '书吏', '史官', '画师', '歌者', '舞姬', '说书', '探子', '巡夜', '守库', '花匠', '石匠', '木工', '瓦匠', '皮匠', '陶工',
      '盐夫', '矿工', '稻农', '桑农', '蚕户', '渔妇', '药农', '林户', '车夫', '更夫', '铸甲', '弩匠', '车匠', '漆匠', '染工', '编藤', '结网', '养蜂', '蚕娘', '驯马',
      '兽医', '猎户', '渔夫', '渡工', '织席', '编笠', '烧炭', '采药', '种茶', '酿酒', '制糖', '榨油', '磨坊', '铜匠', '银匠', '金匠', '玉匠', '瓦作', '木作', '铁作',
      '皮作', '绳作', '篾匠', '箍桶', '锻钢', '冶铜', '采石', '掘井', '淘金', '晒盐', '煮海', '织锦', '绣娘', '浆洗', '货郎', '摊贩', '馆主', '掌柜', '账房', '塾师',
      '剑师', '刀师', '枪师', '弓师', '盾卫', '斥候', '游侠', '剑侍', '刀客', '拳师', '医者', '稳婆', '接骨', '洗药', '炁师', '术士', '方士', '星官', '历官', '漏刻',
      '测绘', '舆图', '封泥', '刻印', '装裱', '抄经', '校书', '典藏', '藏书', '修谱', '驯犬', '养鹰', '牧羊', '放鹿', '驯鹿', '猎貂', '捕蛇', '养龟', '观鸟', '护林',
      '护渠', '治水', '修桥', '筑城', '版筑', '夯土', '烧砖', '制瓦', '开矿', '验金', '铸钱', '雕版', '造纸', '制笔', '研墨', '调香', '制烛', '打铁', '磨镜', '制琴',
      '乐工', '执钟', '击鼓', '吹笛', '琵琶', '制鼓', '戏班', '伶人', '皮影', '木偶', '向导', '脚夫', '驿卒', '信使', '译语', '邸吏', '库吏', '户曹', '刑曹', '工曹',
    ],
    // prettier-ignore
    abilities: [
      '御火', '御风', '御雷', '御水', '御土', '驭兽', '通灵', '观星', '疗愈', '铸魂', '传音', '隐身', '摄物', '预知', '幻形', '神行', '拔山', '读心', '御剑', '结阵',
      '封印', '命卜', '通语', '移物', '御毒', '踏空', '裂地', '唤雨', '驱雾', '摄魂', '焚天', '凝冰', '召雨', '逐风', '镇山', '裂空', '辟水', '燃木', '化土', '引星',
      '坠月', '摄日', '通幽', '唤灵', '役鬼', '镇魂', '封魔', '破障', '遁地', '飞天', '瞬移', '幻影', '分身', '夺舍', '附体', '催眠', '蛊惑', '迷心', '行云', '布雨',
      '御木', '生花', '催春', '凝露', '化蝶', '召蜂', '听风', '辨毒', '寻踪', '绘影', '留声', '藏物', '开锁', '破阵', '补阵', '移山', '填海', '分水', '引潮', '息浪',
      '化虹', '穿墙', '遁影', '燃灯', '照夜', '收星', '借月', '唤潮', '止雨', '暖雪', '融冰', '燃霜', '铸铁', '柔骨', '续脉', '止血', '净瘴', '解蛊', '破幻', '定身',
      '封声', '闭气', '守心', '安魂', '招魂', '送魂', '问灵', '寄梦', '入梦', '醒梦', '共感', '传念', '观气', '追星', '测地', '筑墙', '掣电', '呼风', '收云', '散雾',
    ],
    // prettier-ignore
    placePrefix2: [
      '青云', '落霞', '雾隐', '星落', '孤山', '寒水', '古木', '白石', '幽谷', '苍原', '赤砂', '玄冰', '长风', '落日', '悬泉', '断崖', '松涛', '竹海', '梅岭', '兰溪',
      '桃坞', '枫林', '芦荡', '荷塘', '桂坡', '柳岸', '槐荫', '榆关', '松门', '石桥', '溪畔', '湖畔', '江湾', '河口', '山阴', '阳坡', '东篱', '西岭', '南浦', '北渡',
      '云岫', '烟渚', '雾凇', '霜桥', '露台', '霞岭', '虹谷', '风壑', '雨帘', '雪庐', '冰溪', '月湖', '星泉', '日岗', '天梯', '地脉', '石径', '岩扉', '山斋', '林麓',
      '竹坞', '松谷', '梅径', '兰皋', '荷浦', '苇泽', '蒹葭', '蒲塘', '菱湖', '芦洲', '樵径', '渔汀', '矶头', '埠头', '堰口', '桥头', '渡口', '湾里', '坡上', '岭下',
      '杏谷', '梨坡', '桑野', '柘林', '桐溪', '梓里', '梧岗', '栎原', '榆湾', '杉岭', '茶坡', '药谷', '稻香', '麦陇', '豆畦', '瓜洲', '荷风', '菱荡', '苇汀', '藻溪',
      '晴岚', '晚照', '朝晖', '夕川', '早渡', '夜泊', '月门', '星渡', '云阶', '天渠', '风门', '雷泽', '雨坂', '雪坡', '霜庭', '露井', '冰渚', '火塘', '雾津', '烟村',
      '砚溪', '墨泉', '书岩', '画谷', '琴台', '棋岭', '灯港', '钟湾', '鼓坡', '塔原', '东皋', '西畴', '南亩', '北窖', '前汀', '后陇', '上津', '下渚', '中川', '外浦',
    ],
    // prettier-ignore
    placePrefix1: [
      '云', '石', '雾', '青', '寒', '长', '孤', '白', '幽', '苍', '赤', '玄', '风', '落', '悬', '断', '霜', '雪', '春', '夏',
      '秋', '冬', '晓', '暮', '晨', '夜', '晴', '阴', '雨', '潮', '露', '岚', '松', '竹', '梅', '兰', '桂', '柳', '槐', '杏',
      '梨', '桑', '茶', '药', '稻', '麦', '莲', '苇', '东', '西', '南', '北', '上', '下', '中', '前', '后', '远', '近', '高',
      '低', '深', '浅', '平',
    ],
    // prettier-ignore
    placeSuffix1: [
      '山', '川', '谷', '泽', '原', '岭', '关', '城', '驿', '堡', '寨', '镇', '渡', '台', '崖', '潭', '湾', '港', '洲', '林',
      '坡', '坪', '冈', '丘', '阜', '矶', '渚', '汀', '浦', '汊', '沱', '堰', '坝', '堤', '渠', '塘', '池', '井', '泉', '桥',
      '涧', '壑', '洞', '岩', '峰', '麓', '坳', '坂', '畈', '畴', '坞', '庄', '村', '墟', '坊', '苑', '津', '泾', '溆', '汕',
      '沚', '湄', '浔', '洼', '淀', '荡', '滩', '漾', '陂', '闸', '埭', '汭',
    ],
    // prettier-ignore
    placeSuffix2: [
      '川原', '河谷', '关隘', '城郭', '台地', '野原', '石滩', '深潭', '密林', '险峰', '断壁', '幽谷', '长坡', '曲径', '高台', '旧城', '荒原', '湿地', '沙丘', '冰原',
      '平野', '沃土', '山麓', '谷口', '滩涂', '泽畔', '江渚', '溪谷', '林间', '草甸', '丘陵', '高原', '盆地', '峡谷', '隘口', '要道', '津渡', '水寨', '土堡', '石城',
      '田畴', '稻乡', '茶坞', '药圃', '果园', '桑圃', '竹海', '梅园', '松岗', '柳汀', '水乡', '渔浦', '渡埠', '津门', '溪源', '泉眼', '石涧', '松壑', '云台', '星坪',
      '月坂', '雪坳', '霜坡', '雨坞', '风陵', '晴川', '春畈', '秋坪', '旧驿', '古庄', '崖寨', '山门', '湖堤', '江岸', '河湾', '苇荡', '荷池', '菱塘', '芦荡', '桃坞',
    ],
    // prettier-ignore
    officeTerritories: [
      '山岚', '河谷', '城关', '石堡', '松岭', '竹溪', '枫驿', '兰渡', '柳营', '槐庭', '云台', '风陵', '霜原', '雪寨', '星阁', '月楼', '丹崖', '赤城', '青营', '白石',
      '碧波', '金池', '银屿', '铁关', '铜台', '玉门', '华庭', '明堂', '正衙', '书阁', '库司', '仓城', '驿路', '汛台', '烽台', '鼓楼', '钟楼', '学馆', '药庐', '剑阁',
      '东关', '西堡', '南城', '北营', '上苑', '下院', '中堂', '前衙', '后仓', '左库', '右阁', '内廷', '外城', '临江', '望海', '倚山', '抱水', '环翠', '连珠', '叠嶂',
      '飞云', '听雨', '观澜', '揽月', '摘星', '承露', '栖霞', '枕流', '漱玉', '衔山', '藏锋', '敛芒', '聚英', '汇贤', '集瑞', '纳福', '承平', '永固', '长宁', '永安',
      '东市', '西坊', '南仓', '北院', '上林', '下苑', '中军', '前营', '后署', '左庭', '右曹', '春坊', '夏曹', '秋库', '冬检', '晴川', '雨衡', '雪署', '霜台', '风监',
      '文馆', '武备', '礼曹', '乐府', '刑狱', '工造', '户册', '兵符', '吏部', '太医', '太学', '国子', '司天', '尚衣', '尚食', '内库', '外驿', '巡司', '盐司', '茶司',
      '铁监', '铜坊', '银库', '玉作', '织署', '染坊', '船司', '马场', '林署', '水务', '渠司', '桥坊', '关市', '驿馆', '书院', '藏经', '药院', '粮仓', '漕司', '铸钱',
    ],
    // prettier-ignore
    officePowers: [
      '执', '掌', '督', '统', '司', '御', '卫', '巡', '典', '守', '牧', '令', '辖', '镇', '判', '引', '总', '率', '领', '主',
      '管', '理', '参', '议', '录', '记', '书', '簿', '核', '审', '度', '衡', '察', '保', '治', '教', '调', '遣', '任', '署',
      '检', '缮', '护', '营', '办', '经', '承', '奉',
    ],
    // prettier-ignore
    officeLevels: [
      '事', '官', '长', '令', '使', '丞', '卿', '正', '尉', '司', '监', '帅', '侯', '伯', '子', '男', '公', '王', '主', '君',
      '师', '傅', '佐', '副', '参', '判', '史', '参军', '少卿', '少监', '大夫', '校尉',
    ],
    // prettier-ignore
    nickProfession: [
      '剑影', '药香', '符火', '弓鸣', '铁臂', '织云', '歌喉', '刀锋', '盾山', '灯影', '笔锋', '鼓声', '焰锤', '石工', '舟影', '绳技', '犁痕', '麦浪', '茶烟', '墨韵',
      '算珠', '秤星', '针脚', '凿痕', '铎音', '砚池', '匠影', '织梭', '药锄', '符箓', '阵眼', '丹炉', '器魂', '弓弦', '犁铧', '渔网', '舟橹', '车辕', '马鞭', '驼铃',
      '茶盏', '墨锭', '砚台', '算盘', '秤砣', '针线', '梭子', '砧板', '风箱', '水车', '石磨', '纺车', '剑鸣', '刀光', '枪缨', '矢羽', '盾纹', '巡灯', '猎犬', '鹰哨',
      '鹿鸣', '羊铃', '药杵', '灸烟', '针囊', '脉枕', '星盘', '浑仪', '罗盘', '角尺', '墨斗', '刻刀', '纸帘', '笔架', '琴弦', '笛孔', '鼓槌', '戏袍', '木偶', '皮影',
      '驿铃', '船桨', '窖香', '炉火', '金砧', '银炉', '玉屑', '陶釉', '漆桶', '丝线', '绣绷', '茶焙', '酒旗', '糖霜', '盐粒', '磨盘', '矿灯', '篾刀', '藤篮', '鱼护',
      '桑剪', '蚕匾', '犁影', '麦芒',
    ],
    // prettier-ignore
    nickAppearance: [
      '白发', '赤瞳', '独眼', '铁面', '枯手', '金瞳', '银发', '断眉', '疤面', '玉指', '黑甲', '紫衣', '鹰目', '虎牙', '鹤骨', '蛇瞳', '青衫', '素手', '剑眉', '星目',
      '苍髯', '皓腕', '乌发', '铜肤', '碧眼', '卷须', '红发', '金发', '黑发', '褐瞳', '蓝眸', '紫瞳', '绿眸', '灰眼', '厚唇', '高鼻', '长耳', '圆脸', '方额', '浓眉',
      '细眉', '络腮', '光头', '麻脸', '雀斑', '酒窝', '虎口', '茧手', '跛足', '独臂', '驼背', '矮个', '高个', '瘦影', '宽肩', '细腰', '长指', '短须', '白眉', '赤眉',
      '断指', '疤颈', '刀疤', '眼罩', '耳坠', '鼻环', '唇钉', '青筋', '素袍', '短褐', '斗笠', '蓑衣', '布靴', '麻鞋', '皮甲', '木簪', '竹冠', '玉冠', '银冠', '铁盔',
      '鹤氅', '狐裘', '红绳', '碧簪', '白帕', '黑巾', '灰衣', '青衣', '绛袍', '皂靴', '金线', '银纹', '冷面', '笑眼', '病容', '慈眉', '鹰鼻', '薄唇', '厚掌', '长腿',
      '罗圈', '微驼', '银须', '短眉',
    ],
    // prettier-ignore
    nickDeed: [
      '破军', '焚城', '断江', '斩月', '追风', '踏雪', '惊雷', '镇岳', '开山', '缚龙', '平川', '覆雨', '裂石', '移星', '驱雾', '定海', '逐日', '擒虎', '射雕', '填海',
      '补天', '凿河', '铸鼎', '刻碑', '扶桑', '平潮', '屠龙', '伏虎', '擒蛟', '射日', '追月', '裂天', '碎地', '擎天', '倒海', '翻江', '移山', '济世', '安邦', '定国',
      '平乱', '靖难', '荡寇', '诛邪', '斩妖', '伏魔', '降鬼', '驱邪', '避祸', '招福', '守夜', '护城', '开江', '断流', '裂谷', '填渊', '熄火', '止雨', '唤晴', '破雾',
      '引航', '渡厄', '解厄', '续命', '还魂', '扶危', '护道', '守关', '戍边', '巡山', '守林', '治河', '修渠', '架桥', '筑城', '鸣钟', '击鼓', '点灯', '封炉', '启阵',
      '守阵', '破阵', '补穹', '镇星', '揽月', '逐月', '乘云', '踏浪', '凌霜', '破雪', '追雷', '听风', '观星', '记史', '留痕', '传书', '辨玉', '识毒', '解蛊', '问药',
      '寻踪', '留名', '守诺', '传薪',
    ],
    // prettier-ignore
    nickTerrain: [
      '山风', '沙暴', '雪原', '河谷', '岩心', '雾隐', '星野', '月潭', '风刃', '石林', '冰湖', '火谷', '云崖', '苔原', '潮声', '孤峰', '松涛', '竹影', '溪鸣', '崖雨',
      '霜径', '雷岫', '岚气', '泉声', '崖风', '波影', '风谷', '云海', '雪岭', '雾原', '雷原', '电泽', '冰原', '雨林', '石滩', '沙丘', '戈壁', '荒滩', '盐泽', '碱地',
      '湿地', '草场', '丘陵', '高地', '低谷', '狭谷', '隘道', '瀑布', '急流', '深涧', '幽谷', '寒潭', '桃溪', '杏林', '梨园', '桑田', '麦田', '稻田', '茶园', '药圃',
      '竹海', '松岗', '柳堤', '荷塘', '菱湖', '苇荡', '芦洲', '石桥', '古渡', '长亭', '驿道', '山门', '云梯', '星河', '月坡', '日崖', '晴川', '晚霞', '晨雾', '夜雨',
      '春江', '秋浦', '冰川', '霜林', '冰溪', '晴峰', '雷岩', '露井', '泉眼', '溪口', '河湾', '湖心', '岛影', '港湾', '礁石', '沙滩', '草原', '森林', '峡谷', '关口',
      '城垣', '旧巷', '新桥', '古道',
    ],
    // prettier-ignore
    nickContract: [
      '血契', '誓剑', '盟约', '魂印', '心灯', '命符', '影契', '灵约', '骨印', '月誓', '霜约', '星契', '火盟', '水印', '风誓', '尘约', '山盟', '河誓', '铁约', '木契',
      '光印', '雷誓', '云约', '石契', '炉约', '泽盟', '誓约', '契书', '血印', '魂约', '命契', '心契', '灵契', '影约', '骨约', '星约', '霜印', '火印', '水誓', '风契',
      '尘印', '山印', '河印', '铁誓', '木印', '光约', '雷印', '云誓', '石约', '炉誓', '泽印', '灯契', '月印', '曦契', '星灯', '风灯', '雨契', '云印', '山誓', '河盟',
      '海约', '潮契', '冰盟', '霜契', '雪约', '春誓', '夏契', '秋盟', '冬约', '花开', '叶誓', '根契', '剑盟', '弓约', '盾契', '墨约', '书香', '琴心', '棋誓', '画契',
      '茶盟', '酒约', '灯盟', '笔契', '印盟', '符剑', '镜约', '铃契', '舟盟', '桥誓', '路契', '门约', '窗誓', '庭契', '家盟', '乡约', '城契', '关誓', '驿盟', '书契',
      '卷约', '印心', '守契', '归约',
    ],
    // prettier-ignore
    nickSingles: [
      '风', '火', '雷', '霜', '影', '煞', '狂', '孤', '毒', '血', '金', '铁', '雪', '雾', '岚', '云', '冰', '寒', '玄', '苍',
      '幽', '墨', '玉', '虹', '月', '星', '日', '雨', '露', '烟', '尘', '光', '渊', '岩', '松', '竹', '梅', '兰', '菊', '鹤',
    ],
    // prettier-ignore
    contractTitles: [
      '盟誓', '契印', '血约', '魂契', '命灯', '心印', '誓约', '灵契', '星盟', '影约', '风誓', '骨契', '霜盟', '火契', '水约', '尘誓', '月契', '日盟', '渊约', '岩誓',
      '山盟', '河契', '雷印', '云约', '契誓', '盟印', '印契', '誓印', '约契', '灯约', '符契', '命誓', '魂盟', '血盟', '骨誓', '心盟', '影誓', '星印', '月印', '日契',
      '霜誓', '雷盟', '火誓', '水契', '风盟', '山印', '金誓', '云誓', '月书', '星约', '日书', '风契', '雨盟', '雪约', '霜书', '露契', '云印', '雷契', '海誓', '潮盟',
      '江契', '河印', '湖约', '泉盟', '溪誓', '石契', '岩盟', '山约', '木誓', '林契', '花盟', '叶约', '春契', '夏盟', '秋誓', '冬契', '剑约', '弓盟', '盾契', '书香',
      '墨契', '琴心', '棋约', '画盟', '茶誓', '酒契', '灯印', '符盟', '镜契', '铃约', '舟盟', '桥誓', '路契', '门约', '庭盟', '家契', '乡约', '城誓', '关盟', '驿契',
    ],
    // prettier-ignore
    bloodTitles: [
      '血裔', '嫡脉', '王血', '圣血', '龙裔', '凤裔', '神裔', '仙裔', '灵裔', '古血', '纯血', '贵胄', '遗孤', '嫡传', '旁支', '宗室', '望族', '世家', '名门', '寒门',
      '将门', '书香', '皇脉', '天裔', '侯裔', '公裔', '伯裔', '子裔', '男裔', '士族', '寒族', '旧族', '新贵', '隐族', '远支', '近支', '外戚', '宗亲', '嫡系', '庶系',
      '袍泽', '遗脉', '远裔', '古族', '祖裔', '宗裔', '血脉', '灵脉',
    ],
    // prettier-ignore
    titleWords: [
      '天枢', '北辰', '镇岳', '昭烈', '明德', '安澜', '平川', '定远', '靖边', '抚远', '怀远', '镇北', '平西', '安南', '定东', '忠武', '武烈', '文正', '文忠', '清节',
      '端毅', '襄勤', '果毅', '庄敏', '靖海', '宁川', '定山', '安岳', '镇川', '昭武', '显德', '崇文', '弘毅', '肃清', '康宁', '怀安', '永宁', '长平', '广德', '承光',
      '启明', '景行', '修远', '清宁', '静远', '归德', '敦信', '端方',
    ],
  },
  elf: ELF_LEXICON,
  yaogui: YAOGUI_LEXICON,
};

// 混血复用人类通用词根；音节与姓氏合并人族 / 精灵族，妖鬼保持独立词库。
export const LEXICON: Record<RaceKey, LexiconRoots> = {
  ...BASE_LEXICON,
  mixed: BASE_LEXICON.human,
};

// 排列数：从 n 个互异块中取 k 个有序排列。使用 bigint，避免大规模词库组合量越过安全整数。
function perm(n: bigint, k: number): bigint {
  let r = 1n;
  for (let i = 0n; i < BigInt(k); i += 1n) r *= n - i;
  return r;
}

export function shortNameCount(race: RaceKey): bigint {
  const n = BigInt(SYLLABLES[race].length);
  return perm(n, 2) + perm(n, 3);
}

export interface TypeCombinationInfo {
  person: bigint;
  place: bigint;
  office: bigint;
  nickname: bigint;
  total: bigint;
}

export function computeRaceCombinations(race: RaceKey): TypeCombinationInfo {
  const roots = LEXICON[race];
  const shortCount = shortNameCount(race);
  const placeVariants =
    BigInt(roots.placePrefix2.length) * BigInt(roots.placeSuffix1.length) +
    BigInt(roots.placePrefix1.length) * BigInt(roots.placeSuffix1.length) +
    BigInt(roots.placePrefix2.length) * BigInt(roots.placeSuffix2.length) +
    BigInt(roots.placePrefix1.length) * BigInt(roots.placeSuffix2.length);

  // 绰号 2-8 字：2字=1词，3字=1词+补字，4字=2词，5字=2词+补字，6字=3词，7字=3词+补字，8字=4词
  const nickTwo = BigInt(
    roots.nickProfession.length + roots.nickAppearance.length + roots.nickDeed.length + roots.nickTerrain.length + roots.nickContract.length,
  );
  const nickSingles = BigInt(roots.nickSingles.length);
  const nickThree = nickTwo * nickSingles;
  const nickFour = nickTwo * nickTwo;
  const nickFive = nickFour * nickSingles;
  const nickSix = nickTwo * nickFour;
  const nickSeven = nickSix * nickSingles;
  const nickEight = nickFour * nickFour;
  const nickTotal = nickTwo + nickThree + nickFour + nickFive + nickSix + nickSeven + nickEight;

  const personSuffixTotal =
    shortCount +
    placeVariants +
    BigInt(roots.professions.length) +
    BigInt(roots.contractTitles.length) +
    BigInt(roots.bloodTitles.length) +
    BigInt(roots.titleWords.length);
  const surnameCount = BigInt(SURNAMES[race].length);
  const person = (shortCount * personSuffixTotal + nickTotal * shortCount) * surnameCount;
  const place = placeVariants;
  const office = BigInt(roots.officeTerritories.length) * BigInt(roots.officePowers.length) * BigInt(roots.officeLevels.length);
  const nickname = nickTotal;

  return { person, place, office, nickname, total: person + place + office + nickname };
}

export function computeCombinationTotals(): {
  perRace: Record<RaceKey, TypeCombinationInfo>;
  grandTotal: bigint;
  detail: Record<NameTypeKey, bigint>;
} {
  const human = computeRaceCombinations('human');
  const elf = computeRaceCombinations('elf');
  const yaogui = computeRaceCombinations('yaogui');
  const mixed = computeRaceCombinations('mixed');
  return {
    perRace: { human, elf, yaogui, mixed },
    grandTotal: human.total + elf.total + yaogui.total + mixed.total,
    detail: {
      person: human.person + elf.person + yaogui.person + mixed.person,
      place: human.place + elf.place + yaogui.place + mixed.place,
      office: human.office + elf.office + yaogui.office + mixed.office,
      nickname: human.nickname + elf.nickname + yaogui.nickname + mixed.nickname,
    },
  };
}

export function formatCombination(n: bigint): string {
  const abs = n < 0n ? -n : n;
  const sign = n < 0n ? '-' : '';
  if (abs >= 10000000000000000n) {
    return `${sign}${abs / 10000000000000000n}京${(abs % 10000000000000000n) / 1000000000000n}兆`;
  }
  if (abs >= 1000000000000n) {
    return `${sign}${abs / 1000000000000n}兆${(abs % 1000000000000n) / 100000000n}亿`;
  }
  if (abs >= 100000000n) return `${sign}${abs / 100000000n}亿${(abs % 100000000n) / 10000n}万`;
  if (abs >= 10000n) return `${sign}${abs / 10000n}万${(abs % 10000n) / 1000n}千`;
  return `${sign}${abs}`;
}
