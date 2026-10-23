import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type RaceKey = 'human' | 'demon';
export type NameTypeKey = 'person' | 'place' | 'office' | 'nickname';
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
  createdAt: number;
  updatedAt: number;
  referenced?: boolean;
}

export interface Sheet {
  id: string;
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
  createdAt: number;
  updatedAt: number;
  relationCount: number;
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

export interface CandidateFilters {
  race: RaceKey | 'all';
  nameType: NameTypeKey | 'all';
  minChars: number;
  maxChars: number;
  status: 'all' | 'favorite' | 'referenced';
  keyword: string;
  sort: 'latest' | 'charCount' | 'nameText';
}

export interface WorkshopData {
  schemaVersion: 1;
  candidates: Candidate[];
  sheets: Sheet[];
  relations: Relation[];
  preferences: Record<string, unknown>;
}

export interface CandidateInput {
  race: RaceKey;
  nameType: NameTypeKey;
  nameText: string;
  structure: StructurePart[];
  source: 'generated' | 'manual';
  favorite?: boolean;
  note?: string;
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

export interface RelationInput {
  fromType: EntityType;
  fromId: string;
  fromName: string;
  toType: EntityType;
  toId: string;
  toName: string;
  relationType: string;
  note: string;
}

export interface CandidateReferences {
  asCharacter: boolean;
  asHometown: boolean;
  asPlace: boolean;
}

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

const EMPTY_DATA: WorkshopData = {
  schemaVersion: 1,
  candidates: [],
  sheets: [],
  relations: [],
  preferences: {},
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asRace(value: unknown): RaceKey {
  return value === 'demon' ? 'demon' : 'human';
}

function asNameType(value: unknown): NameTypeKey {
  return value === 'place' || value === 'office' || value === 'nickname' ? value : 'person';
}

function normalizeStructure(value: unknown): StructurePart[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((part): part is Record<string, unknown> => Boolean(part) && typeof part === 'object')
    .map((part) => ({ label: asString(part.label), word: asString(part.word) }))
    .filter((part) => part.label !== '' && part.word !== '');
}

function normalizeCandidate(value: unknown): Candidate | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const nameText = asString(row.nameText ?? row.name_text);
  if (!id || !nameText) return null;
  const createdAt = asNumber(row.createdAt ?? row.created_at, Date.now());
  return {
    id,
    race: asRace(row.race),
    nameType: asNameType(row.nameType ?? row.name_type),
    nameText,
    charCount: Array.from(nameText).length,
    structure: normalizeStructure(row.structure),
    source: row.source === 'manual' ? 'manual' : 'generated',
    favorite: row.favorite === true || row.favorite === 1,
    note: asString(row.note),
    createdAt,
    updatedAt: asNumber(row.updatedAt ?? row.updated_at, createdAt),
  };
}

function normalizeSheet(value: unknown): Sheet | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const characterName = asString(row.characterName ?? row.character_name);
  if (!id || !characterName) return null;
  const createdAt = asNumber(row.createdAt ?? row.created_at, Date.now());
  return {
    id,
    characterName,
    race: asRace(row.race),
    candidateId: asString(row.candidateId ?? row.candidate_id),
    occupation: asString(row.occupation),
    office: asString(row.office),
    hometown: asString(row.hometown),
    hometownCandidateId: asString(row.hometownCandidateId ?? row.hometown_candidate_id),
    nickname: asString(row.nickname),
    contractTitle: asString(row.contractTitle ?? row.contract_title),
    note: asString(row.note),
    createdAt,
    updatedAt: asNumber(row.updatedAt ?? row.updated_at, createdAt),
    relationCount: 0,
  };
}

function normalizeRelation(value: unknown): Relation | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const fromId = asString(row.fromId ?? row.from_id);
  const toId = asString(row.toId ?? row.to_id);
  if (!id || !fromId || !toId || fromId === toId) return null;
  return {
    id,
    fromType: row.fromType === 'place' || row.from_type === 'place' ? 'place' : 'sheet',
    fromId,
    fromName: asString(row.fromName ?? row.from_name),
    toType: row.toType === 'place' || row.to_type === 'place' ? 'place' : 'sheet',
    toId,
    toName: asString(row.toName ?? row.to_name),
    relationType: asString(row.relationType ?? row.relation_type, '其他'),
    note: asString(row.note),
    createdAt: asNumber(row.createdAt ?? row.created_at, Date.now()),
  };
}

function normalizeData(raw: unknown): WorkshopData {
  if (!raw || typeof raw !== 'object') return structuredClone(EMPTY_DATA);
  const value = raw as Record<string, unknown>;
  const preferences = value.preferences && typeof value.preferences === 'object' ? (value.preferences as Record<string, unknown>) : {};
  return {
    schemaVersion: 1,
    candidates: Array.isArray(value.candidates) ? value.candidates.map(normalizeCandidate).filter((item): item is Candidate => item !== null) : [],
    sheets: Array.isArray(value.sheets) ? value.sheets.map(normalizeSheet).filter((item): item is Sheet => item !== null) : [],
    relations: Array.isArray(value.relations) ? value.relations.map(normalizeRelation).filter((item): item is Relation => item !== null) : [],
    preferences,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class WorkshopStorage {
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(public readonly filePath: string) {}

  private async read(): Promise<WorkshopData> {
    if (!existsSync(this.filePath)) return structuredClone(EMPTY_DATA);
    try {
      return normalizeData(JSON.parse(await readFile(this.filePath, 'utf8')));
    } catch {
      const suffix = new Date().toISOString().replace(/[:.]/g, '-');
      await rename(this.filePath, `${this.filePath}.corrupt-${suffix}`).catch(() => undefined);
      return structuredClone(EMPTY_DATA);
    }
  }

  private async write(data: WorkshopData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.filePath);
  }

  private async mutate<T>(operation: (data: WorkshopData) => T | Promise<T>): Promise<T> {
    let resolveResult: (value: T | PromiseLike<T>) => void = () => undefined;
    let rejectResult: (reason?: unknown) => void = () => undefined;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          const data = await this.read();
          const value = await operation(data);
          await this.write(data);
          resolveResult(value);
        } catch (error) {
          rejectResult(error);
        }
      })
      .catch(() => undefined);
    return result;
  }

  public async preferencesGet(key: string): Promise<unknown> {
    const data = await this.read();
    return clone(data.preferences[key] ?? null);
  }

  public async preferencesSet(key: string, value: unknown): Promise<void> {
    await this.mutate((data) => {
      data.preferences[key] = clone(value);
    });
  }

  public async candidatesList(filters: CandidateFilters): Promise<Candidate[]> {
    const data = await this.read();
    const referenced = this.referencedIds(data);
    const keyword = filters.keyword.trim().toLocaleLowerCase('zh-CN');
    const list = data.candidates
      .filter((candidate) => filters.race === 'all' || candidate.race === filters.race)
      .filter((candidate) => filters.nameType === 'all' || candidate.nameType === filters.nameType)
      .filter((candidate) => candidate.charCount >= filters.minChars && candidate.charCount <= filters.maxChars)
      .filter((candidate) => filters.status !== 'favorite' || candidate.favorite)
      .filter((candidate) => filters.status !== 'referenced' || referenced.has(candidate.id))
      .filter((candidate) => keyword === '' || candidate.nameText.toLocaleLowerCase('zh-CN').includes(keyword))
      .map((candidate) => ({ ...candidate, referenced: referenced.has(candidate.id) }));
    if (filters.sort === 'charCount') list.sort((a, b) => a.charCount - b.charCount || b.createdAt - a.createdAt);
    else if (filters.sort === 'nameText') list.sort((a, b) => a.nameText.localeCompare(b.nameText, 'zh') || b.createdAt - a.createdAt);
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return clone(list);
  }

  public async candidateGet(id: string): Promise<Candidate | null> {
    const data = await this.read();
    return clone(data.candidates.find((candidate) => candidate.id === id) ?? null);
  }

  public async candidateCreate(input: CandidateInput): Promise<{ ok: boolean; duplicate: boolean; id: string; message?: string }> {
    if (!input.nameText.trim()) return { ok: false, duplicate: false, id: '', message: '名称不能为空' };
    return this.mutate((data) => {
      const duplicate = data.candidates.some(
        (candidate) => candidate.race === input.race && candidate.nameType === input.nameType && candidate.nameText === input.nameText.trim(),
      );
      if (duplicate) return { ok: false, duplicate: true, id: '', message: '该名称已在库中' };
      const now = Date.now();
      const id = randomUUID();
      data.candidates.unshift({
        id,
        race: input.race,
        nameType: input.nameType,
        nameText: input.nameText.trim(),
        charCount: Array.from(input.nameText.trim()).length,
        structure: normalizeStructure(input.structure),
        source: input.source === 'manual' ? 'manual' : 'generated',
        favorite: Boolean(input.favorite),
        note: asString(input.note),
        createdAt: now,
        updatedAt: now,
      });
      return { ok: true, duplicate: false, id };
    });
  }

  public async candidateUpdate(id: string, patch: { favorite?: boolean; note?: string }): Promise<{ ok: boolean; message?: string }> {
    return this.mutate((data) => {
      const candidate = data.candidates.find((item) => item.id === id);
      if (!candidate) return { ok: false, message: '未找到该名称' };
      if (typeof patch.favorite === 'boolean') candidate.favorite = patch.favorite;
      if (typeof patch.note === 'string') candidate.note = patch.note;
      candidate.updatedAt = Date.now();
      return { ok: true };
    });
  }

  public async candidateReferences(id: string): Promise<CandidateReferences> {
    const data = await this.read();
    return {
      asCharacter: data.sheets.some((sheet) => sheet.candidateId === id),
      asHometown: data.sheets.some((sheet) => sheet.hometownCandidateId === id),
      asPlace: data.relations.some(
        (relation) => (relation.fromType === 'place' && relation.fromId === id) || (relation.toType === 'place' && relation.toId === id),
      ),
    };
  }

  public async candidateDelete(id: string, force: boolean): Promise<{ ok: boolean; refs: CandidateReferences; message?: string }> {
    return this.mutate((data) => {
      const refs: CandidateReferences = {
        asCharacter: data.sheets.some((sheet) => sheet.candidateId === id),
        asHometown: data.sheets.some((sheet) => sheet.hometownCandidateId === id),
        asPlace: data.relations.some(
          (relation) => (relation.fromType === 'place' && relation.fromId === id) || (relation.toType === 'place' && relation.toId === id),
        ),
      };
      const hasRefs = refs.asCharacter || refs.asHometown || refs.asPlace;
      if (hasRefs && !force) return { ok: false, refs, message: '该名称已被设定引用' };
      if (hasRefs) {
        data.sheets.forEach((sheet) => {
          if (sheet.candidateId === id) sheet.candidateId = '';
          if (sheet.hometownCandidateId === id) sheet.hometownCandidateId = '';
        });
        data.relations = data.relations.filter(
          (relation) => !(relation.fromType === 'place' && relation.fromId === id) && !(relation.toType === 'place' && relation.toId === id),
        );
      }
      const before = data.candidates.length;
      data.candidates = data.candidates.filter((candidate) => candidate.id !== id);
      return before === data.candidates.length ? { ok: false, refs, message: '未找到该名称' } : { ok: true, refs };
    });
  }

  public async sheetsList(): Promise<Sheet[]> {
    const data = await this.read();
    const countMap = new Map<string, number>();
    data.relations.forEach((relation) => {
      if (relation.fromType === 'sheet') countMap.set(relation.fromId, (countMap.get(relation.fromId) ?? 0) + 1);
      if (relation.toType === 'sheet') countMap.set(relation.toId, (countMap.get(relation.toId) ?? 0) + 1);
    });
    return clone([...data.sheets].sort((a, b) => b.createdAt - a.createdAt).map((sheet) => ({ ...sheet, relationCount: countMap.get(sheet.id) ?? 0 })));
  }

  public async sheetSave(input: SheetInput): Promise<{ ok: boolean; id: string; message?: string }> {
    if (!input.characterName.trim()) return { ok: false, id: '', message: '人物名不能为空' };
    return this.mutate((data) => {
      const now = Date.now();
      const normalized = {
        characterName: input.characterName.trim(),
        race: asRace(input.race),
        candidateId: asString(input.candidateId),
        occupation: asString(input.occupation).trim(),
        office: asString(input.office).trim(),
        hometown: asString(input.hometown).trim(),
        hometownCandidateId: asString(input.hometownCandidateId),
        nickname: asString(input.nickname).trim(),
        contractTitle: asString(input.contractTitle).trim(),
        note: asString(input.note).trim(),
        updatedAt: now,
      };
      if (input.id) {
        const sheet = data.sheets.find((item) => item.id === input.id);
        if (!sheet) return { ok: false, id: '', message: '未找到该设定卡' };
        Object.assign(sheet, normalized);
        return { ok: true, id: sheet.id };
      }
      const id = randomUUID();
      data.sheets.unshift({ id, ...normalized, createdAt: now, relationCount: 0 });
      return { ok: true, id };
    });
  }

  public async sheetDelete(id: string): Promise<{ ok: boolean; message?: string }> {
    return this.mutate((data) => {
      const before = data.sheets.length;
      data.sheets = data.sheets.filter((sheet) => sheet.id !== id);
      data.relations = data.relations.filter(
        (relation) => !(relation.fromType === 'sheet' && relation.fromId === id) && !(relation.toType === 'sheet' && relation.toId === id),
      );
      return before === data.sheets.length ? { ok: false, message: '未找到该设定卡' } : { ok: true };
    });
  }

  public async relationsList(): Promise<Relation[]> {
    const data = await this.read();
    return clone([...data.relations].sort((a, b) => b.createdAt - a.createdAt));
  }

  public async relationAdd(input: RelationInput): Promise<{ ok: boolean; message?: string }> {
    if (!input.fromId || !input.toId || input.fromId === input.toId) return { ok: false, message: '无法建立指向自身的空关系' };
    return this.mutate((data) => {
      const duplicate = data.relations.some(
        (relation) =>
          relation.fromType === input.fromType &&
          relation.fromId === input.fromId &&
          relation.toType === input.toType &&
          relation.toId === input.toId &&
          relation.relationType === input.relationType,
      );
      if (duplicate) return { ok: false, message: '相同关系已存在' };
      data.relations.unshift({
        id: randomUUID(),
        fromType: input.fromType,
        fromId: input.fromId,
        fromName: asString(input.fromName, '未命名'),
        toType: input.toType,
        toId: input.toId,
        toName: asString(input.toName, '未命名'),
        relationType: asString(input.relationType, '其他'),
        note: asString(input.note),
        createdAt: Date.now(),
      });
      return { ok: true };
    });
  }

  public async relationRemove(id: string): Promise<{ ok: boolean; message?: string }> {
    return this.mutate((data) => {
      const before = data.relations.length;
      data.relations = data.relations.filter((relation) => relation.id !== id);
      return before === data.relations.length ? { ok: false, message: '未找到该关系' } : { ok: true };
    });
  }

  public async allData(): Promise<Omit<WorkshopData, 'preferences'>> {
    const data = await this.read();
    const sheets = await this.sheetsList();
    return clone({
      schemaVersion: 1,
      candidates: data.candidates,
      sheets,
      relations: data.relations,
    });
  }

  public async stats(): Promise<StatsData> {
    const data = await this.read();
    const group = <T extends string | number>(values: T[]): Record<string, number> => {
      const result: Record<string, number> = {};
      values.forEach((value) => {
        const key = String(value);
        result[key] = (result[key] ?? 0) + 1;
      });
      return result;
    };
    return {
      totalCandidates: data.candidates.length,
      totalFavorites: data.candidates.filter((candidate) => candidate.favorite).length,
      totalSheets: data.sheets.length,
      totalRelations: data.relations.length,
      raceDist: group(data.candidates.map((candidate) => candidate.race)),
      typeDist: group(data.candidates.map((candidate) => candidate.nameType)),
      charDist: group(data.candidates.map((candidate) => candidate.charCount)),
      relationTypeDist: group(data.relations.map((relation) => relation.relationType)),
    };
  }

  private referencedIds(data: WorkshopData): Set<string> {
    const result = new Set<string>();
    data.sheets.forEach((sheet) => {
      if (sheet.candidateId) result.add(sheet.candidateId);
      if (sheet.hometownCandidateId) result.add(sheet.hometownCandidateId);
    });
    data.relations.forEach((relation) => {
      if (relation.fromType === 'place') result.add(relation.fromId);
      if (relation.toType === 'place') result.add(relation.toId);
    });
    return result;
  }
}
