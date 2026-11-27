// `workshop list`：读取当前目录（可指定 `--dir`）下 `.workshop` 中的角色数据并以表格输出。

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { CANDIDATES_FILE, PLACES_FILE } from '@/cli/constants';
import type { CliOptions } from '@/cli/args';
import { cell, renderTable, type Palette } from '@/cli/format';
import { parseCandidates, parsePlaces } from '@/cli/workshop-file';
import { GENDER_LABELS, RACE_LABELS, TYPE_LABELS } from '@/lib/types';

const CANDIDATE_HEADERS = ['名称', '族群', '类型', '性别', '稀有度', '字数', '来源', '收藏', '创建时间'];
const PLACE_HEADERS = ['名称', '族群', '备注', '创建时间'];

/** 解析项目目录下的 `.workshop` 目录路径 */
export function resolveWorkshopDir(options: CliOptions, dataDirName: string): string {
  const projectDir = resolve(options.dir.trim() === '' ? process.cwd() : options.dir);
  return join(projectDir, dataDirName);
}

export function runList(options: CliOptions, palette: Palette, dataDirName: string, write: (text: string) => void, writeError: (text: string) => void): number {
  const workshopDir = resolveWorkshopDir(options, dataDirName);
  if (!existsSync(workshopDir)) {
    writeError(`当前目录没有 ${dataDirName} 数据目录：${workshopDir}`);
    return 1;
  }

  if (options.type === 'place') {
    const file = join(workshopDir, PLACES_FILE);
    if (!existsSync(file)) {
      writeError(`没有找到 ${PLACES_FILE}：${file}`);
      return 1;
    }
    const rows = parsePlaces(readFileSync(file, 'utf8'));
    write(`${palette.dim}角色库：${file}${palette.reset}`);
    if (rows.length === 0) {
      write('角色库为空');
      return 0;
    }
    write(
      renderTable(
        PLACE_HEADERS,
        rows.map((row) => [row.name, RACE_LABELS[row.race], cell(row.note), cell(row.createdAt)]),
        palette,
      ),
    );
    write(`${palette.dim}共 ${rows.length} 条${palette.reset}`);
    return 0;
  }

  const file = join(workshopDir, CANDIDATES_FILE);
  if (!existsSync(file)) {
    writeError(`没有找到 ${CANDIDATES_FILE}：${file}`);
    return 1;
  }
  const rows = parseCandidates(readFileSync(file, 'utf8'));
  write(`${palette.dim}角色库：${file}${palette.reset}`);
  if (rows.length === 0) {
    write('角色库为空');
    return 0;
  }
  write(
    renderTable(
      CANDIDATE_HEADERS,
      rows.map((row) => [
        row.nameText,
        RACE_LABELS[row.race],
        TYPE_LABELS[row.nameType],
        cell(row.gender ? GENDER_LABELS[row.gender] : ''),
        cell(row.rarity),
        String(row.charCount),
        row.source === 'manual' ? '手动' : '生成',
        row.favorite ? '是' : '否',
        cell(row.createdAt),
      ]),
      palette,
    ),
  );
  write(`${palette.dim}共 ${rows.length} 条${palette.reset}`);
  return 0;
}
