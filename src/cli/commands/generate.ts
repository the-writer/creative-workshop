// `workshop gen`：按族群、类型、性别、权重与数量生成随机名称并以表格输出。

import { WEIGHT_SCALE } from '@/cli/constants';
import type { CliOptions } from '@/cli/args';
import { cell, renderTable, type Palette } from '@/cli/format';
import { generateBatch, type GenParams } from '@/lib/generator';
import { GENDER_LABELS, RACE_LABELS, TYPE_LABELS } from '@/lib/types';

const HEADERS = ['序号', '名称', '族群', '类型', '性别', '稀有度', '字数', '结构'];

/** CLI 固定使用「短名 + 父名 + 姓氏」与「2–3 字短名」，其余规则沿用应用默认值 */
function buildParams(options: CliOptions): GenParams {
  return {
    count: options.count,
    shortMode: 'mix',
    personSuffix: 'father',
    minChars: 4,
    maxChars: 8,
    professions: [],
    abilities: [],
    gender: options.gender,
    surnameBias: Math.round(options.weight * WEIGHT_SCALE),
  };
}

export function runGenerate(options: CliOptions, palette: Palette, write: (text: string) => void): number {
  const result = generateBatch(options.race, [options.type], buildParams(options));
  if (result.candidates.length === 0) {
    write('没有生成任何名称，请调整参数后重试');
    return 1;
  }

  const rows = result.candidates.map((candidate, index) => [
    String(index + 1),
    candidate.nameText,
    RACE_LABELS[candidate.race],
    TYPE_LABELS[candidate.nameType],
    cell(candidate.gender ? GENDER_LABELS[candidate.gender] : ''),
    cell(candidate.rarity ?? ''),
    String(candidate.charCount),
    cell(candidate.structure.map((part) => `${part.label}·${part.word}`).join('、')),
  ]);

  write(renderTable(HEADERS, rows, palette));
  const deduped = result.deduped > 0 ? `（去重 ${result.deduped} 条）` : '';
  write(`${palette.dim}共 ${result.total} 条${deduped}${palette.reset}`);
  return 0;
}
