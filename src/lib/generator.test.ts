import { describe, expect, it } from 'vitest';
import { LEXICON, SYLLABLES, computeCombinationTotals, formatCombination } from '@/data/lexicon';
import { DEFAULT_GEN_PARAMS, genCombo, genNickname, genOffice, genPerson, genPlace, generateBatch, type GenParams } from '@/lib/generator';
import type { NameTypeKey, RaceKey } from '@/lib/types';

const races: RaceKey[] = ['human', 'demon'];
const types: NameTypeKey[] = ['person', 'place', 'office', 'nickname'];

describe('lexicon', () => {
  it('contains no duplicate roots in any indexed list', () => {
    races.forEach((race) => {
      expect(new Set(SYLLABLES[race]).size).toBe(SYLLABLES[race].length);
      Object.values(LEXICON[race]).forEach((values) => {
        expect(new Set(values).size).toBe(values.length);
      });
    });
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
      expect(genPerson(race, DEFAULT_GEN_PARAMS)?.structure.length).toBeGreaterThanOrEqual(2);
    });
  });
});
