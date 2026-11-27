// 项目数据文件（`.workshop`）读写：CLI 只读取角色库并追加新记录。
//
// 字段格式与主进程 `src/electron/services/workshop-markdown.cts` 保持一致：
// 「## 标题」分条，字段行为 `- 字段: 值`；解析时容错，跳过不完整条目。

import { GENDER_LABELS, RACE_LABELS, TYPE_LABELS } from '@/lib/types';
import type { NameGender, NameTypeKey, RaceKey } from '@/lib/types';

export interface CandidateRow {
  id: string;
  nameText: string;
  race: RaceKey;
  nameType: NameTypeKey;
  gender: NameGender | '';
  rarity: string;
  charCount: number;
  source: 'generated' | 'manual';
  favorite: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceRow {
  id: string;
  name: string;
  race: RaceKey;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 计入字数的字符数：排除「·」分隔符（与主进程 `nameCharCount` 规则一致） */
export function nameCharCount(nameText: string): number {
  return Array.from(String(nameText ?? '').replace(/·/g, '')).length;
}

function parseRace(value: string): RaceKey {
  const text = value.trim();
  if (text === '混血' || text === 'mixed') return 'mixed';
  if (text === '妖鬼' || text === 'yaogui') return 'yaogui';
  if (text === '精灵族' || text === 'elf' || text === 'demon' || text === '妖族') return 'elf';
  return 'human';
}

function parseNameType(value: string): NameTypeKey {
  return value.trim() === '地名' || value.trim() === 'place' ? 'place' : 'person';
}

function parseGender(value: string): NameGender | '' {
  const text = value.trim();
  if (text === '不限' || text === 'any') return 'any';
  if (text === '男性' || text === 'male') return 'male';
  if (text === '女性' || text === 'female') return 'female';
  if (text === '中性' || text === 'neutral') return 'neutral';
  return '';
}

function parseBoolean(value: string): boolean {
  const text = value.trim();
  return text === '是' || text === 'true' || text === '1';
}

/** 字段值解码：兼容反引号包裹与 JSON 字符串 */
function decodeValue(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('`') && value.endsWith('`')) return value.slice(1, -1);
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // 保持原文本
    }
  }
  return value;
}

/** 字段值编码：含换行、制表符、引号或首尾空格时用 JSON 字符串 */
export function encodeValue(value: string): string {
  const text = String(value ?? '');
  if (/[\r\n\t]/.test(text) || text.startsWith('"') || text.trim() !== text) return JSON.stringify(text);
  return text;
}

interface FieldEntry {
  key: string;
  value: string;
}

function splitSections(text: string): Array<{ heading: string; fields: Map<string, string> }> {
  const sections: Array<{ heading: string; fields: Map<string, string> }> = [];
  let heading = '';
  let fields = new Map<string, string>();
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  for (const line of lines) {
    const matched = /^##\s+(.*)$/.exec(line);
    if (matched) {
      if (heading !== '' || fields.size > 0) sections.push({ heading, fields });
      heading = (matched[1] ?? '').trim();
      fields = new Map<string, string>();
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (!bullet) continue;
    const body = bullet[1] ?? '';
    const separator = body.indexOf(':');
    if (separator < 0) continue;
    const key = body.slice(0, separator).trim();
    if (!key || fields.has(key)) continue;
    fields.set(key, decodeValue(body.slice(separator + 1)));
  }
  if (heading !== '' || fields.size > 0) sections.push({ heading, fields });
  return sections;
}

function fieldValue(fields: Map<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = fields.get(key);
    if (value !== undefined) return value;
  }
  return '';
}

function cleanHeading(heading: string): string {
  return heading.replace(/^\d+\.\s*/, '').trim();
}

/** 解析 `candidates.md` 文本 */
export function parseCandidates(text: string): CandidateRow[] {
  const rows: CandidateRow[] = [];
  for (const section of splitSections(text)) {
    const fields = section.fields;
    const id = fieldValue(fields, 'ID', 'id');
    const nameText = fieldValue(fields, '名称', 'nameText') || cleanHeading(section.heading);
    if (!id || !nameText) continue;
    rows.push({
      id,
      nameText,
      race: parseRace(fieldValue(fields, '族群')),
      nameType: parseNameType(fieldValue(fields, '类型')),
      gender: parseGender(fieldValue(fields, '性别')),
      rarity: fieldValue(fields, '稀有度'),
      charCount: nameCharCount(nameText),
      source: fieldValue(fields, '来源') === '手动' ? 'manual' : 'generated',
      favorite: parseBoolean(fieldValue(fields, '收藏')),
      note: fieldValue(fields, '备注'),
      createdAt: fieldValue(fields, '创建时间', 'createdAt'),
      updatedAt: fieldValue(fields, '更新时间', 'updatedAt'),
    });
  }
  return rows;
}

/** 解析 `places.md` 文本 */
export function parsePlaces(text: string): PlaceRow[] {
  const rows: PlaceRow[] = [];
  for (const section of splitSections(text)) {
    const fields = section.fields;
    const id = fieldValue(fields, 'ID', 'id');
    const name = fieldValue(fields, '名称', 'name') || cleanHeading(section.heading);
    if (!id || !name) continue;
    rows.push({
      id,
      name,
      race: parseRace(fieldValue(fields, '族群')),
      note: fieldValue(fields, '备注'),
      createdAt: fieldValue(fields, '创建时间', 'createdAt'),
      updatedAt: fieldValue(fields, '更新时间', 'updatedAt'),
    });
  }
  return rows;
}

/** 新建候选库文件时的表头 */
export function candidatesHeader(): string {
  return ['# 名称候选', '', '> 由「Creation Workshop」自动维护。每条候选以 `##` 分隔，字段行请保持 `- 字段: 值` 格式。', '', ''].join('\n');
}

/** 新建地名库文件时的表头 */
export function placesHeader(): string {
  return ['# 地名', '', '> 由「Creation Workshop」自动维护。每个地名以 `##` 分隔，字段行请保持 `- 字段: 值` 格式。', '', ''].join('\n');
}

/** 生成一条候选记录（字段顺序与主进程序列化一致） */
export function serializeCandidateSection(input: {
  id: string;
  nameText: string;
  race: RaceKey;
  nameType: NameTypeKey;
  gender: NameGender | '';
  rarity: string;
  source: 'generated' | 'manual';
  favorite: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
}): string {
  const out: string[] = [];
  out.push(`## ${input.nameText.replace(/[\r\n]+/g, ' ').trim()}`);
  out.push('');
  out.push(`- ID: \`${input.id}\``);
  out.push(`- 名称: ${encodeValue(input.nameText)}`);
  out.push(`- 族群: ${RACE_LABELS[input.race]}`);
  out.push(`- 类型: ${TYPE_LABELS[input.nameType]}`);
  if (input.gender) out.push(`- 性别: ${GENDER_LABELS[input.gender]}`);
  if (input.rarity) out.push(`- 稀有度: ${input.rarity}`);
  out.push(`- 字数: ${nameCharCount(input.nameText)}`);
  out.push(`- 来源: ${input.source === 'manual' ? '手动' : '生成'}`);
  out.push(`- 收藏: ${input.favorite ? '是' : '否'}`);
  out.push(`- 备注: ${encodeValue(input.note)}`);
  out.push(`- 创建时间: ${input.createdAt}`);
  out.push(`- 更新时间: ${input.updatedAt}`);
  out.push('');
  out.push('');
  return out.join('\n');
}

/** 生成一条地名记录（字段顺序与主进程序列化一致） */
export function serializePlaceSection(input: { id: string; name: string; race: RaceKey; note: string; createdAt: string; updatedAt: string }): string {
  const out: string[] = [];
  out.push(`## ${input.name.replace(/[\r\n]+/g, ' ').trim()}`);
  out.push('');
  out.push(`- ID: \`${input.id}\``);
  out.push(`- 名称: ${encodeValue(input.name)}`);
  out.push(`- 族群: ${RACE_LABELS[input.race]}`);
  out.push(`- 备注: ${encodeValue(input.note)}`);
  out.push(`- 创建时间: ${input.createdAt}`);
  out.push(`- 更新时间: ${input.updatedAt}`);
  out.push('');
  out.push('');
  return out.join('\n');
}
