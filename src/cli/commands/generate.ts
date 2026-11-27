// `workshop gen`：按族群、类型、性别、权重与数量生成随机名称并以表格输出。
//
// 默认参数取自项目 preferences.md 中保存的生成规则；输出带 ID，可直接 `workshop add <ID>` 收录。

import type { CliOptions } from '@/cli/args';
import { cell, renderTable, type Palette } from '@/cli/format';
import { attachProject } from '@/cli/project';
import { loadGenPreferences, resolveGenOptions } from '@/cli/preferences';
import { createBatchId, saveTempBatch } from '@/cli/temp';
import { generateBatch } from '@/lib/generator';
import { GENDER_LABELS, RACE_LABELS, TYPE_LABELS } from '@/lib/types';

const HEADERS = ['ID', '名称', '族群', '类型', '性别', '稀有度', '字数', '结构'];

export async function runGenerate(
  options: CliOptions,
  palette: Palette,
  dataDirName: string,
  write: (text: string) => void,
  writeError: (text: string) => void,
): Promise<number> {
  const context = attachProject(options, dataDirName);
  const prefs = await loadGenPreferences(context.storage);
  const resolved = resolveGenOptions(options, prefs);

  const result = generateBatch(resolved.race, [resolved.type], resolved.params);
  if (result.candidates.length === 0) {
    write('没有生成任何名称，请调整参数后重试');
    return 1;
  }

  // 生成结果写入 .workshop/temp.md（保留最近几次），ID 供 workshop add 使用
  const batch = createBatchId();
  const entries = result.candidates.map((candidate, index) => ({
    id: `${batch}_${index}`,
    nameText: candidate.nameText,
    race: candidate.race,
    nameType: candidate.nameType,
    ...(candidate.gender ? { gender: candidate.gender } : {}),
    ...(candidate.rarity ? { rarity: candidate.rarity } : {}),
    charCount: candidate.charCount,
    structure: candidate.structure,
    batch,
    createdAt: candidate.createdAt,
  }));
  try {
    await saveTempBatch(context.storage, entries);
  } catch (error) {
    writeError(`保存生成结果失败：${(error as Error)?.message ?? String(error)}`);
    return 1;
  }

  const rows = entries.map((entry) => [
    entry.id,
    entry.nameText,
    RACE_LABELS[entry.race],
    TYPE_LABELS[entry.nameType],
    cell(entry.gender ? GENDER_LABELS[entry.gender] : ''),
    cell(entry.rarity ?? ''),
    String(entry.charCount),
    cell(entry.structure.map((part) => `${part.label}·${part.word}`).join('、')),
  ]);

  write(renderTable(HEADERS, rows, palette));
  const deduped = result.deduped > 0 ? `（去重 ${result.deduped} 条）` : '';
  write(`${palette.dim}共 ${result.total} 条${deduped}；用 workshop add <ID> 收录${palette.reset}`);
  return 0;
}
