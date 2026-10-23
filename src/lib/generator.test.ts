import { describe, expect, it } from 'vitest';
import { LEXICON, SURNAMES, SURNAME_RARE_POPULATION_SHARE, SYLLABLE_GENDER_BIAS, SYLLABLES, computeCombinationTotals, formatCombination } from '@/data/lexicon';
import {
  DEFAULT_GEN_PARAMS,
  genCombo,
  genNickname,
  genOffice,
  genPerson,
  genPlace,
  generateBatch,
  getSurnameChoices,
  pickSurname,
  type GenParams,
} from '@/lib/generator';
import { GENDER_KEYS, type NameTypeKey, type RaceKey } from '@/lib/types';

const races: RaceKey[] = ['human', 'demon'];
const types: NameTypeKey[] = ['person', 'place', 'office', 'nickname'];

describe('lexicon', () => {
  it('contains expanded and unique syllable, root and gender lists', () => {
    races.forEach((race) => {
      expect(SYLLABLES[race]).toHaveLength(160);
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

  it('uses exact bigint combination totals beyond the safe integer range', () => {
    const totals = computeCombinationTotals();
    expect(totals.grandTotal).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(formatCombination(totals.grandTotal)).toMatch(/兆|京/);
  });
});

describe('generation', () => {
  it.each(races)('generates every type for %s', (race) => {
    types.forEach((type) => {
      const result = generateBatch(race, [type], { ...DEFAULT_GEN_PARAMS, count: 20 });
      expect(result.candidates).toHaveLength(20);
      result.candidates.forEach((candidate) => {
        expect(candidate.nameText.length).toBeGreaterThan(0);
        expect(candidate.structure.length).toBeGreaterThan(0);
        expect(Number.isSafeInteger(candidate.createdAt)).toBe(true);
      });
    });
  });

  it('keeps nickname length between two and eight characters', () => {
    races.forEach((race) => {
      for (let length = 2; length <= 8; length += 1) {
        const nickname = genNickname(race, length);
        expect(Array.from(nickname.name)).toHaveLength(length);
      }
    });
  });

  it('generates a female noble name with a weighted surname', () => {
    const name = genPerson('human', {
      ...DEFAULT_GEN_PARAMS,
      gender: 'female',
      surnameBias: 100,
      personSuffix: 'title',
    });
    expect(name?.structure.some((part) => part.label === '女性短名')).toBe(true);
    expect(name?.structure.some((part) => part.label.startsWith('姓氏') || part.label.startsWith('稀有姓氏'))).toBe(true);
    expect(name?.structure.some((part) => part.label === '贵族封号')).toBe(true);
  });

  it('honors selected profession and ability in a combo', () => {
    const params: GenParams = {
      ...DEFAULT_GEN_PARAMS,
      professions: ['剑修'],
      abilities: ['御火'],
    };
    const result = genCombo('human', ['person', 'place', 'office', 'nickname'], params);
    expect(result?.structure.some((part) => part.word === '剑修')).toBe(true);
    expect(result?.structure.find((part) => part.label === '特殊能力')?.word).toContain('御火');
  });

  it('creates structured place, office and person names', () => {
    races.forEach((race) => {
      expect(genPlace(race).structure).toHaveLength(2);
      expect(genOffice(race).structure).toHaveLength(3);
      expect(genPerson(race, DEFAULT_GEN_PARAMS)?.structure.length).toBeGreaterThanOrEqual(3);
    });
  });
});
