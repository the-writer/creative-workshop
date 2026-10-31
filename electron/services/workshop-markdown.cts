// 项目 .workshop 目录下的 Markdown 读写：分门别类保存候选、设定、关系、图谱与偏好。
// 文件为「标题 + 字段行」的可读 Markdown；解析时容错，跳过不完整条目。

export type RaceKey = 'human' | 'elf';
export type NameTypeKey = 'person' | 'place' | 'office' | 'nickname';
export type NameGender = 'any' | 'male' | 'female' | 'neutral';
export type RarityTier = 'S' | 'SS' | 'SSS' | 'SSSR';
export type EntityType = 'sheet' | 'place';

export interface StructurePart {
  label: string;
  word: string;
}

export interface Candidate {
  id: string;
  race: RaceKey;
  nameType: NameTypeKey;
  nameText: string;
  charCount: number;
  structure: StructurePart[];
  source: 'generated' | 'manual';
  favorite: boolean;
  note: string;
  gender?: NameGender;
  rarity?: RarityTier;
  createdAt: number;
  updatedAt: number;
}

export interface Sheet {
  id: string;
  characterName: string;
  race: RaceKey;
  gender?: NameGender;
  candidateId: string;
  occupation: string;
  office: string;
  hometown: string;
  hometownCandidateId: string;
  nickname: string;
  contractTitle: string;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface Relation {
  id: string;
  fromType: EntityType;
  fromId: string;
  fromName: string;
  toType: EntityType;
  toId: string;
  toName: string;
  relationType: string;
  note: string;
  createdAt: number;
}

export interface GraphPoint {
  x: number;
  y: number;
}

export type GraphLayout = Record<string, GraphPoint>;

export interface ProjectInfo {
  name: string;
  formatVersion: number;
  createdAt: number;
}

export interface CandidateFilters {
  race: RaceKey | 'all';
  nameType: NameTypeKey | 'all';
  minChars: number;
  maxChars: number;
  status: 'all' | 'favorite' | 'referenced';
  keyword: string;
  sort: 'latest' | 'charCount' | 'nameText';
}

/* ---------------- 常量与枚举映射 ---------------- */

export const SCHEMA_VERSION = 1;

const RACE_LABELS: Record<RaceKey, string> = { human: '人族', elf: '精灵族' };
const TYPE_LABELS: Record<NameTypeKey, string> = { person: '人名', place: '地名', office: '官职', nickname: '绰号' };
const INI_TYPE_GROUPS: Record<NameTypeKey, string> = { person: '人物', place: '地名', office: '官职', nickname: '绰号' };
const INI_GROUP_ORDER = ['人物', '地名', '官职', '绰号'];
const GENDER_LABELS: Record<NameGender, string> = { any: '不限', male: '男性', female: '女性', neutral: '中性' };
const ENTITY_LABELS: Record<EntityType, string> = { sheet: '设定卡', place: '地名' };

function parseRace(value: string): RaceKey {
  if (value === '人族' || value === 'human') return 'human';
  if (value === '精灵族' || value === 'elf' || value === 'demon' || value === '妖族') return 'elf';
  return 'human';
}

function parseNameType(value: string): NameTypeKey {
  if (value === '地名' || value === 'place') return 'place';
  if (value === '官职' || value === 'office') return 'office';
  if (value === '绰号' || value === 'nickname') return 'nickname';
  return 'person';
}

function parseGender(value: string): NameGender | undefined {
  if (value === '不限' || value === 'any') return 'any';
  if (value === '男性' || value === 'male') return 'male';
  if (value === '女性' || value === 'female') return 'female';
  if (value === '中性' || value === 'neutral') return 'neutral';
  return undefined;
}

function parseRarity(value: string): RarityTier | undefined {
  return value === 'S' || value === 'SS' || value === 'SSS' || value === 'SSSR' ? value : undefined;
}

function parseEntityType(value: string): EntityType {
  return value === '地名' || value === 'place' ? 'place' : 'sheet';
}

function parseBoolean(value: string): boolean {
  return value === '是' || value === 'true' || value === '1';
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 计入字数的字符数：排除人名/组合名中的「·」分隔符。 */
export function nameCharCount(nameText: string): number {
  return Array.from(String(nameText ?? '').replace(/·/g, '')).length;
}

function timestamp(value: number): string {
  const ts = Number.isFinite(value) && value > 0 ? value : Date.now();
  return new Date(ts).toISOString();
}

function parseTimestamp(value: string): number {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/* ---------------- 字段行解析 ---------------- */

interface FieldEntry {
  key: string;
  value: string;
  children: Array<{ key: string; value: string }>;
}

interface MdSection {
  heading: string;
  body: string[];
}

function splitSections(text: string): { preamble: string[]; sections: MdSection[] } {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const preamble: string[] = [];
  const sections: MdSection[] = [];
  let current: MdSection | null = null;
  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      current = { heading: (heading[1] ?? '').trim(), body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
    else preamble.push(line);
  }
  return { preamble, sections };
}

function splitKeyValue(text: string): { key: string; value: string } | null {
  const index = text.indexOf(': ');
  if (index >= 0) return { key: text.slice(0, index).trim(), value: text.slice(index + 2).trim() };
  const colon = text.indexOf(':');
  if (colon >= 0) return { key: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim() };
  return null;
}

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

function encodeValue(value: string): string {
  const text = String(value ?? '');
  if (/[\r\n\t]/.test(text) || text.startsWith('"') || text.trim() !== text) return JSON.stringify(text);
  return text;
}

function encodeId(id: string): string {
  return `\`${id}\``;
}

function parseFields(body: string[]): FieldEntry[] {
  const entries: FieldEntry[] = [];
  for (const line of body) {
    const nested = /^\s{2,}[-*]\s+(.*)$/.exec(line);
    if (nested) {
      const last = entries[entries.length - 1];
      if (!last) continue;
      const pair = splitKeyValue(nested[1] ?? '');
      if (pair) last.children.push({ key: pair.key, value: decodeValue(pair.value) });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (!bullet) continue;
    const pair = splitKeyValue(bullet[1] ?? '');
    if (!pair) continue;
    entries.push({ key: pair.key, value: decodeValue(pair.value), children: [] });
  }
  return entries;
}

function toFieldMap(entries: FieldEntry[]): Map<string, FieldEntry> {
  const map = new Map<string, FieldEntry>();
  entries.forEach((entry) => map.set(entry.key, entry));
  return map;
}

function fieldValue(map: Map<string, FieldEntry>, ...keys: string[]): string {
  for (const key of keys) {
    const entry = map.get(key);
    if (entry) return entry.value;
  }
  return '';
}

function cleanHeading(heading: string): string {
  return heading.replace(/^\d+\.\s*/, '').trim();
}

function headingText(text: string): string {
  return String(text ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function normalizeStructure(parts: Array<{ key: string; value: string }>): StructurePart[] {
  return parts.map((part) => ({ label: part.key, word: part.value })).filter((part) => part.label !== '' && part.word !== '' && part.label !== '结构');
}

/* ---------------- 项目文件 ---------------- */

export function parseProjectMarkdown(text: string, fallbackName: string): ProjectInfo {
  const { preamble } = splitSections(text);
  const lines = preamble.map((line) => line.trim());
  const heading = lines.find((line) => line.startsWith('# ')) ?? '';
  const nameMatch = /^#\s*项目[：:]\s*(.*)$/.exec(heading);
  const fields = toFieldMap(parseFields(preamble));
  const formatVersion = Number(fieldValue(fields, '格式版本')) || SCHEMA_VERSION;
  const createdAt = parseTimestamp(fieldValue(fields, '创建时间'));
  return {
    name: (nameMatch?.[1] ?? '').trim() || fallbackName,
    formatVersion,
    createdAt,
  };
}

export function serializeProjectMarkdown(name: string): string {
  return [
    `# 项目：${headingText(name)}`,
    '',
    '> 本文件由「创作工坊」维护；项目数据保存在同目录的 `.workshop` 中。',
    '',
    `- 格式版本: ${SCHEMA_VERSION}`,
    `- 创建时间: ${timestamp(Date.now())}`,
    '',
  ].join('\n');
}

/* ---------------- 名称候选 ---------------- */

export function parseCandidatesMarkdown(text: string): Candidate[] {
  const { sections } = splitSections(text);
  const result: Candidate[] = [];
  for (const section of sections) {
    const fields = toFieldMap(parseFields(section.body));
    const id = fieldValue(fields, 'ID', 'id');
    const nameText = fieldValue(fields, '名称', 'nameText') || cleanHeading(section.heading);
    if (!id || !nameText) continue;
    const createdAt = parseTimestamp(fieldValue(fields, '创建时间', 'createdAt'));
    const gender = parseGender(fieldValue(fields, '性别'));
    const rarity = parseRarity(fieldValue(fields, '稀有度'));
    const structureEntry = fields.get('结构');
    result.push({
      id,
      race: parseRace(fieldValue(fields, '族群')),
      nameType: parseNameType(fieldValue(fields, '类型')),
      nameText,
      charCount: nameCharCount(nameText),
      structure: normalizeStructure(structureEntry?.children ?? []),
      source: fieldValue(fields, '来源') === '手动' ? 'manual' : 'generated',
      favorite: parseBoolean(fieldValue(fields, '收藏')),
      note: fieldValue(fields, '备注'),
      ...(gender ? { gender } : {}),
      ...(rarity ? { rarity } : {}),
      createdAt,
      updatedAt: parseTimestamp(fieldValue(fields, '更新时间', 'updatedAt')) || createdAt,
    });
  }
  return result;
}

export function serializeCandidatesMarkdown(candidates: Candidate[]): string {
  const out: string[] = ['# 名称候选', '', '> 由「创作工坊」自动维护。每条候选以 `##` 分隔，字段行请保持 `- 字段: 值` 格式。', ''];
  candidates.forEach((candidate) => {
    out.push(`## ${headingText(candidate.nameText)}`);
    out.push('');
    out.push(`- ID: ${encodeId(candidate.id)}`);
    out.push(`- 名称: ${encodeValue(candidate.nameText)}`);
    out.push(`- 族群: ${RACE_LABELS[candidate.race]}`);
    out.push(`- 类型: ${TYPE_LABELS[candidate.nameType]}`);
    if (candidate.gender) out.push(`- 性别: ${GENDER_LABELS[candidate.gender]}`);
    if (candidate.rarity) out.push(`- 稀有度: ${candidate.rarity}`);
    out.push(`- 字数: ${candidate.charCount}`);
    out.push(`- 来源: ${candidate.source === 'manual' ? '手动' : '生成'}`);
    out.push(`- 收藏: ${candidate.favorite ? '是' : '否'}`);
    out.push(`- 备注: ${encodeValue(candidate.note)}`);
    out.push(`- 创建时间: ${timestamp(candidate.createdAt)}`);
    out.push(`- 更新时间: ${timestamp(candidate.updatedAt)}`);
    if (candidate.structure.length > 0) {
      out.push('- 结构:');
      candidate.structure.forEach((part) => out.push(`  - ${part.label}: ${encodeValue(part.word)}`));
    }
    out.push('');
  });
  return out.join('\n');
}

/* ---------------- 设定卡 ---------------- */

export function parseSheetsMarkdown(text: string): Sheet[] {
  const { sections } = splitSections(text);
  const result: Sheet[] = [];
  for (const section of sections) {
    const fields = toFieldMap(parseFields(section.body));
    const id = fieldValue(fields, 'ID', 'id');
    const characterName = fieldValue(fields, '人物名', 'characterName') || cleanHeading(section.heading);
    if (!id || !characterName) continue;
    const createdAt = parseTimestamp(fieldValue(fields, '创建时间', 'createdAt'));
    const gender = parseGender(fieldValue(fields, '性别'));
    result.push({
      id,
      characterName,
      race: parseRace(fieldValue(fields, '族群')),
      ...(gender ? { gender } : {}),
      candidateId: fieldValue(fields, '候选关联', 'candidateId'),
      occupation: fieldValue(fields, '职业'),
      office: fieldValue(fields, '官职'),
      hometown: fieldValue(fields, '籍贯'),
      hometownCandidateId: fieldValue(fields, '籍贯候选', 'hometownCandidateId'),
      nickname: fieldValue(fields, '绰号'),
      contractTitle: fieldValue(fields, '契约称号'),
      note: fieldValue(fields, '备注'),
      createdAt,
      updatedAt: parseTimestamp(fieldValue(fields, '更新时间', 'updatedAt')) || createdAt,
    });
  }
  return result;
}

export function serializeSheetsMarkdown(sheets: Sheet[]): string {
  const out: string[] = ['# 设定卡', '', '> 由「创作工坊」自动维护。每张设定卡以 `##` 分隔，字段行请保持 `- 字段: 值` 格式。', ''];
  sheets.forEach((sheet) => {
    out.push(`## ${headingText(sheet.characterName || '未命名人物')}`);
    out.push('');
    out.push(`- ID: ${encodeId(sheet.id)}`);
    out.push(`- 人物名: ${encodeValue(sheet.characterName)}`);
    out.push(`- 族群: ${RACE_LABELS[sheet.race]}`);
    if (sheet.gender) out.push(`- 性别: ${GENDER_LABELS[sheet.gender]}`);
    if (sheet.candidateId) out.push(`- 候选关联: ${encodeId(sheet.candidateId)}`);
    out.push(`- 职业: ${encodeValue(sheet.occupation)}`);
    out.push(`- 官职: ${encodeValue(sheet.office)}`);
    out.push(`- 籍贯: ${encodeValue(sheet.hometown)}`);
    if (sheet.hometownCandidateId) out.push(`- 籍贯候选: ${encodeId(sheet.hometownCandidateId)}`);
    out.push(`- 绰号: ${encodeValue(sheet.nickname)}`);
    out.push(`- 契约称号: ${encodeValue(sheet.contractTitle)}`);
    out.push(`- 备注: ${encodeValue(sheet.note)}`);
    out.push(`- 创建时间: ${timestamp(sheet.createdAt)}`);
    out.push(`- 更新时间: ${timestamp(sheet.updatedAt)}`);
    out.push('');
  });
  return out.join('\n');
}

/* ---------------- 设定集 INI ---------------- */

function iniText(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function sheetSummary(sheet: Sheet): string {
  const note = iniText(sheet.note);
  if (note) return note;
  return [sheet.occupation, sheet.office, sheet.hometown, sheet.nickname, sheet.contractTitle].map(iniText).filter(Boolean).join('，');
}

function candidateSummary(candidate: Candidate): string {
  const note = iniText(candidate.note);
  if (note) return note;
  return candidate.structure
    .map((part) => `${iniText(part.label)}：${iniText(part.word)}`)
    .filter((part) => part !== '：')
    .join('，');
}

/** 生成 `.workshop/sheets.ini`：已设定的设定卡与候选按类型分组，全部候选另在 `[候选]` 中以注释重复列出。 */
export function serializeSheetsIni(candidates: Candidate[], sheets: Sheet[]): string {
  const groups = new Map<string, Map<string, string>>();
  const add = (group: string, name: string, summary: string): void => {
    const key = iniText(name);
    if (!key) return;
    if (!groups.has(group)) groups.set(group, new Map());
    const entries = groups.get(group);
    if (entries && !entries.has(key)) entries.set(key, summary);
  };
  sheets.forEach((sheet) => add('人物', sheet.characterName, sheetSummary(sheet)));
  candidates.forEach((candidate) => add(INI_TYPE_GROUPS[candidate.nameType], candidate.nameText, candidateSummary(candidate)));

  const out: string[] = [];
  INI_GROUP_ORDER.forEach((group) => {
    const entries = groups.get(group);
    if (!entries || entries.size === 0) return;
    out.push(`[${group}]`);
    entries.forEach((summary, name) => out.push(`${name} = ${summary}`));
    out.push('');
  });
  out.push('[候选]');
  candidates.forEach((candidate) => {
    const name = iniText(candidate.nameText);
    if (!name) return;
    out.push(`; ${name} = ${iniText(candidateSummary(candidate))}`);
  });
  out.push('');
  return out.join('\n');
}

/* ---------------- 关系 ---------------- */

export function parseRelationsMarkdown(text: string): Relation[] {
  const { sections } = splitSections(text);
  const result: Relation[] = [];
  for (const section of sections) {
    const fields = toFieldMap(parseFields(section.body));
    const id = fieldValue(fields, 'ID', 'id');
    const fromId = fieldValue(fields, '来源 ID', '来源ID', 'fromId');
    const toId = fieldValue(fields, '目标 ID', '目标ID', 'toId');
    if (!id || !fromId || !toId) continue;
    result.push({
      id,
      fromType: parseEntityType(fieldValue(fields, '来源类型')),
      fromId,
      fromName: fieldValue(fields, '来源名称') || '未命名',
      toType: parseEntityType(fieldValue(fields, '目标类型')),
      toId,
      toName: fieldValue(fields, '目标名称') || '未命名',
      relationType: fieldValue(fields, '关系类型') || '其他',
      note: fieldValue(fields, '备注'),
      createdAt: parseTimestamp(fieldValue(fields, '创建时间', 'createdAt')),
    });
  }
  return result;
}

export function serializeRelationsMarkdown(relations: Relation[]): string {
  const out: string[] = ['# 人物与地名关系', '', '> 由「创作工坊」自动维护。每条关系以 `##` 分隔，字段行请保持 `- 字段: 值` 格式。', ''];
  relations.forEach((relation) => {
    out.push(`## ${headingText(relation.fromName)} — ${headingText(relation.relationType)} → ${headingText(relation.toName)}`);
    out.push('');
    out.push(`- ID: ${encodeId(relation.id)}`);
    out.push(`- 来源类型: ${ENTITY_LABELS[relation.fromType]}`);
    out.push(`- 来源 ID: ${encodeId(relation.fromId)}`);
    out.push(`- 来源名称: ${encodeValue(relation.fromName)}`);
    out.push(`- 目标类型: ${ENTITY_LABELS[relation.toType]}`);
    out.push(`- 目标 ID: ${encodeId(relation.toId)}`);
    out.push(`- 目标名称: ${encodeValue(relation.toName)}`);
    out.push(`- 关系类型: ${encodeValue(relation.relationType)}`);
    out.push(`- 备注: ${encodeValue(relation.note)}`);
    out.push(`- 创建时间: ${timestamp(relation.createdAt)}`);
    out.push('');
  });
  return out.join('\n');
}

/* ---------------- 偏好 ---------------- */

export type Preferences = Record<string, unknown>;

const PREFERENCE_SECTIONS: Array<{ key: string; title: string }> = [
  { key: 'generator', title: '生成规则' },
  { key: 'libraryFilters', title: '候选库筛选' },
];

export function parsePreferencesMarkdown(text: string): Preferences {
  const { sections } = splitSections(text);
  const result: Preferences = {};
  for (const section of sections) {
    const target = PREFERENCE_SECTIONS.find((entry) => entry.title === cleanHeading(section.heading));
    if (!target) continue;
    const fenceStart = section.body.findIndex((line) => /^\s*```json\s*$/i.test(line));
    if (fenceStart < 0) continue;
    const codeLines: string[] = [];
    for (let index = fenceStart + 1; index < section.body.length; index += 1) {
      const line = section.body[index] ?? '';
      if (/^\s*```\s*$/.test(line)) break;
      codeLines.push(line);
    }
    try {
      const parsed: unknown = JSON.parse(codeLines.join('\n'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) result[target.key] = parsed;
    } catch {
      // 偏好 JSON 损坏时忽略该节，使用默认偏好
    }
  }
  return result;
}

export function serializePreferencesMarkdown(preferences: Preferences): string {
  const out: string[] = ['# 偏好设置', '', '> 生成规则与候选库筛选条件，内容为 JSON，便于无损读写。', ''];
  PREFERENCE_SECTIONS.forEach((section) => {
    const value = preferences[section.key] && typeof preferences[section.key] === 'object' ? preferences[section.key] : {};
    out.push(`## ${section.title}`);
    out.push('');
    out.push('```json');
    out.push(JSON.stringify(value, null, 2));
    out.push('```');
    out.push('');
  });
  return out.join('\n');
}

/* ---------------- 图谱（布局 + 快照） ---------------- */

export interface GraphSnapshotNode {
  id: string;
  kind: 'person' | 'place';
  label: string;
  race: RaceKey;
}

export interface GraphSnapshotEdge {
  fromName: string;
  relationType: string;
  toName: string;
}

const LAYOUT_HEADING = '节点布局';

export function buildGraphSnapshot(
  candidates: Candidate[],
  sheets: Sheet[],
  relations: Relation[],
): { nodes: GraphSnapshotNode[]; edges: GraphSnapshotEdge[] } {
  const nodes: GraphSnapshotNode[] = sheets.map((sheet) => ({
    id: `s:${sheet.id}`,
    kind: 'person',
    label: sheet.characterName || '未命名人物',
    race: sheet.race,
  }));
  const placeById = new Map<string, Candidate>();
  candidates.forEach((candidate) => {
    if (candidate.nameType === 'place') placeById.set(candidate.id, candidate);
  });
  // 关联自身不进入图谱快照
  const graphRelations = relations.filter((relation) => !(relation.fromType === relation.toType && relation.fromId === relation.toId));
  const placeIds = new Set<string>();
  graphRelations.forEach((relation) => {
    if (relation.fromType === 'place') placeIds.add(relation.fromId);
    if (relation.toType === 'place') placeIds.add(relation.toId);
  });
  sheets.forEach((sheet) => {
    if (sheet.hometownCandidateId && placeById.has(sheet.hometownCandidateId)) placeIds.add(sheet.hometownCandidateId);
  });
  Array.from(placeIds)
    .sort()
    .forEach((placeId) => {
      const candidate = placeById.get(placeId);
      if (!candidate) return;
      nodes.push({ id: `p:${placeId}`, kind: 'place', label: candidate.nameText, race: candidate.race });
    });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: GraphSnapshotEdge[] = [];
  graphRelations.forEach((relation) => {
    const source = relation.fromType === 'sheet' ? `s:${relation.fromId}` : `p:${relation.fromId}`;
    const target = relation.toType === 'sheet' ? `s:${relation.toId}` : `p:${relation.toId}`;
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    edges.push({ fromName: relation.fromName, relationType: relation.relationType, toName: relation.toName });
  });
  return { nodes, edges };
}

export function parseGraphMarkdown(text: string): { layout: GraphLayout; updatedAt: number } {
  const { preamble, sections } = splitSections(text);
  const fields = toFieldMap(parseFields(preamble));
  const layout: GraphLayout = {};
  const section = sections.find((entry) => cleanHeading(entry.heading) === LAYOUT_HEADING);
  if (section) {
    for (const line of section.body) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|') || /^\|\s*-+/.test(trimmed) || /^\|\s*节点/.test(trimmed)) continue;
      const cells = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
      const id = decodeValue(cells[0] ?? '');
      const x = Number(decodeValue(cells[1] ?? ''));
      const y = Number(decodeValue(cells[2] ?? ''));
      if (!id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      layout[id] = { x, y };
    }
  }
  return { layout, updatedAt: parseTimestamp(fieldValue(fields, '更新时间')) };
}

export function serializeGraphMarkdown(layout: GraphLayout, candidates: Candidate[], sheets: Sheet[], relations: Relation[]): string {
  const snapshot = buildGraphSnapshot(candidates, sheets, relations);
  const out: string[] = [
    '# 图谱',
    '',
    '> 节点与连线由设定卡和关系实时派生；本文件保存节点布局坐标与最近一次快照。',
    '',
    `- 更新时间: ${timestamp(Date.now())}`,
    `- 节点数: ${snapshot.nodes.length}`,
    `- 连线数: ${snapshot.edges.length}`,
    '',
    `## ${LAYOUT_HEADING}`,
    '',
    '| 节点 ID | X | Y |',
    '| --- | --- | --- |',
  ];
  Object.keys(layout)
    .sort()
    .forEach((id) => {
      const point = layout[id];
      if (!point) return;
      out.push(`| ${encodeId(id)} | ${point.x.toFixed(2)} | ${point.y.toFixed(2)} |`);
    });
  out.push('', '## 节点快照', '');
  if (snapshot.nodes.length === 0) {
    out.push('（暂无节点）');
  } else {
    snapshot.nodes.forEach((node) => {
      const kind = node.kind === 'person' ? '人物' : '地名';
      out.push(`- ${kind}：${node.label}（${RACE_LABELS[node.race]}）`);
    });
  }
  out.push('', '## 连线快照', '');
  if (snapshot.edges.length === 0) {
    out.push('（暂无连线）');
  } else {
    snapshot.edges.forEach((edge) => {
      out.push(`- ${edge.fromName} — ${edge.relationType} → ${edge.toName}`);
    });
  }
  out.push('');
  return out.join('\n');
}
