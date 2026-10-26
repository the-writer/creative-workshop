// 命名生成引擎：按用户既定规则确定性组合 + 实时去重，不引入 AI

import {
  LEXICON,
  SURNAMES,
  SURNAME_BALANCED_BIAS,
  SURNAME_MAX_BIAS,
  SURNAME_NATURAL_BIAS,
  SYLLABLE_GENDER_BIAS,
  SYLLABLES,
  surnameSelectionWeight,
  type WeightedSurname,
} from '@/data/lexicon';
import { GENDER_BASE_WEIGHT, GENDER_MATCH_WEIGHT } from '@/lib/generator-rules';
import {
  GENDER_KEYS,
  normalizeRaceKey,
  type Candidate,
  type NameGender,
  type NameTypeKey,
  type RaceKey,
  type RarityTier,
  type StructurePart,
} from '@/lib/types';

export type ShortMode = 'two' | 'three' | 'mix';
export type PersonSuffix = 'father' | 'place' | 'profession' | 'contract' | 'blood' | 'title';

export interface GenParams {
  count: number; // 5-100
  shortMode: ShortMode;
  personSuffix: PersonSuffix;
  nicknamePrefix: boolean; // 绰号前置
  nicknameChars: number; // 2-8
  nicknameSources: string[]; // 绰号来源多选（profession/appearance/deed/terrain/contract），空数组=随机抽取
  minChars: number; // 人名全名字数下限（最大 8）
  maxChars: number; // 人名全名字数上限（最大 8）
  professions: string[]; // 职业多选，空数组=随机抽取
  abilities: string[]; // 特殊能力多选，空数组=随机抽取
  gender: NameGender; // 人名性别倾向
  surnameBias: number; // 姓氏人口权重倾向：0 按人口，50 均衡，100 极稀有
}

export const DEFAULT_GEN_PARAMS: GenParams = {
  count: 5,
  shortMode: 'mix',
  personSuffix: 'father',
  nicknamePrefix: false,
  nicknameChars: 2,
  nicknameSources: [],
  minChars: 4,
  maxChars: 8,
  professions: [],
  abilities: [],
  gender: 'neutral',
  surnameBias: SURNAME_BALANCED_BIAS,
};

// 生成页偏好的持久化结构版本：旧数据没有该字段，读取时需要做一次性迁移。
export const GEN_PREFS_SCHEMA_VERSION = 2;
export interface GenPrefs {
  schemaVersion: number;
  race: RaceKey;
  types: NameTypeKey[];
  params: GenParams;
}

const NAME_TYPE_KEYS: NameTypeKey[] = ['person', 'place', 'office', 'nickname'];

// 读取历史偏好：无版本号的旧数据把默认性别「不限」迁移为「中性」，
// 写入新版偏好后即可按用户当次选择（含手动选回的「不限」）正常持久化。
export function normalizeGenPrefs(raw: unknown): GenPrefs {
  const fallback: GenPrefs = {
    schemaVersion: GEN_PREFS_SCHEMA_VERSION,
    race: 'human',
    types: ['person'],
    params: { ...DEFAULT_GEN_PARAMS },
  };
  try {
    if (!raw || typeof raw !== 'object') return fallback;
    const parsed = raw as Partial<GenPrefs>;
    const legacyParams = parsed.params as Partial<GenParams> | undefined;
    const isLegacyPrefs = typeof parsed.schemaVersion !== 'number' || parsed.schemaVersion < GEN_PREFS_SCHEMA_VERSION;
    // 更早版本还没有性别/姓氏权重参数，字数上限的历史默认值 6 需要放宽到 8。
    const isBeforeGenderPrefs = !legacyParams || !('gender' in legacyParams) || !('surnameBias' in legacyParams);
    const params = { ...DEFAULT_GEN_PARAMS, ...(parsed.params ?? {}) };
    params.professions = Array.isArray(params.professions) ? params.professions.filter((s) => typeof s === 'string') : [];
    params.abilities = Array.isArray(params.abilities) ? params.abilities.filter((s) => typeof s === 'string') : [];
    params.nicknameSources = Array.isArray(params.nicknameSources) ? params.nicknameSources.filter((s) => typeof s === 'string') : [];
    params.nicknameChars =
      typeof params.nicknameChars === 'number' ? Math.max(2, Math.min(8, Math.round(params.nicknameChars))) : DEFAULT_GEN_PARAMS.nicknameChars;
    params.minChars = typeof params.minChars === 'number' ? Math.max(2, Math.min(8, Math.round(params.minChars))) : DEFAULT_GEN_PARAMS.minChars;
    params.maxChars = typeof params.maxChars === 'number' ? Math.max(2, Math.min(8, Math.round(params.maxChars))) : DEFAULT_GEN_PARAMS.maxChars;
    params.gender = GENDER_KEYS.includes(params.gender) ? params.gender : DEFAULT_GEN_PARAMS.gender;
    if (isLegacyPrefs && params.gender === 'any') params.gender = DEFAULT_GEN_PARAMS.gender;
    params.surnameBias =
      typeof params.surnameBias === 'number'
        ? Math.max(SURNAME_NATURAL_BIAS, Math.min(SURNAME_MAX_BIAS, Math.round(params.surnameBias)))
        : DEFAULT_GEN_PARAMS.surnameBias;
    if (isBeforeGenderPrefs && params.minChars === 4 && params.maxChars === 6) params.maxChars = DEFAULT_GEN_PARAMS.maxChars;
    return {
      schemaVersion: GEN_PREFS_SCHEMA_VERSION,
      race: normalizeRaceKey(parsed.race),
      types:
        Array.isArray(parsed.types) && parsed.types.some((t) => NAME_TYPE_KEYS.includes(t))
          ? parsed.types.filter((t) => NAME_TYPE_KEYS.includes(t))
          : ['person'],
      params,
    };
  } catch {
    return fallback;
  }
}

// 名称字数统计：不把「·」这类组成块分隔符计入字数。
export function nameCharCount(name: string): number {
  return Array.from(name.replaceAll('·', '')).length;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMany<T>(arr: T[], k: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < k && pool.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

function weightedIndex(weights: number[], randomValue = Math.random()): number {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return 0;
  let target = Math.max(0, Math.min(0.999999999999, randomValue)) * total;
  for (let index = 0; index < weights.length; index += 1) {
    target -= Math.max(0, weights[index] ?? 0);
    if (target < 0) return index;
  }
  return weights.length - 1;
}

function pickWeighted<T>(arr: T[], weightOf: (item: T) => number, randomValue = Math.random()): T {
  if (arr.length === 0) throw new Error('加权候选池不能为空');
  return arr[weightedIndex(arr.map(weightOf), randomValue)] as T;
}

function pickManyWeighted<T>(arr: T[], k: number, weightOf: (item: T) => number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < k && pool.length > 0; i += 1) {
    const chosen = pickWeighted(pool, weightOf);
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}

// 职业选取：用户多选时从所选范围抽，未选定时随机抽取
function pickProfession(race: RaceKey, selected: string[]): string {
  const all = LEXICON[race].professions;
  const pool = selected && selected.length > 0 ? selected.filter((s) => all.includes(s)) : all;
  return pick(pool.length > 0 ? pool : all);
}

// 特殊能力选取：用户多选时从所选范围抽 1-2 个，未选定时随机抽取
function pickAbilities(race: RaceKey, selected: string[]): string[] {
  const all = LEXICON[race].abilities;
  const pool = selected && selected.length > 0 ? selected.filter((s) => all.includes(s)) : all;
  const safe = pool.length > 0 ? pool : all;
  return pickMany(safe, Math.random() < 0.5 ? 1 : 2);
}

const ACTUAL_GENDERS: Array<Exclude<NameGender, 'any'>> = ['male', 'female', 'neutral'];

/**
 * 把性别倾向解析为候选真实性别。
 *
 * 「不限」只是生成偏好，不是一个人的性别；生成时随机落到男性 / 女性 / 中性之一，
 * 后续 TAG、保存与再次换稿都使用这个真实性别。
 */
export function resolveActualGender(preference: NameGender): Exclude<NameGender, 'any'> {
  if (preference !== 'any') return preference;
  return ACTUAL_GENDERS[Math.floor(Math.random() * ACTUAL_GENDERS.length)] as Exclude<NameGender, 'any'>;
}

export function genShortName(race: RaceKey, mode: ShortMode, gender: NameGender = 'any'): string {
  const k = mode === 'two' ? 2 : mode === 'three' ? 3 : Math.random() < 0.5 ? 2 : 3;
  const preferred = gender === 'any' ? null : new Set(SYLLABLE_GENDER_BIAS[race][gender]);
  return pickManyWeighted(SYLLABLES[race], k, (syllable) => (preferred?.has(syllable) ? GENDER_MATCH_WEIGHT : GENDER_BASE_WEIGHT)).join('');
}

export interface WeightedSurnameChoice extends WeightedSurname {
  selectionWeight: number;
}

export function getSurnameChoices(race: RaceKey, bias: number): WeightedSurnameChoice[] {
  return SURNAMES[race].map((surname) => ({
    ...surname,
    selectionWeight: surnameSelectionWeight(surname.populationShare, bias),
  }));
}

export function pickSurname(race: RaceKey, bias: number, randomValue = Math.random()): WeightedSurnameChoice {
  return pickWeighted(getSurnameChoices(race, bias), (surname) => surname.selectionWeight, randomValue);
}

export function formatPopulationShare(populationShare: number): string {
  const percent = populationShare * 100;
  return `${percent < 0.1 ? percent.toFixed(2) : percent.toFixed(1)}%`;
}

export function genPlace(race: RaceKey): { name: string; structure: StructurePart[] } {
  const roots = LEXICON[race];
  const variants: Array<{ pre: string[]; suf: string[]; preLabel: string; sufLabel: string }> = [
    { pre: roots.placePrefix2, suf: roots.placeSuffix1, preLabel: '地形前缀', sufLabel: '自然后缀' },
    { pre: roots.placePrefix1, suf: roots.placeSuffix1, preLabel: '地形前缀', sufLabel: '自然后缀' },
    { pre: roots.placePrefix2, suf: roots.placeSuffix2, preLabel: '地形前缀', sufLabel: '自然后缀' },
    { pre: roots.placePrefix1, suf: roots.placeSuffix2, preLabel: '地形前缀', sufLabel: '自然后缀' },
  ];
  const v = pick(variants);
  const pre = pick(v.pre);
  const suf = pick(v.suf);
  return {
    name: `${pre}${suf}`,
    structure: [
      { label: v.preLabel, word: pre },
      { label: v.sufLabel, word: suf },
    ],
  };
}

export function genOffice(race: RaceKey): { name: string; structure: StructurePart[] } {
  const roots = LEXICON[race];
  const terr = pick(roots.officeTerritories);
  const power = pick(roots.officePowers);
  const level = pick(roots.officeLevels);
  return {
    name: `${terr}${power}${level}`,
    structure: [
      { label: '属地', word: terr },
      { label: '职权', word: power },
      { label: '层级', word: level },
    ],
  };
}

const NICK_SOURCES: Array<{ key: string; label: string; get: (r: RaceKey) => string[] }> = [
  { key: 'profession', label: '职业', get: (r) => LEXICON[r].nickProfession },
  { key: 'appearance', label: '外貌', get: (r) => LEXICON[r].nickAppearance },
  { key: 'deed', label: '事迹', get: (r) => LEXICON[r].nickDeed },
  { key: 'terrain', label: '地形', get: (r) => LEXICON[r].nickTerrain },
  { key: 'contract', label: '契约', get: (r) => LEXICON[r].nickContract },
];

export const NICK_SOURCE_KEYS = NICK_SOURCES.map((s) => s.key);

type LexiconLike = {
  nickProfession: string[];
  nickAppearance: string[];
  nickDeed: string[];
  nickTerrain: string[];
  nickContract: string[];
  nickSingles: string[];
};

// 绰号 2-8 字：双字词根 2 字/词 + 单字补字；来源多选时只从所选来源取词
function nickWordPool(race: RaceKey, sources: string[]): Array<{ word: string; label: string }> {
  const pool: Array<{ word: string; label: string }> = [];
  const seen = new Set<string>();
  for (const src of NICK_SOURCES) {
    if (sources.length > 0 && !sources.includes(src.key)) continue;
    for (const w of src.get(race)) {
      if (seen.has(w)) continue;
      seen.add(w);
      pool.push({ word: w, label: src.label });
    }
  }
  if (pool.length === 0) {
    for (const src of NICK_SOURCES) {
      for (const w of src.get(race)) {
        if (seen.has(w)) continue;
        seen.add(w);
        pool.push({ word: w, label: src.label });
      }
    }
  }
  return pool;
}

export function genNickname(race: RaceKey, chars: number, sources: string[] = []): { name: string; structure: StructurePart[]; sourceLabel: string } {
  const roots = LEXICON[race] as LexiconLike;
  const charCount = Math.max(2, Math.min(8, Math.round(chars) || 2));
  const pool = nickWordPool(race, sources);
  const wordCount = Math.floor(charCount / 2);
  const singleCount = charCount % 2;
  const words = pickMany(pool, wordCount);
  const parts: StructurePart[] = words.map((w) => ({ label: `${w.label}来源`, word: w.word }));
  let name = words.map((w) => w.word).join('');
  if (singleCount > 0) {
    const extra = pick(roots.nickSingles);
    name += extra;
    parts.push({ label: '补字', word: extra });
  }
  const labels = Array.from(new Set(words.map((w) => w.label)));
  return { name, structure: parts, sourceLabel: labels.length > 0 ? labels.join('·') : '综合' };
}

export interface GeneratedName {
  name: string;
  structure: StructurePart[];
  /** 人名 / 组合设定句的实际性别；其它类型没有性别 */
  gender?: NameGender;
  /** 人名 / 组合设定句的姓氏稀有度；其它类型没有稀有度 */
  rarity?: RarityTier;
}

// 名称只保留一个「·」，且姓氏固定在后：短名与后缀直接相连，再接「·姓氏」。
// 例：姓氏「曜津」、短名「笛月」、父名「尔藤」→「笛月尔藤·曜津」。
function personName(givenName: string, surnameName: string): string {
  return `${givenName}·${surnameName}`;
}

export function genPerson(race: RaceKey, params: GenParams): GeneratedName | null {
  const surname = pickSurname(race, params.surnameBias);
  const gender = resolveActualGender(params.gender);
  const short = genShortName(race, params.shortMode, gender);
  // 姓氏不再作为结构 TAG 展示；名称里姓氏只出现在最后一个「·」之后。
  const personParts: StructurePart[] = [];
  if (params.nicknamePrefix) {
    const nick = genNickname(race, params.nicknameChars, params.nicknameSources);
    return {
      name: personName(`${nick.name}${short}`, surname.name),
      structure: [...personParts, ...nick.structure],
      gender,
      rarity: surname.rarity,
    };
  }
  switch (params.personSuffix) {
    case 'father': {
      let father = genShortName(race, params.shortMode);
      let guard = 0;
      while (father === short && guard < 20) {
        father = genShortName(race, params.shortMode);
        guard += 1;
      }
      return {
        name: personName(`${short}${father}`, surname.name),
        structure: personParts,
        gender,
        rarity: surname.rarity,
      };
    }
    case 'place': {
      const place = genPlace(race);
      return {
        name: personName(`${short}${place.name}`, surname.name),
        structure: [...personParts, ...place.structure],
        gender,
        rarity: surname.rarity,
      };
    }
    case 'profession': {
      const prof = pickProfession(race, params.professions);
      return {
        name: personName(`${short}${prof}`, surname.name),
        structure: [...personParts, { label: '职业', word: prof }],
        gender,
        rarity: surname.rarity,
      };
    }
    case 'contract': {
      const contract = pick(LEXICON[race].contractTitles);
      return {
        name: personName(`${short}${contract}`, surname.name),
        structure: [...personParts, { label: '契约称号', word: contract }],
        gender,
        rarity: surname.rarity,
      };
    }
    case 'blood': {
      const blood = pick(LEXICON[race].bloodTitles);
      return {
        name: personName(`${short}${blood}`, surname.name),
        structure: [...personParts, { label: '血统称号', word: blood }],
        gender,
        rarity: surname.rarity,
      };
    }
    case 'title': {
      const title = pick(LEXICON[race].titleWords);
      return {
        name: personName(`${short}${title}`, surname.name),
        structure: [...personParts, { label: '贵族封号', word: title }],
        gender,
        rarity: surname.rarity,
      };
    }
    default:
      return null;
  }
}

export function genOne(race: RaceKey, type: NameTypeKey, params: GenParams): GeneratedName | null {
  if (type === 'place') return genPlace(race);
  if (type === 'office') return genOffice(race);
  if (type === 'nickname') {
    const nick = genNickname(race, params.nicknameChars, params.nicknameSources);
    return { name: nick.name, structure: nick.structure };
  }
  return genPerson(race, params);
}

export interface GenerateResult {
  candidates: Candidate[];
  total: number; // 请求数（去重后实际条数）
  deduped: number; // 因重复被剔除的条数
}

// 组合设定句：多选类型时，把短名与所选类型合成一句人物设定，如“雷恩，任山岚执事，居青云城，以剑修为营生，绰号白发剑影”
export function genCombo(race: RaceKey, types: NameTypeKey[], params: GenParams): GeneratedName | null {
  const surname = pickSurname(race, params.surnameBias);
  const gender = resolveActualGender(params.gender);
  const short = genShortName(race, params.shortMode, gender);
  // 性别由候选的 gender 字段独立成标签；名称同样保持单点、姓氏在后：「短名·姓氏」。
  const parts: StructurePart[] = [{ label: '人名', word: short }];
  if (types.includes('office')) {
    const office = genOffice(race);
    parts.push({ label: '官职', word: office.name });
  }
  if (types.includes('place')) {
    const place = genPlace(race);
    parts.push({ label: '居地', word: place.name });
  }
  {
    const prof = pickProfession(race, params.professions);
    parts.push({ label: '营生', word: prof });
  }
  {
    const abilities = pickAbilities(race, params.abilities);
    parts.push({ label: '特殊能力', word: abilities.join('、') });
  }
  if (types.includes('nickname')) {
    const nick = genNickname(race, params.nicknameChars, params.nicknameSources);
    parts.push({ label: '绰号', word: nick.name });
  }
  return { name: personName(short, surname.name), structure: parts, gender, rarity: surname.rarity };
}

export function generateBatch(race: RaceKey, types: NameTypeKey[], params: GenParams): GenerateResult {
  const comboMode = types.length > 1;
  const seen = new Set<string>();
  const out: Candidate[] = [];
  let deduped = 0;
  let guard = 0;
  const maxGuard = params.count * 60 + 200;
  const now = Date.now();

  while (out.length < params.count && guard < maxGuard) {
    guard += 1;
    let got: GeneratedName | null = null;
    let type: NameTypeKey = 'person';
    if (comboMode) {
      got = genCombo(race, types, params);
    } else {
      type = pick(types);
      got = genOne(race, type, params);
      if (!got) continue;
      // 全名字数范围只约束人名全名；绰号/地名/官职按各自构词规则独立成稿
      if (type === 'person') {
        const len = nameCharCount(got.name);
        if (len < params.minChars || len > params.maxChars) continue;
      }
    }
    if (!got) continue;
    const len = nameCharCount(got.name);
    const key = comboMode ? `${race}|combo|${got.name}` : `${race}|${type}|${got.name}`;
    if (seen.has(key)) {
      deduped += 1;
      continue;
    }
    seen.add(key);
    out.push({
      id: `tmp_${now}_${out.length}`,
      race,
      nameType: comboMode ? 'person' : type,
      nameText: got.name,
      charCount: len,
      structure: got.structure,
      // 人名与组合设定句带真实性别与稀有度（独立 TAG）；地名/官职/绰号不带。
      ...(comboMode || type === 'person' ? { gender: got.gender, rarity: got.rarity } : {}),
      source: 'generated',
      favorite: false,
      note: '',
      createdAt: now,
      updatedAt: now,
      combo: comboMode ? true : undefined,
    });
  }

  return { candidates: out, total: out.length, deduped };
}

export function rerollCombo(race: RaceKey, types: NameTypeKey[], params: GenParams, excludes: Set<string>): GeneratedName | null {
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const got = genCombo(race, types, params);
    if (!got) continue;
    const key = `${race}|combo|${got.name}`;
    if (excludes.has(key)) continue;
    return got;
  }
  return null;
}

export function rerollOne(race: RaceKey, type: NameTypeKey, params: GenParams, excludes: Set<string>): GeneratedName | null {
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const got = genOne(race, type, params);
    if (!got) continue;
    // 全名字数范围只约束人名全名（不把「·」分隔符计入）
    if (type === 'person') {
      const len = nameCharCount(got.name);
      if (len < params.minChars || len > params.maxChars) continue;
    }
    const key = `${race}|${type}|${got.name}`;
    if (excludes.has(key)) continue;
    return got;
  }
  return null;
}
