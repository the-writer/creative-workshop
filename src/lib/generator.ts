// 命名生成引擎：按用户既定规则确定性组合 + 实时去重，不引入 AI

import { LEXICON, SURNAMES, SURNAME_BALANCED_BIAS, SYLLABLE_GENDER_BIAS, SYLLABLES, surnameSelectionWeight, type WeightedSurname } from '@/data/lexicon';
import { GENDER_BASE_WEIGHT, GENDER_MATCH_WEIGHT } from '@/lib/generator-rules';
import { GENDER_LABELS, type Candidate, type NameGender, type NameTypeKey, type RaceKey, type StructurePart } from '@/lib/types';

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
  count: 10,
  shortMode: 'mix',
  personSuffix: 'father',
  nicknamePrefix: false,
  nicknameChars: 2,
  nicknameSources: [],
  minChars: 4,
  maxChars: 8,
  professions: [],
  abilities: [],
  gender: 'any',
  surnameBias: SURNAME_BALANCED_BIAS,
};

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

function surnamePart(surname: WeightedSurnameChoice): StructurePart {
  return {
    label: surname.rare ? `稀有姓氏（${formatPopulationShare(surname.populationShare)}人口）` : `姓氏（${formatPopulationShare(surname.populationShare)}人口）`,
    word: surname.name,
  };
}

function genderNamePart(gender: NameGender, word: string): StructurePart {
  return { label: gender === 'any' ? '短名' : `${GENDER_LABELS[gender]}短名`, word };
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

export function genPerson(race: RaceKey, params: GenParams): { name: string; structure: StructurePart[] } | null {
  const surname = pickSurname(race, params.surnameBias);
  const short = genShortName(race, params.shortMode, params.gender);
  const personParts: StructurePart[] = [surnamePart(surname), genderNamePart(params.gender, short)];
  if (params.nicknamePrefix) {
    const nick = genNickname(race, params.nicknameChars, params.nicknameSources);
    return {
      name: `${nick.name}${surname.name}${short}`,
      structure: [...personParts, ...nick.structure],
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
        name: `${surname.name}${short}${father}`,
        structure: [...personParts, { label: '父名', word: father }],
      };
    }
    case 'place': {
      const place = genPlace(race);
      return {
        name: `${surname.name}${short}${place.name}`,
        structure: [...personParts, ...place.structure],
      };
    }
    case 'profession': {
      const prof = pickProfession(race, params.professions);
      return {
        name: `${surname.name}${short}${prof}`,
        structure: [...personParts, { label: '职业', word: prof }],
      };
    }
    case 'contract': {
      const contract = pick(LEXICON[race].contractTitles);
      return {
        name: `${surname.name}${short}${contract}`,
        structure: [...personParts, { label: '契约称号', word: contract }],
      };
    }
    case 'blood': {
      const blood = pick(LEXICON[race].bloodTitles);
      return {
        name: `${surname.name}${short}${blood}`,
        structure: [...personParts, { label: '血统称号', word: blood }],
      };
    }
    case 'title': {
      const title = pick(LEXICON[race].titleWords);
      return {
        name: `${surname.name}${short}${title}`,
        structure: [...personParts, { label: '贵族封号', word: title }],
      };
    }
    default:
      return null;
  }
}

export function genOne(race: RaceKey, type: NameTypeKey, params: GenParams): { name: string; structure: StructurePart[] } | null {
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
export function genCombo(race: RaceKey, types: NameTypeKey[], params: GenParams): { name: string; structure: StructurePart[] } | null {
  const surname = pickSurname(race, params.surnameBias);
  const short = genShortName(race, params.shortMode, params.gender);
  const clauses: string[] = [];
  const personLabel = params.gender === 'any' ? '人名' : `${GENDER_LABELS[params.gender]}人名`;
  const parts: StructurePart[] = [surnamePart(surname), { label: personLabel, word: short }];
  if (types.includes('office')) {
    const office = genOffice(race);
    clauses.push(`任${office.name}`);
    parts.push({ label: '官职', word: office.name });
  }
  if (types.includes('place')) {
    const place = genPlace(race);
    clauses.push(`居${place.name}`);
    parts.push({ label: '居地', word: place.name });
  }
  {
    const prof = pickProfession(race, params.professions);
    clauses.push(`以${prof}为营生`);
    parts.push({ label: '营生', word: prof });
  }
  {
    const abilities = pickAbilities(race, params.abilities);
    clauses.push(`擅${abilities.join('、')}`);
    parts.push({ label: '特殊能力', word: abilities.join('、') });
  }
  if (types.includes('nickname')) {
    const nick = genNickname(race, params.nicknameChars, params.nicknameSources);
    clauses.push(`绰号${nick.name}`);
    parts.push({ label: '绰号', word: nick.name });
  }
  if (clauses.length === 0) return null;
  return { name: `${surname.name}${short}${clauses.map((c) => `，${c}`).join('')}`, structure: parts };
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
    let got: { name: string; structure: StructurePart[] } | null = null;
    let type: NameTypeKey = 'person';
    if (comboMode) {
      got = genCombo(race, types, params);
    } else {
      type = pick(types);
      got = genOne(race, type, params);
      if (!got) continue;
      // 全名字数范围只约束人名全名；绰号/地名/官职按各自构词规则独立成稿
      if (type === 'person') {
        const len = got.name.length;
        if (len < params.minChars || len > params.maxChars) continue;
      }
    }
    if (!got) continue;
    const len = got.name.length;
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

export function rerollCombo(
  race: RaceKey,
  types: NameTypeKey[],
  params: GenParams,
  excludes: Set<string>,
): { name: string; structure: StructurePart[] } | null {
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

export function rerollOne(race: RaceKey, type: NameTypeKey, params: GenParams, excludes: Set<string>): { name: string; structure: StructurePart[] } | null {
  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const got = genOne(race, type, params);
    if (!got) continue;
    // 全名字数范围只约束人名全名
    if (type === 'person') {
      const len = got.name.length;
      if (len < params.minChars || len > params.maxChars) continue;
    }
    const key = `${race}|${type}|${got.name}`;
    if (excludes.has(key)) continue;
    return got;
  }
  return null;
}
