// `workshop list`：读取项目 `.workshop` 下的设定卡、地名库或候选库并以表格输出。
//
// 数据统一经由桌面应用的数据服务读取（对应 sheets.md / places.md / candidates.md）。

import { join } from 'node:path';

import type { CliOptions } from '@/cli/args';
import type { ListTarget } from '@/cli/constants';
import { cell, renderTable, type Palette } from '@/cli/format';
import { attachProject, hasDataDir } from '@/cli/project';
import { PROJECT_FILES } from '@/electron/services/workshop-storage.cts';
import { DEFAULT_FILTERS, GENDER_LABELS, RACE_LABELS, TYPE_LABELS } from '@/lib/types';

const SHEET_HEADERS = ['人物名', '族群', '性别', '职业', '籍贯', '备注', '关系', '创建时间'];
const PLACE_HEADERS = ['名称', '族群', '备注', '创建时间'];
const CANDIDATE_HEADERS = ['名称', '族群', '类型', '性别', '稀有度', '字数', '来源', '收藏', '创建时间'];

/** 时间戳格式化为 ISO 文本 */
function formatTime(value: number): string {
  return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : '';
}

/**
 * 解析要列出的数据类别。
 *
 * 默认是设定卡；`--type` 是旧用法（人名 → 候选库、地名 → 地名库），仅在未显式给出类别时生效。
 */
function resolveListTarget(options: CliOptions): ListTarget {
  if (options.listTargetProvided || !options.type) return options.listTarget;
  return options.type === 'place' ? 'places' : 'candidates';
}

export async function runList(
  options: CliOptions,
  palette: Palette,
  dataDirName: string,
  write: (text: string) => void,
  writeError: (text: string) => void,
): Promise<number> {
  const context = attachProject(options, dataDirName);
  if (!hasDataDir(context)) {
    writeError(`当前目录没有 ${dataDirName} 数据目录：${context.workshopDir}`);
    return 1;
  }

  const target = resolveListTarget(options);

  if (target === 'places') {
    const rows = await context.storage.placesList();
    write(`${palette.dim}地名库：${join(context.workshopDir, PROJECT_FILES.places)}${palette.reset}`);
    if (rows.length === 0) {
      write('地名库为空');
      return 0;
    }
    write(
      renderTable(
        PLACE_HEADERS,
        rows.map((row) => [row.name, RACE_LABELS[row.race], cell(row.note), cell(formatTime(row.createdAt))]),
        palette,
      ),
    );
    write(`${palette.dim}共 ${rows.length} 条${palette.reset}`);
    return 0;
  }

  if (target === 'candidates') {
    const rows = await context.storage.candidatesList(DEFAULT_FILTERS);
    write(`${palette.dim}候选库：${join(context.workshopDir, PROJECT_FILES.candidates)}${palette.reset}`);
    if (rows.length === 0) {
      write('候选库为空');
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
          cell(row.rarity ?? ''),
          String(row.charCount),
          row.source === 'manual' ? '手动' : '生成',
          row.favorite ? '是' : '否',
          cell(formatTime(row.createdAt)),
        ]),
        palette,
      ),
    );
    write(`${palette.dim}共 ${rows.length} 条${palette.reset}`);
    return 0;
  }

  const rows = await context.storage.sheetsList();
  write(`${palette.dim}设定卡：${join(context.workshopDir, PROJECT_FILES.sheets)}${palette.reset}`);
  if (rows.length === 0) {
    write('设定卡为空');
    return 0;
  }
  write(
    renderTable(
      SHEET_HEADERS,
      rows.map((row) => [
        row.characterName,
        RACE_LABELS[row.race],
        cell(row.gender ? GENDER_LABELS[row.gender] : ''),
        cell(row.occupation),
        cell(row.hometown),
        cell(row.note),
        String(row.relationCount ?? 0),
        cell(formatTime(row.createdAt)),
      ]),
      palette,
    ),
  );
  write(`${palette.dim}共 ${rows.length} 条${palette.reset}`);
  return 0;
}
