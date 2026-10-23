// DB 边界适配层：唯一拆解 window.lingguang.db 响应，向业务组件返回规范化类型

import type { Candidate, CandidateFilters, NameTypeKey, RaceKey, Relation, Sheet, SourceKey } from '@/lib/types';
import { safeParseStructure } from '@/lib/types';

function nowTs(): number {
  return Date.now();
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface CandidateRow {
  id: string;
  race: RaceKey;
  name_type: NameTypeKey;
  name_text: string;
  char_count: number;
  structure: string;
  source: SourceKey;
  favorite: number;
  note: string;
  created_at: number;
  updated_at: number;
}

export interface SheetRow {
  id: string;
  character_name: string;
  race: RaceKey;
  candidate_id: string;
  occupation: string;
  office: string;
  hometown: string;
  hometown_candidate_id: string;
  nickname: string;
  contract_title: string;
  note: string;
  created_at: number;
  updated_at: number;
}

export interface RelationRow {
  id: string;
  from_type: 'sheet' | 'place';
  from_id: string;
  from_name: string;
  to_type: 'sheet' | 'place';
  to_id: string;
  to_name: string;
  relation_type: string;
  note: string;
  created_at: number;
}

function toCandidate(row: CandidateRow): Candidate {
  return {
    id: String(row.id ?? ''),
    race: row.race === 'demon' ? 'demon' : 'human',
    nameType: (row.name_type ?? 'person') as NameTypeKey,
    nameText: String(row.name_text ?? ''),
    charCount: Number(row.char_count ?? 0),
    structure: safeParseStructure(String(row.structure ?? '')),
    source: row.source === 'manual' ? 'manual' : 'generated',
    favorite: Number(row.favorite ?? 0) === 1,
    note: String(row.note ?? ''),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

function toSheet(row: SheetRow): Omit<Sheet, 'relationCount'> {
  return {
    id: String(row.id ?? ''),
    characterName: String(row.character_name ?? ''),
    race: row.race === 'demon' ? 'demon' : 'human',
    candidateId: String(row.candidate_id ?? ''),
    occupation: String(row.occupation ?? ''),
    office: String(row.office ?? ''),
    hometown: String(row.hometown ?? ''),
    hometownCandidateId: String(row.hometown_candidate_id ?? ''),
    nickname: String(row.nickname ?? ''),
    contractTitle: String(row.contract_title ?? ''),
    note: String(row.note ?? ''),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

function toRelation(row: RelationRow): Relation {
  return {
    id: String(row.id ?? ''),
    fromType: row.from_type === 'place' ? 'place' : 'sheet',
    fromId: String(row.from_id ?? ''),
    fromName: String(row.from_name ?? ''),
    toType: row.to_type === 'place' ? 'place' : 'sheet',
    toId: String(row.to_id ?? ''),
    toName: String(row.to_name ?? ''),
    relationType: String(row.relation_type ?? '其他'),
    note: String(row.note ?? ''),
    createdAt: Number(row.created_at ?? 0),
  };
}

const SQL_CANDIDATES = `SELECT id, race, name_type, name_text, char_count, structure, source, favorite, note, created_at, updated_at
FROM naming_candidates
WHERE (race = ? OR ? = 'all') AND (name_type = ? OR ? = 'all') AND char_count >= ? AND char_count <= ? AND (favorite = 1 OR ? = 0) AND (name_text LIKE ? OR ? = '')
ORDER BY created_at DESC
LIMIT ?`;

const SQL_SHEET_CHAR_REFS = `SELECT candidate_id FROM setting_sheets WHERE candidate_id != '' LIMIT ?`;
const SQL_SHEET_HOME_REFS = `SELECT hometown_candidate_id FROM setting_sheets WHERE hometown_candidate_id != '' LIMIT ?`;

export async function fetchReferencedCandidateIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const [charRes, homeRes] = await Promise.all([
      window.lingguang.db.query<{ candidate_id: string }>({ sql: SQL_SHEET_CHAR_REFS, binds: [5000] }),
      window.lingguang.db.query<{ hometown_candidate_id: string }>({ sql: SQL_SHEET_HOME_REFS, binds: [5000] }),
    ]);
    if (charRes.success) (charRes.data ?? []).forEach((r) => ids.add(String(r.candidate_id)));
    if (homeRes.success) (homeRes.data ?? []).forEach((r) => ids.add(String(r.hometown_candidate_id)));
  } catch {
    // 引用集合查询失败时按空处理，不阻断列表展示
  }
  return ids;
}

export async function fetchCandidates(filters: CandidateFilters): Promise<Candidate[]> {
  const kw = (filters.keyword ?? '').trim();
  const res = await window.lingguang.db.query<CandidateRow>({
    sql: SQL_CANDIDATES,
    binds: [
      filters.race,
      filters.race,
      filters.nameType,
      filters.nameType,
      filters.minChars,
      filters.maxChars,
      filters.status === 'favorite' ? 1 : 0,
      kw ? `%${kw}%` : '%',
      kw ? 'x' : '',
      5000,
    ],
  });
  if (!res.success) {
    throw new Error(res.message || '查询失败');
  }
  let list = (res.data ?? []).map(toCandidate);

  if (filters.status === 'referenced') {
    const refIds = await fetchReferencedCandidateIds();
    list = list.filter((c) => refIds.has(c.id));
  }

  const refIds = await fetchReferencedCandidateIds();
  list = list.map((c) => ({ ...c, referenced: refIds.has(c.id) }));

  if (filters.sort === 'charCount') {
    list.sort((a, b) => a.charCount - b.charCount || b.createdAt - a.createdAt);
  } else if (filters.sort === 'nameText') {
    list.sort((a, b) => a.nameText.localeCompare(b.nameText, 'zh') || b.createdAt - a.createdAt);
  } else {
    list.sort((a, b) => b.createdAt - a.createdAt);
  }
  return list;
}

const SQL_CANDIDATE_EXISTS = `SELECT id FROM naming_candidates WHERE race = ? AND name_type = ? AND name_text = ? LIMIT ?`;

export async function candidateExists(race: RaceKey, nameType: NameTypeKey, nameText: string): Promise<boolean> {
  const res = await window.lingguang.db.query<{ id: string }>({
    sql: SQL_CANDIDATE_EXISTS,
    binds: [race, nameType, nameText, 1],
  });
  if (!res.success) throw new Error(res.message || '查询失败');
  return (res.data ?? []).length > 0;
}

const SQL_INSERT_CANDIDATE = `INSERT INTO naming_candidates (id, race, name_type, name_text, char_count, structure, source, favorite, note, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export async function insertCandidate(input: {
  race: RaceKey;
  nameType: NameTypeKey;
  nameText: string;
  structure: { label: string; word: string }[];
  source: SourceKey;
  favorite?: boolean;
  note?: string;
}): Promise<{ ok: boolean; duplicate: boolean; id: string; message?: string }> {
  const id = newId();
  const now = nowTs();
  const dup = await candidateExists(input.race, input.nameType, input.nameText);
  if (dup) return { ok: false, duplicate: true, id: '', message: '该名称已在库中' };
  const res = await window.lingguang.db.execute({
    sql: SQL_INSERT_CANDIDATE,
    binds: [
      id,
      input.race,
      input.nameType,
      input.nameText,
      input.nameText.length,
      JSON.stringify(input.structure ?? []),
      input.source,
      input.favorite ? 1 : 0,
      input.note ?? '',
      now,
      now,
    ],
  });
  if (!res.success) {
    return { ok: false, duplicate: false, id: '', message: res.message || '保存失败，请重试' };
  }
  return { ok: true, duplicate: false, id };
}

const SQL_UPDATE_CANDIDATE = `UPDATE naming_candidates SET favorite = ?, note = ?, updated_at = ? WHERE id = ?`;

export async function updateCandidate(id: string, patch: { favorite?: boolean; note?: string }): Promise<{ ok: boolean; message?: string }> {
  const current = await getCandidateById(id);
  const favorite = patch.favorite !== undefined ? (patch.favorite ? 1 : 0) : current ? (current.favorite ? 1 : 0) : 0;
  const note = patch.note !== undefined ? patch.note : current ? current.note : '';
  const res = await window.lingguang.db.execute({
    sql: SQL_UPDATE_CANDIDATE,
    binds: [favorite, note, nowTs(), id],
  });
  if (!res.success) return { ok: false, message: res.message || '更新失败，请重试' };
  return { ok: true };
}

const SQL_CANDIDATE_BY_ID = `SELECT id, race, name_type, name_text, char_count, structure, source, favorite, note, created_at, updated_at FROM naming_candidates WHERE id = ? LIMIT ?`;

export async function getCandidateById(id: string): Promise<Candidate | null> {
  const res = await window.lingguang.db.query<CandidateRow>({ sql: SQL_CANDIDATE_BY_ID, binds: [id, 1] });
  if (!res.success) throw new Error(res.message || '查询失败');
  const row = (res.data ?? [])[0];
  return row ? toCandidate(row) : null;
}

const SQL_SHEET_REF_BY_CANDIDATE = `SELECT id FROM setting_sheets WHERE candidate_id = ? LIMIT ?`;
const SQL_SHEET_REF_BY_HOME = `SELECT id FROM setting_sheets WHERE hometown_candidate_id = ? LIMIT ?`;
const SQL_RELATION_REF_BY_PLACE = `SELECT id FROM relations WHERE (from_type = 'place' AND from_id = ?) OR (to_type = 'place' AND to_id = ?) LIMIT ?`;
const SQL_CLEAR_CANDIDATE_REF = `UPDATE setting_sheets SET candidate_id = '' WHERE candidate_id = ?`;
const SQL_CLEAR_HOME_REF = `UPDATE setting_sheets SET hometown_candidate_id = '' WHERE hometown_candidate_id = ?`;
const SQL_DELETE_RELATIONS_BY_PLACE = `DELETE FROM relations WHERE (from_type = 'place' AND from_id = ?) OR (to_type = 'place' AND to_id = ?)`;
const SQL_DELETE_CANDIDATE = `DELETE FROM naming_candidates WHERE id = ?`;

export async function deleteCandidate(id: string, force: boolean): Promise<{ ok: boolean; refs: { asCharacter: boolean; asHometown: boolean; asPlace: boolean }; message?: string }> {
  const refs = { asCharacter: false, asHometown: false, asPlace: false };
  const [charRes, homeRes, relRes] = await Promise.all([
    window.lingguang.db.query<{ id: string }>({ sql: SQL_SHEET_REF_BY_CANDIDATE, binds: [id, 1] }),
    window.lingguang.db.query<{ id: string }>({ sql: SQL_SHEET_REF_BY_HOME, binds: [id, 1] }),
    window.lingguang.db.query<{ id: string }>({ sql: SQL_RELATION_REF_BY_PLACE, binds: [id, id, 1] }),
  ]);
  if (charRes.success) refs.asCharacter = (charRes.data ?? []).length > 0;
  if (homeRes.success) refs.asHometown = (homeRes.data ?? []).length > 0;
  if (relRes.success) refs.asPlace = (relRes.data ?? []).length > 0;

  const hasRefs = refs.asCharacter || refs.asHometown || refs.asPlace;
  if (hasRefs && !force) {
    return { ok: false, refs, message: '该名称已被设定引用' };
  }
  if (hasRefs && force) {
    await window.lingguang.db.execute({ sql: SQL_CLEAR_CANDIDATE_REF, binds: [id] });
    await window.lingguang.db.execute({ sql: SQL_CLEAR_HOME_REF, binds: [id] });
    await window.lingguang.db.execute({ sql: SQL_DELETE_RELATIONS_BY_PLACE, binds: [id, id] });
  }
  const res = await window.lingguang.db.execute({ sql: SQL_DELETE_CANDIDATE, binds: [id] });
  if (!res.success) return { ok: false, refs, message: res.message || '删除失败，请重试' };
  return { ok: true, refs };
}

const SQL_SHEETS = `SELECT id, character_name, race, candidate_id, occupation, office, hometown, hometown_candidate_id, nickname, contract_title, note, created_at, updated_at
FROM setting_sheets ORDER BY created_at DESC LIMIT ?`;

const SQL_RELATIONS = `SELECT id, from_type, from_id, from_name, to_type, to_id, to_name, relation_type, note, created_at FROM relations ORDER BY created_at DESC LIMIT ?`;

export async function fetchRelations(): Promise<Relation[]> {
  const res = await window.lingguang.db.query<RelationRow>({ sql: SQL_RELATIONS, binds: [5000] });
  if (!res.success) throw new Error(res.message || '查询失败');
  return (res.data ?? []).map(toRelation);
}

export async function fetchSheets(): Promise<Sheet[]> {
  const [sheetRes, relations] = await Promise.all([
    window.lingguang.db.query<SheetRow>({ sql: SQL_SHEETS, binds: [5000] }),
    fetchRelations().catch(() => [] as Relation[]),
  ]);
  if (!sheetRes.success) throw new Error(sheetRes.message || '查询失败');
  const countMap = new Map<string, number>();
  relations.forEach((r) => {
    if (r.fromType === 'sheet') countMap.set(r.fromId, (countMap.get(r.fromId) ?? 0) + 1);
    if (r.toType === 'sheet') countMap.set(r.toId, (countMap.get(r.toId) ?? 0) + 1);
  });
  return (sheetRes.data ?? []).map((row) => ({ ...toSheet(row), relationCount: countMap.get(String(row.id)) ?? 0 }));
}

export interface SheetInput {
  id?: string;
  characterName: string;
  race: RaceKey;
  candidateId: string;
  occupation: string;
  office: string;
  hometown: string;
  hometownCandidateId: string;
  nickname: string;
  contractTitle: string;
  note: string;
}

const SQL_INSERT_SHEET = `INSERT INTO setting_sheets (id, character_name, race, candidate_id, occupation, office, hometown, hometown_candidate_id, nickname, contract_title, note, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const SQL_UPDATE_SHEET = `UPDATE setting_sheets SET character_name = ?, race = ?, candidate_id = ?, occupation = ?, office = ?, hometown = ?, hometown_candidate_id = ?, nickname = ?, contract_title = ?, note = ?, updated_at = ? WHERE id = ?`;

export async function saveSheet(input: SheetInput): Promise<{ ok: boolean; id: string; message?: string }> {
  const now = nowTs();
  if (input.id) {
    const res = await window.lingguang.db.execute({
      sql: SQL_UPDATE_SHEET,
      binds: [
        input.characterName,
        input.race,
        input.candidateId,
        input.occupation,
        input.office,
        input.hometown,
        input.hometownCandidateId,
        input.nickname,
        input.contractTitle,
        input.note,
        now,
        input.id,
      ],
    });
    if (!res.success) return { ok: false, id: '', message: res.message || '保存失败，请重试' };
    return { ok: true, id: input.id };
  }
  const id = newId();
  const res = await window.lingguang.db.execute({
    sql: SQL_INSERT_SHEET,
    binds: [
      id,
      input.characterName,
      input.race,
      input.candidateId,
      input.occupation,
      input.office,
      input.hometown,
      input.hometownCandidateId,
      input.nickname,
      input.contractTitle,
      input.note,
      now,
      now,
    ],
  });
  if (!res.success) return { ok: false, id: '', message: res.message || '保存失败，请重试' };
  return { ok: true, id };
}

const SQL_DELETE_RELATIONS_BY_SHEET = `DELETE FROM relations WHERE (from_type = 'sheet' AND from_id = ?) OR (to_type = 'sheet' AND to_id = ?)`;
const SQL_DELETE_SHEET = `DELETE FROM setting_sheets WHERE id = ?`;

export async function deleteSheet(id: string): Promise<{ ok: boolean; message?: string }> {
  const relRes = await window.lingguang.db.execute({ sql: SQL_DELETE_RELATIONS_BY_SHEET, binds: [id, id] });
  if (!relRes.success) return { ok: false, message: relRes.message || '删除失败，请重试' };
  const res = await window.lingguang.db.execute({ sql: SQL_DELETE_SHEET, binds: [id] });
  if (!res.success) return { ok: false, message: res.message || '删除失败，请重试' };
  return { ok: true };
}

export interface RelationInput {
  fromType: 'sheet' | 'place';
  fromId: string;
  fromName: string;
  toType: 'sheet' | 'place';
  toId: string;
  toName: string;
  relationType: string;
  note: string;
}

const SQL_INSERT_RELATION = `INSERT INTO relations (id, from_type, from_id, from_name, to_type, to_id, to_name, relation_type, note, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const SQL_DELETE_RELATION = `DELETE FROM relations WHERE id = ?`;

export async function addRelation(input: RelationInput): Promise<{ ok: boolean; message?: string }> {
  const res = await window.lingguang.db.execute({
    sql: SQL_INSERT_RELATION,
    binds: [
      newId(),
      input.fromType,
      input.fromId,
      input.fromName,
      input.toType,
      input.toId,
      input.toName,
      input.relationType,
      input.note,
      nowTs(),
    ],
  });
  if (!res.success) return { ok: false, message: res.message || '添加失败，请重试' };
  return { ok: true };
}

export async function removeRelation(id: string): Promise<{ ok: boolean; message?: string }> {
  const res = await window.lingguang.db.execute({ sql: SQL_DELETE_RELATION, binds: [id] });
  if (!res.success) return { ok: false, message: res.message || '删除失败，请重试' };
  return { ok: true };
}

export interface ExportBundle {
  exportedAt: string;
  candidates: Candidate[];
  sheets: Sheet[];
  relations: Relation[];
}

export async function fetchAllData(): Promise<ExportBundle> {
  const [cands, sheets, relations] = await Promise.all([
    fetchCandidates({ race: 'all', nameType: 'all', minChars: 1, maxChars: 999, status: 'all', keyword: '', sort: 'latest' }),
    fetchSheets(),
    fetchRelations(),
  ]);
  return { exportedAt: new Date().toISOString(), candidates: cands, sheets, relations };
}

const SQL_COUNT_CANDIDATES = `SELECT COUNT(*) AS cnt FROM naming_candidates LIMIT ?`;
const SQL_COUNT_FAVORITES = `SELECT COUNT(*) AS cnt FROM naming_candidates WHERE favorite = 1 LIMIT ?`;
const SQL_COUNT_SHEETS = `SELECT COUNT(*) AS cnt FROM setting_sheets LIMIT ?`;
const SQL_COUNT_RELATIONS = `SELECT COUNT(*) AS cnt FROM relations LIMIT ?`;
const SQL_GROUP_RACE = `SELECT race, COUNT(*) AS cnt FROM naming_candidates GROUP BY race LIMIT ?`;
const SQL_GROUP_TYPE = `SELECT name_type, COUNT(*) AS cnt FROM naming_candidates GROUP BY name_type LIMIT ?`;
const SQL_GROUP_CHARS = `SELECT char_count, COUNT(*) AS cnt FROM naming_candidates GROUP BY char_count LIMIT ?`;
const SQL_GROUP_RELATION_TYPE = `SELECT relation_type, COUNT(*) AS cnt FROM relations GROUP BY relation_type LIMIT ?`;

export interface StatsData {
  totalCandidates: number;
  totalFavorites: number;
  totalSheets: number;
  totalRelations: number;
  raceDist: Record<string, number>;
  typeDist: Record<string, number>;
  charDist: Record<string, number>;
  relationTypeDist: Record<string, number>;
}

export async function fetchStats(): Promise<StatsData> {
  const run = async <T,>(sql: string, binds: BindValue[]): Promise<T[]> => {
    const res = await window.lingguang.db.query<T>({ sql, binds });
    if (!res.success) throw new Error(res.message || '统计失败');
    return res.data ?? [];
  };
  const [c1, c2, c3, c4, raceRows, typeRows, charRows, relRows] = await Promise.all([
    run<{ cnt: number }>(SQL_COUNT_CANDIDATES, [1]),
    run<{ cnt: number }>(SQL_COUNT_FAVORITES, [1]),
    run<{ cnt: number }>(SQL_COUNT_SHEETS, [1]),
    run<{ cnt: number }>(SQL_COUNT_RELATIONS, [1]),
    run<{ race: string; cnt: number }>(SQL_GROUP_RACE, [10]),
    run<{ name_type: string; cnt: number }>(SQL_GROUP_TYPE, [10]),
    run<{ char_count: number; cnt: number }>(SQL_GROUP_CHARS, [50]),
    run<{ relation_type: string; cnt: number }>(SQL_GROUP_RELATION_TYPE, [20]),
  ]);
  const toMap = (rows: Array<{ [k: string]: unknown }>, key: string, val: string): Record<string, number> => {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      m[String(r[key] ?? '未知')] = Number(r[val] ?? 0);
    });
    return m;
  };
  return {
    totalCandidates: Number(c1[0]?.cnt ?? 0),
    totalFavorites: Number(c2[0]?.cnt ?? 0),
    totalSheets: Number(c3[0]?.cnt ?? 0),
    totalRelations: Number(c4[0]?.cnt ?? 0),
    raceDist: toMap(raceRows, 'race', 'cnt'),
    typeDist: toMap(typeRows, 'name_type', 'cnt'),
    charDist: toMap(charRows, 'char_count', 'cnt'),
    relationTypeDist: toMap(relRows, 'relation_type', 'cnt'),
  };
}