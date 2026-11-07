import { describe, expect, it } from 'vitest';
import { LEXICON, SURNAMES, SURNAME_RARE_POPULATION_SHARE, SYLLABLE_GENDER_BIAS, SYLLABLES, computeCombinationTotals, formatCombination } from '@/data/lexicon';
import { ELF_LEXICON, ELF_SYLLABLE_GENDER_BIAS, ELF_SYLLABLES } from '@/data/lexicon-elf';
import { YAOGUI_LEXICON, YAOGUI_SYLLABLE_GENDER_BIAS, YAOGUI_SYLLABLES } from '@/data/lexicon-yaogui';
import {
  DEFAULT_GEN_PARAMS,
  GEN_PREFS_SCHEMA_VERSION,
  genCombo,
  genPerson,
  genPlace,
  generateBatch,
  getSurnameChoices,
  nameCharCount,
  normalizeGenPrefs,
  pickSurname,
  type GenParams,
  type PersonSuffix,
} from '@/lib/generator';
import { GENDER_KEYS, RARITY_TIERS, type NameTypeKey, type RaceKey } from '@/lib/types';

const races: RaceKey[] = ['human', 'elf', 'yaogui'];
const types: NameTypeKey[] = ['person', 'place'];

describe('lexicon', () => {
  it('contains expanded and unique syllable, root and gender lists', () => {
    races.forEach((race) => {
      expect(SYLLABLES[race]).toHaveLength(race === 'yaogui' ? 160 : 240);
      expect(new Set(SYLLABLES[race]).size).toBe(SYLLABLES[race].length);
      Object.values(LEXICON[race]).forEach((values) => {
        expect(new Set(values).size).toBe(values.length);
      });
      GENDER_KEYS.filter((gender) => gender !== 'any').forEach((gender) => {
        const pool = SYLLABLE_GENDER_BIAS[race][gender];
        expect(pool.every((syllable) => SYLLABLES[race].includes(syllable))).toBe(true);
      });
    });
  });

  it('defines weighted surnames with ten percent rare entries', () => {
    races.forEach((race) => {
      const pool = SURNAMES[race];
      const rare = pool.filter((surname) => surname.rare);
      expect(pool).toHaveLength(80);
      expect(rare).toHaveLength(8);
      expect(rare.every((surname) => surname.populationShare === SURNAME_RARE_POPULATION_SHARE)).toBe(true);
      expect(pool.reduce((sum, surname) => sum + surname.populationShare, 0)).toBeCloseTo(1, 10);
      expect(new Set(pool.map((surname) => surname.rarity))).toEqual(new Set(RARITY_TIERS));
      expect(rare.every((surname) => surname.rarity === 'SSSR')).toBe(true);
    });
  });

  it('changes surname sampling weights from population to rare-biased', () => {
    const natural = getSurnameChoices('human', 0);
    const balanced = getSurnameChoices('human', 50);
    const rareBiased = getSurnameChoices('human', 100);
    const rare = rareBiased.find((surname) => surname.rare)!;
    const common = rareBiased.find((surname) => !surname.rare)!;
    expect(rare.selectionWeight).toBeGreaterThan(common.selectionWeight);
    expect(new Set(balanced.map((surname) => surname.selectionWeight.toFixed(8))).size).toBe(1);
    expect(natural.find((surname) => surname.rare)!.selectionWeight).toBeLessThan(natural.find((surname) => !surname.rare)!.selectionWeight);
    expect(pickSurname('human', 100, 0.999999).rare).toBe(true);
  });

  it('keeps the rare-bias slider gentle at middle values', () => {
    const rareShare = (bias: number) => {
      const choices = getSurnameChoices('human', bias);
      const total = choices.reduce((sum, surname) => sum + surname.selectionWeight, 0);
      const rare = choices.filter((surname) => surname.rarity === 'SSSR').reduce((sum, surname) => sum + surname.selectionWeight, 0);
      return rare / total;
    };
    expect(rareShare(50)).toBeCloseTo(0.1, 6);
    // 70 只温和偏向稀有，不应像旧曲线那样接近必出 SSSR。
    expect(rareShare(70)).toBeGreaterThan(0.2);
    expect(rareShare(70)).toBeLessThan(0.26);
    expect(rareShare(100)).toBeGreaterThan(rareShare(70));
  });

  it('keeps the elf lexicon free of demonic vocabulary', () => {
    const forbidden = /[妖魔怪鬼尸骨血咒蛊毒瘟疫魇魑魍魅煞烬墟冥邪恶灾祸噬蚀腐锈枯骸骷髅獠祟瘴蜃魃虬蟒蛛蝎]/;
    const words = [...ELF_SYLLABLES, ...Object.values(ELF_LEXICON).flat(), ...SURNAMES.elf.map((surname) => surname.name)];
    expect(words.filter((word) => forbidden.test(word))).toEqual([]);
  });

  it('keeps elf gender pools as subsets of the elf syllable table', () => {
    const pools = Object.values(ELF_SYLLABLE_GENDER_BIAS);
    expect(ELF_SYLLABLES).toHaveLength(240);
    pools.forEach((pool) => {
      expect(pool.length).toBeGreaterThanOrEqual(18);
      expect(new Set(pool).size).toBe(pool.length);
      expect(pool.every((syllable) => ELF_SYLLABLES.includes(syllable))).toBe(true);
    });
  });

  it('keeps the yaogui lexicon comparable to elf and mostly dark', () => {
    expect(YAOGUI_SYLLABLES).toHaveLength(160);
    expect(SURNAMES.yaogui).toHaveLength(80);
    expect(YAOGUI_LEXICON.professions).toHaveLength(160);
    expect(YAOGUI_LEXICON.abilities).toHaveLength(120);
    expect(YAOGUI_LEXICON.nickProfession).toHaveLength(104);
    Object.values(YAOGUI_SYLLABLE_GENDER_BIAS).forEach((pool) => {
      expect(pool.every((syllable) => YAOGUI_SYLLABLES.includes(syllable))).toBe(true);
    });
    // 少量古体 / 不常用字与极低比例的光明优雅词应同时存在，但后者不能成规模。
    expect(YAOGUI_SYLLABLES.some((syllable) => /[魑魅魍魉魃魈鬾鬽鬿]/.test(syllable))).toBe(true);
    const lightWords = [...Object.values(YAOGUI_LEXICON).flat()].filter((word) => /月华|清辉|玉面|星岚|守灯|星契/.test(word));
    const allWords = Object.values(YAOGUI_LEXICON).flat().length;
    expect(lightWords.length).toBeGreaterThan(0);
    expect(lightWords.length / allWords).toBeLessThan(0.01);
  });

  it('avoids mechanical prefix repetition in elf word lists', () => {
    const categories = [
      ELF_LEXICON.professions,
      ELF_LEXICON.abilities,
      ELF_LEXICON.placePrefix2,
      ELF_LEXICON.placeSuffix2,
      ELF_LEXICON.officeTerritories,
      ELF_LEXICON.nickProfession,
      ELF_LEXICON.nickAppearance,
      ELF_LEXICON.nickDeed,
      ELF_LEXICON.nickTerrain,
      ELF_LEXICON.nickContract,
    ];
    categories.forEach((words) => {
      const first = new Map<string, number>();
      const last = new Map<string, number>();
      words
        .filter((word) => Array.from(word).length === 2)
        .forEach((word) => {
          const [head, tail] = Array.from(word);
          first.set(head, (first.get(head) ?? 0) + 1);
          last.set(tail, (last.get(tail) ?? 0) + 1);
        });
      expect(Math.max(...first.values())).toBeLessThanOrEqual(4);
      expect(Math.max(...last.values())).toBeLessThanOrEqual(4);
    });
  });

  it('uses exact bigint combination totals beyond the safe integer range', () => {
    const totals = computeCombinationTotals();
    expect(totals.grandTotal).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(formatCombination(totals.grandTotal)).toMatch(/兆|京/);
  });
});

describe('generation', () => {
  it('defaults gender preference to neutral and migrates legacy prefs once', () => {
    expect(DEFAULT_GEN_PARAMS.gender).toBe('neutral');

    const legacy = normalizeGenPrefs({
      race: 'human',
      types: ['person'],
      params: { ...DEFAULT_GEN_PARAMS, gender: 'any', maxChars: 8 },
    });
    expect(legacy.schemaVersion).toBe(GEN_PREFS_SCHEMA_VERSION);
    expect(legacy.params.gender).toBe('neutral');

    // 已写入新版版本号的偏好里，用户手动选择的「不限」需要保留。
    const current = normalizeGenPrefs({ ...legacy, params: { ...legacy.params, gender: 'any' } });
    expect(current.params.gender).toBe('any');
    expect(normalizeGenPrefs({ race: 'demon', types: ['bogus'] }).race).toBe('elf');
    // 名称类型已改为单选，历史多选偏好只保留第一个有效项。
    expect(normalizeGenPrefs({ ...legacy, types: ['place', 'office'] }).types).toEqual(['place']);
  });

  it('counts name characters without the composition separator', () => {
    expect(nameCharCount('雷恩')).toBe(2);
    expect(nameCharCount('雷恩·阿')).toBe(3);
    expect(nameCharCount('')).toBe(0);
    expect(nameCharCount('雷·恩·阿')).toBe(3);
  });

  it.each(races)('generates every type for %s', (race) => {
    types.forEach((type) => {
      const result = generateBatch(race, [type], { ...DEFAULT_GEN_PARAMS, count: 20 });
      expect(result.candidates).toHaveLength(20);
      result.candidates.forEach((candidate) => {
        expect(candidate.nameText.length).toBeGreaterThan(0);
        expect(Array.isArray(candidate.structure)).toBe(true);
        expect(candidate.charCount).toBe(nameCharCount(candidate.nameText));
        expect(Number.isSafeInteger(candidate.createdAt)).toBe(true);
        if (type === 'person') {
          expect(candidate.gender).toBe(DEFAULT_GEN_PARAMS.gender);
        } else {
          expect(candidate.gender).toBeUndefined();
        }
      });
    });
  });

  it('merges human and elf pools for mixed race', () => {
    expect(new Set(SYLLABLES.mixed).size).toBe(SYLLABLES.mixed.length);
    expect(SYLLABLES.mixed.every((syllable) => SYLLABLES.human.includes(syllable) || SYLLABLES.elf.includes(syllable))).toBe(true);
    expect(SURNAMES.mixed.length).toBeGreaterThan(0);
    types.forEach((type) => {
      const result = generateBatch('mixed', [type], { ...DEFAULT_GEN_PARAMS, count: 5 });
      expect(result.candidates).toHaveLength(5);
    });
  });

  it('keeps exactly one middle dot and puts the surname last', () => {
    const suffixes: PersonSuffix[] = ['father', 'place', 'profession', 'blood', 'title'];
    suffixes.forEach((personSuffix) => {
      const name = genPerson('human', { ...DEFAULT_GEN_PARAMS, personSuffix });
      expect(name).not.toBeNull();
      expect(name!.name.split('·')).toHaveLength(2);
      expect(name!.name).not.toContain('··');
      expect(name!.name.endsWith(`·${name!.name.split('·').at(-1)}`)).toBe(true);
    });
  });

  it('omits surname, short-name and patronymic structure tags', () => {
    races.forEach((race) => {
      const name = genPerson(race, { ...DEFAULT_GEN_PARAMS, personSuffix: 'father' });
      expect(name!.structure).toEqual([]);

      const titled = genPerson(race, { ...DEFAULT_GEN_PARAMS, gender: 'female', surnameBias: 100, personSuffix: 'title' });
      expect(titled!.structure.some((part) => part.label === '女性短名')).toBe(false);
      expect(titled!.structure.some((part) => part.label === '贵族封号')).toBe(true);
      expect(titled!.structure.every((part) => !part.label.startsWith('姓氏') && !part.label.startsWith('稀有姓氏'))).toBe(true);

      const placed = genPerson(race, { ...DEFAULT_GEN_PARAMS, personSuffix: 'place' });
      expect(placed!.structure).toHaveLength(2);
    });
  });

  it('keeps combo name as short name plus surname and gender as candidate field', () => {
    const combo = genCombo('human', ['person', 'place'], { ...DEFAULT_GEN_PARAMS, gender: 'female' });
    expect(combo).not.toBeNull();
    expect(combo!.name.split('·')).toHaveLength(2);
    expect(combo!.name.endsWith(`·${combo!.name.split('·').at(-1)}`)).toBe(true);
    expect(combo!.structure[0].label).toBe('人名');
    expect(combo!.structure.every((part) => !part.label.startsWith('姓氏') && !part.label.startsWith('稀有姓氏'))).toBe(true);

    const batch = generateBatch('human', ['person', 'place'], { ...DEFAULT_GEN_PARAMS, gender: 'female', count: 10 });
    expect(batch.candidates).toHaveLength(10);
    batch.candidates.forEach((candidate) => {
      expect(candidate.combo).toBe(true);
      expect(candidate.gender).toBe('female');
      expect(candidate.charCount).toBe(nameCharCount(candidate.nameText));
    });
  });

  it('puts surname rarity on person and combo candidates as an independent field', () => {
    const personBatch = generateBatch('human', ['person'], { ...DEFAULT_GEN_PARAMS, count: 20 });
    personBatch.candidates.forEach((candidate) => {
      expect(RARITY_TIERS).toContain(candidate.rarity);
    });

    const combo = genCombo('human', ['person', 'place'], DEFAULT_GEN_PARAMS);
    expect(RARITY_TIERS).toContain(combo?.rarity);
  });

  it('resolves unrestricted gender to a real gender on candidates', () => {
    const personBatch = generateBatch('human', ['person'], { ...DEFAULT_GEN_PARAMS, gender: 'any', count: 20 });
    personBatch.candidates.forEach((candidate) => {
      expect(['male', 'female', 'neutral']).toContain(candidate.gender);
    });

    const comboBatch = generateBatch('human', ['person', 'place'], { ...DEFAULT_GEN_PARAMS, gender: 'any', count: 20 });
    comboBatch.candidates.forEach((candidate) => {
      expect(['male', 'female', 'neutral']).toContain(candidate.gender);
      expect(candidate.nameText.split('·')).toHaveLength(2);
    });
  });

  it('honors selected profession and ability in a combo', () => {
    const params: GenParams = {
      ...DEFAULT_GEN_PARAMS,
      professions: ['剑修'],
      abilities: ['御火'],
    };
    const result = genCombo('human', ['person', 'place'], params);
    expect(result?.structure.some((part) => part.word === '剑修')).toBe(true);
    expect(result?.structure.find((part) => part.label === '特殊能力')?.word).toContain('御火');
  });

  it('creates structured place and person names', () => {
    races.forEach((race) => {
      expect(genPlace(race).structure).toHaveLength(2);
      expect(genPerson(race, DEFAULT_GEN_PARAMS)?.name.split('·')).toHaveLength(2);
    });
  });
});
