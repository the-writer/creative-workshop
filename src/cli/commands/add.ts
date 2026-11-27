// `workshop add`：把角色写入当前目录（可指定 `--dir`）下 `.workshop` 的角色库。

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { CANDIDATES_FILE, PLACES_FILE } from '@/cli/constants';
import type { CliOptions } from '@/cli/args';
import { candidatesHeader, parseCandidates, parsePlaces, placesHeader, serializeCandidateSection, serializePlaceSection } from '@/cli/workshop-file';
import { RACE_LABELS } from '@/lib/types';
import { resolveWorkshopDir } from '@/cli/commands/list';

export function runAdd(options: CliOptions, dataDirName: string, write: (text: string) => void, writeError: (text: string) => void): number {
  const name = options.name.trim();
  if (!name) {
    writeError('--add 需要 --name "<名称>"');
    return 1;
  }

  const workshopDir = resolveWorkshopDir(options, dataDirName);
  const isPlace = options.type === 'place';
  const file = join(workshopDir, isPlace ? PLACES_FILE : CANDIDATES_FILE);

  if (!existsSync(workshopDir)) mkdirSync(workshopDir, { recursive: true });

  const existingText = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const duplicate = isPlace
    ? parsePlaces(existingText).some((row) => row.name === name && row.race === options.race)
    : parseCandidates(existingText).some((row) => row.nameText === name && row.race === options.race);
  if (duplicate) {
    writeError(`该名称已在库中：${name}`);
    return 1;
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const section = isPlace
    ? serializePlaceSection({ id, name, race: options.race, note: options.note, createdAt: now, updatedAt: now })
    : serializeCandidateSection({
        id,
        nameText: name,
        race: options.race,
        nameType: options.type,
        gender: options.gender,
        rarity: '',
        source: 'manual',
        favorite: options.favorite,
        note: options.note,
        createdAt: now,
        updatedAt: now,
      });

  if (!existsSync(file)) {
    writeFileSync(file, isPlace ? placesHeader() : candidatesHeader(), 'utf8');
  }
  appendFileSync(file, section, 'utf8');

  write(`已写入 ${file}：${name}（${RACE_LABELS[options.race]}）`);
  return 0;
}
