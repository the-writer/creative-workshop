// `workshop add`：把名称写入项目 `.workshop` 的角色库。
//
// 支持两种来源：`--name "<名称>"` 手动录入，或 `workshop add <ID>` 直接收录 `workshop gen` 的结果。

import { join } from 'node:path';

import type { CliOptions } from '@/cli/args';
import { CLI_NAME } from '@/cli/constants';
import { attachProject } from '@/cli/project';
import { loadGenPreferences, resolveCharacterDefaults } from '@/cli/preferences';
import { findTempEntry } from '@/cli/temp';
import { PROJECT_FILES } from '@/electron/services/workshop-storage.cts';
import { RACE_LABELS } from '@/lib/types';

export async function runAdd(options: CliOptions, dataDirName: string, write: (text: string) => void, writeError: (text: string) => void): Promise<number> {
  const context = attachProject(options, dataDirName);
  const prefs = await loadGenPreferences(context.storage);
  const defaults = resolveCharacterDefaults(options, prefs);

  // 按 ID 收录最近一次（或前几次）生成的结果
  const addId = options.addId.trim();
  let entry = null;
  if (addId) {
    entry = await findTempEntry(context.storage, addId);
    if (!entry) {
      writeError(`未找到生成结果 ${addId}（请先运行 ${CLI_NAME} gen）`);
      return 1;
    }
  }

  const name = entry ? entry.nameText : options.name.trim();
  if (!name) {
    writeError(`需要 --name "<名称>" 或生成结果 ID（如 ${CLI_NAME} add a1b2c3_0）`);
    return 1;
  }

  const isPlace = entry ? entry.nameType === 'place' : defaults.type === 'place';
  const race = entry ? entry.race : defaults.race;

  if (isPlace) {
    const result = await context.storage.placeSave({
      name,
      race,
      structure: entry?.structure ?? [],
      note: options.note,
    });
    if (!result.ok) {
      writeError(result.message ?? '写入失败');
      return 1;
    }
    write(`已写入 ${join(context.workshopDir, PROJECT_FILES.places)}：${name}（${RACE_LABELS[race]}）`);
    return 0;
  }

  const gender = entry?.gender ?? defaults.gender;
  const result = await context.storage.candidateCreate({
    race,
    nameType: entry?.nameType ?? defaults.type,
    nameText: name,
    structure: entry?.structure ?? [],
    source: entry ? 'generated' : 'manual',
    ...(gender ? { gender } : {}),
    ...(entry?.rarity ? { rarity: entry.rarity } : {}),
    favorite: options.favorite,
    note: options.note,
  });
  if (!result.ok) {
    writeError(result.message ?? '写入失败');
    return 1;
  }
  write(`已写入 ${join(context.workshopDir, PROJECT_FILES.candidates)}：${name}（${RACE_LABELS[race]}）`);
  return 0;
}
