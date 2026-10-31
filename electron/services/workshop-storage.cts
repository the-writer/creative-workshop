// 项目数据服务：每个项目目录下的 .workshop 文件夹是一组分类 Markdown 文件。
// 读写采用「先读文件、修改、再原子写回」的串行队列，避免并发覆盖。

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  nameCharCount,
  parseCandidatesMarkdown,
  parseGraphMarkdown,
  parsePreferencesMarkdown,
  parseRelationsMarkdown,
  parseSheetsMarkdown,
  parseProjectMarkdown,
  serializeCandidatesMarkdown,
  serializeGraphMarkdown,
  serializePreferencesMarkdown,
  serializeProjectMarkdown,
  serializeRelationsMarkdown,
  serializeSheetsIni,
  serializeSheetsMarkdown,
  type Candidate,
  type CandidateFilters,
  type EntityType,
  type GraphLayout,
  type GraphPoint,
  type NameGender,
  type NameTypeKey,
  type RarityTier,
  type Preferences,
  type RaceKey,
  type Relation,
  type Sheet,
  type StructurePart,
} from './workshop-markdown.cjs';

export type { Candidate, CandidateFilters, EntityType, GraphLayout, GraphPoint, NameGender, NameTypeKey, RaceKey, RarityTier, Relation, Sheet, StructurePart };

/** .workshop 目录内的固定文件名（项目数据分类保存） */
export const PROJECT_FILES = {
  project: 'project.md',
  candidates: 'candidates.md',
  sheets: 'sheets.md',
  relations: 'relations.md',
  graph: 'graph.md',
  preferences: 'preferences.md',
  sheetsIni: 'sheets.ini',
} as const;

export interface ProjectConfig {
  /** 项目内数据目录名，默认 `.workshop` */
  dataDirName?: string;
}

export interface CandidateInput {
  race: RaceKey;
  nameType: NameTypeKey;
  nameText: string;
  structure: StructurePart[];
  source: 'generated' | 'manual';
  gender?: NameGender;
  rarity?: RarityTier;
  favorite?: boolean;
  note?: string;
}

export interface SheetInput {
  id?: string;
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

export interface OpenedProject {
  path: string;
  name: string;
  workshopPath: string;
}

const EMPTY_PREFERENCES: Preferences = {};

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asRace(value: unknown): RaceKey {
  return value === 'elf' || value === 'demon' ? 'elf' : 'human';
}

function asNameType(value: unknown): NameTypeKey {
  return value === 'place' || value === 'office' || value === 'nickname' ? value : 'person';
}

function asGender(value: unknown): NameGender | undefined {
  return value === 'any' || value === 'male' || value === 'female' || value === 'neutral' ? value : undefined;
}

function asRarity(value: unknown): RarityTier | undefined {
  return value === 'S' || value === 'SS' || value === 'SSS' || value === 'SSSR' ? value : undefined;
}

function asEntityType(value: unknown): EntityType {
  return value === 'place' ? 'place' : 'sheet';
}

function normalizeStructure(value: unknown): StructurePart[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((part): part is Record<string, unknown> => Boolean(part) && typeof part === 'object')
    .map((part) => ({ label: asString(part.label), word: asString(part.word) }))
    .filter((part) => part.label !== '' && part.word !== '');
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class WorkshopStorage {
  private writeQueue: Promise<void> = Promise.resolve();
  private projectPath: string | null = null;
  private workshopPath: string | null = null;
  private projectName = '';
  private readonly dataDirName: string;

  public constructor(config: ProjectConfig = {}) {
    this.dataDirName = config.dataDirName && config.dataDirName.trim() !== '' ? config.dataDirName : '.workshop';
  }

  /** 当前项目目录（未打开项目时为 null） */
  public get currentProjectPath(): string | null {
    return this.projectPath;
  }

  /** 当前 .workshop 目录（未打开项目时为 null） */
  public get currentWorkshopPath(): string | null {
    return this.workshopPath;
  }

  /** 打开项目：创建缺失的 .workshop 与分类文件，返回项目信息 */
  public open(projectPath: string): Promise<OpenedProject> {
    return this.enqueue(async () => {
      const resolved = resolve(projectPath);
      const workshopPath = join(resolved, this.dataDirName);
      await mkdir(workshopPath, { recursive: true });
      this.projectPath = resolved;
      this.workshopPath = workshopPath;
      await this.ensureFile(PROJECT_FILES.project, null);
      await this.ensureFile(PROJECT_FILES.candidates, serializeCandidatesMarkdown([]));
      await this.ensureFile(PROJECT_FILES.sheets, serializeSheetsMarkdown([]));
      await this.ensureFile(PROJECT_FILES.relations, serializeRelationsMarkdown([]));
      await this.ensureFile(PROJECT_FILES.preferences, serializePreferencesMarkdown(EMPTY_PREFERENCES));
      await this.ensureFile(PROJECT_FILES.graph, serializeGraphMarkdown({}, [], [], []));
      const projectText = await this.readText(PROJECT_FILES.project);
      const fallbackName = basename(resolved);
      const info = parseProjectMarkdown(projectText, fallbackName);
      if (!projectText.trim()) await this.writeText(PROJECT_FILES.project, serializeProjectMarkdown(fallbackName));
      this.projectName = info.name || fallbackName;
      await this.refreshSheetsIni();
      return { path: resolved, name: this.projectName, workshopPath };
    });
  }

  /** 关闭当前项目 */
  public close(): Promise<void> {
    return this.enqueue(async () => {
      this.projectPath = null;
      this.workshopPath = null;
      this.projectName = '';
    });
  }

  public get name(): string {
    return this.projectName;
  }

  /* ---------------- 基础读写 ---------------- */

  private ensureOpen(): { workshopPath: string } {
    if (!this.workshopPath) throw new Error('尚未打开项目，请先选择项目');
    return { workshopPath: this.workshopPath };
  }

  private async ensureFile(fileName: string, content: string | null): Promise<void> {
    const { workshopPath } = this.ensureOpen();
    const target = join(workshopPath, fileName);
    if (existsSync(target)) return;
    const text = content ?? serializeProjectMarkdown(basename(this.projectPath ?? ''));
    await this.writeText(fileName, text);
  }

  private async readText(fileName: string): Promise<string> {
    const { workshopPath } = this.ensureOpen();
    try {
      return await readFile(join(workshopPath, fileName), 'utf8');
    } catch {
      return '';
    }
  }

  private async writeText(fileName: string, text: string): Promise<void> {
    const { workshopPath } = this.ensureOpen();
    await mkdir(workshopPath, { recursive: true });
    const target = join(workshopPath, fileName);
    const tempPath = `${target}.tmp`;
    await writeFile(tempPath, text, 'utf8');
    await rename(tempPath, target);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    let resolveResult: (value: T | PromiseLike<T>) => void = () => undefined;
    let rejectResult: (reason?: unknown) => void = () => undefined;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          resolveResult(await operation());
        } catch (error) {
          rejectResult(error);
        }
      })
      .catch(() => undefined);
    return result;
  }

  private async loadCandidates(): Promise<Candidate[]> {
    return parseCandidatesMarkdown(await this.readText(PROJECT_FILES.candidates));
  }

  private async loadSheets(): Promise<Sheet[]> {
    return parseSheetsMarkdown(await this.readText(PROJECT_FILES.sheets));
  }

  private async loadRelations(): Promise<Relation[]> {
    return parseRelationsMarkdown(await this.readText(PROJECT_FILES.relations));
  }

  private async loadPreferences(): Promise<Preferences> {
    return parsePreferencesMarkdown(await this.readText(PROJECT_FILES.preferences));
  }

  private async loadLayout(): Promise<GraphLayout> {
    return parseGraphMarkdown(await this.readText(PROJECT_FILES.graph)).layout;
  }

  private async writeCandidates(candidates: Candidate[]): Promise<void> {
    await this.writeText(PROJECT_FILES.candidates, serializeCandidatesMarkdown(candidates));
  }

  private async writeSheets(sheets: Sheet[]): Promise<void> {
    await this.writeText(PROJECT_FILES.sheets, serializeSheetsMarkdown(sheets));
  }

  private async writeRelations(relations: Relation[]): Promise<void> {
    await this.writeText(PROJECT_FILES.relations, serializeRelationsMarkdown(relations));
  }

  private async writePreferences(preferences: Preferences): Promise<void> {
    await this.writeText(PROJECT_FILES.preferences, serializePreferencesMarkdown(preferences));
  }

  /** 数据变化后刷新 graph.md 中的快照，同时保留已保存的布局坐标 */
  private async refreshGraph(): Promise<void> {
    const [layout, candidates, sheets, relations] = await Promise.all([this.loadLayout(), this.loadCandidates(), this.loadSheets(), this.loadRelations()]);
    await this.writeText(PROJECT_FILES.graph, serializeGraphMarkdown(layout, candidates, sheets, relations));
  }

  /** 数据变化后重建 sheets.ini（设定卡 + 候选的分组清单） */
  private async refreshSheetsIni(): Promise<void> {
    const [candidates, sheets] = await Promise.all([this.loadCandidates(), this.loadSheets()]);
    await this.writeText(PROJECT_FILES.sheetsIni, serializeSheetsIni(candidates, sheets));
  }

  /* ---------------- 偏好 ---------------- */

  public preferencesGet(key: string): Promise<unknown> {
    return this.enqueue(async () => {
      const preferences = await this.loadPreferences();
      return clone(preferences[key] ?? null);
    });
  }

  public preferencesSet(key: string, value: unknown): Promise<void> {
    return this.enqueue(async () => {
      const preferences = await this.loadPreferences();
      preferences[key] = clone(value);
      await this.writePreferences(preferences);
    });
  }

  /* ---------------- 候选 ---------------- */

  public candidatesList(filters: CandidateFilters): Promise<Candidate[]> {
    return this.enqueue(async () => {
      const [candidates, sheets, relations] = await Promise.all([this.loadCandidates(), this.loadSheets(), this.loadRelations()]);
      const referenced = this.referencedIds(sheets, relations);
      const keyword = filters.keyword.trim().toLocaleLowerCase('zh-CN');
      const list = candidates
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
    });
  }

  public candidateGet(id: string): Promise<Candidate | null> {
    return this.enqueue(async () => {
      const candidates = await this.loadCandidates();
      return clone(candidates.find((candidate) => candidate.id === id) ?? null);
    });
  }

  public candidateCreate(input: CandidateInput): Promise<{ ok: boolean; duplicate: boolean; id: string; message?: string }> {
    return this.enqueue(async () => {
      const nameText = input.nameText.trim();
      if (!nameText) return { ok: false, duplicate: false, id: '', message: '名称不能为空' };
      const candidates = await this.loadCandidates();
      const duplicate = candidates.some(
        (candidate) => candidate.race === input.race && candidate.nameType === input.nameType && candidate.nameText === nameText,
      );
      if (duplicate) return { ok: false, duplicate: true, id: '', message: '该名称已在库中' };
      const now = Date.now();
      const id = randomUUID();
      const candidate: Candidate = {
        id,
        race: input.race,
        nameType: input.nameType,
        nameText,
        charCount: nameCharCount(nameText),
        structure: normalizeStructure(input.structure),
        source: input.source === 'manual' ? 'manual' : 'generated',
        favorite: Boolean(input.favorite),
        note: asString(input.note),
        createdAt: now,
        updatedAt: now,
      };
      const gender = asGender(input.gender);
      if (gender) candidate.gender = gender;
      const rarity = asRarity(input.rarity);
      if (rarity) candidate.rarity = rarity;
      candidates.unshift(candidate);
      await this.writeCandidates(candidates);
      await this.refreshGraph();
      await this.refreshSheetsIni();
      return { ok: true, duplicate: false, id };
    });
  }

  public candidateUpdate(id: string, patch: { favorite?: boolean; note?: string }): Promise<{ ok: boolean; message?: string }> {
    return this.enqueue(async () => {
      const candidates = await this.loadCandidates();
      const candidate = candidates.find((item) => item.id === id);
      if (!candidate) return { ok: false, message: '未找到该名称' };
      if (typeof patch.favorite === 'boolean') candidate.favorite = patch.favorite;
      if (typeof patch.note === 'string') candidate.note = patch.note;
      candidate.updatedAt = Date.now();
      await this.writeCandidates(candidates);
      await this.refreshSheetsIni();
      return { ok: true };
    });
  }

  public candidateReferences(id: string): Promise<CandidateReferences> {
    return this.enqueue(async () => {
      const [sheets, relations] = await Promise.all([this.loadSheets(), this.loadRelations()]);
      return this.collectReferences(id, sheets, relations);
    });
  }

  public candidateDelete(id: string, force: boolean): Promise<{ ok: boolean; refs: CandidateReferences; message?: string }> {
    return this.enqueue(async () => {
      const [candidates, sheets, relations] = await Promise.all([this.loadCandidates(), this.loadSheets(), this.loadRelations()]);
      const refs = this.collectReferences(id, sheets, relations);
      const hasRefs = refs.asCharacter || refs.asHometown || refs.asPlace;
      if (hasRefs && !force) return { ok: false, refs, message: '该名称已被设定引用' };
      if (hasRefs) {
        sheets.forEach((sheet) => {
          if (sheet.candidateId === id) sheet.candidateId = '';
          if (sheet.hometownCandidateId === id) sheet.hometownCandidateId = '';
        });
        const nextRelations = relations.filter(
          (relation) => !(relation.fromType === 'place' && relation.fromId === id) && !(relation.toType === 'place' && relation.toId === id),
        );
        await this.writeSheets(sheets);
        await this.writeRelations(nextRelations);
      }
      const before = candidates.length;
      const remaining = candidates.filter((candidate) => candidate.id !== id);
      if (before === remaining.length) return { ok: false, refs, message: '未找到该名称' };
      await this.writeCandidates(remaining);
      await this.refreshGraph();
      await this.refreshSheetsIni();
      return { ok: true, refs };
    });
  }

  /* ---------------- 设定卡 ---------------- */

  public sheetsList(): Promise<Sheet[]> {
    return this.enqueue(async () => {
      const [sheets, relations] = await Promise.all([this.loadSheets(), this.loadRelations()]);
      const countMap = new Map<string, number>();
      relations.forEach((relation) => {
        const sheetIds = new Set<string>();
        if (relation.fromType === 'sheet') sheetIds.add(relation.fromId);
        if (relation.toType === 'sheet') sheetIds.add(relation.toId);
        sheetIds.forEach((id) => countMap.set(id, (countMap.get(id) ?? 0) + 1));
      });
      return clone([...sheets].sort((a, b) => b.createdAt - a.createdAt).map((sheet) => ({ ...sheet, relationCount: countMap.get(sheet.id) ?? 0 })));
    });
  }

  public sheetSave(input: SheetInput): Promise<{ ok: boolean; id: string; message?: string }> {
    return this.enqueue(async () => {
      if (!input.characterName.trim()) return { ok: false, id: '', message: '人物名不能为空' };
      const sheets = await this.loadSheets();
      const now = Date.now();
      const gender = asGender(input.gender);
      const normalized = {
        characterName: input.characterName.trim(),
        race: asRace(input.race),
        gender,
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
        const sheet = sheets.find((item) => item.id === input.id);
        if (!sheet) return { ok: false, id: '', message: '未找到该设定卡' };
        Object.assign(sheet, normalized);
        await this.writeSheets(sheets);
        await this.refreshGraph();
        await this.refreshSheetsIni();
        return { ok: true, id: sheet.id };
      }
      const id = randomUUID();
      sheets.unshift({ id, ...normalized, createdAt: now });
      await this.writeSheets(sheets);
      await this.refreshGraph();
      await this.refreshSheetsIni();
      return { ok: true, id };
    });
  }

  public sheetDelete(id: string): Promise<{ ok: boolean; message?: string }> {
    return this.enqueue(async () => {
      const [sheets, relations] = await Promise.all([this.loadSheets(), this.loadRelations()]);
      const before = sheets.length;
      const remaining = sheets.filter((sheet) => sheet.id !== id);
      if (before === remaining.length) return { ok: false, message: '未找到该设定卡' };
      const nextRelations = relations.filter(
        (relation) => !(relation.fromType === 'sheet' && relation.fromId === id) && !(relation.toType === 'sheet' && relation.toId === id),
      );
      await this.writeSheets(remaining);
      await this.writeRelations(nextRelations);
      await this.refreshGraph();
      await this.refreshSheetsIni();
      return { ok: true };
    });
  }

  /* ---------------- 关系 ---------------- */

  public relationsList(): Promise<Relation[]> {
    return this.enqueue(async () => {
      const relations = await this.loadRelations();
      return clone([...relations].sort((a, b) => b.createdAt - a.createdAt));
    });
  }

  public relationAdd(input: RelationInput): Promise<{ ok: boolean; message?: string }> {
    return this.enqueue(async () => {
      if (!input.fromId || !input.toId) return { ok: false, message: '关系的来源与目标不能为空' };
      const relations = await this.loadRelations();
      const duplicate = relations.some(
        (relation) =>
          relation.fromType === input.fromType &&
          relation.fromId === input.fromId &&
          relation.toType === input.toType &&
          relation.toId === input.toId &&
          relation.relationType === input.relationType,
      );
      if (duplicate) return { ok: false, message: '相同关系已存在' };
      relations.unshift({
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
      await this.writeRelations(relations);
      await this.refreshGraph();
      return { ok: true };
    });
  }

  public relationRemove(id: string): Promise<{ ok: boolean; message?: string }> {
    return this.enqueue(async () => {
      const relations = await this.loadRelations();
      const before = relations.length;
      const remaining = relations.filter((relation) => relation.id !== id);
      if (before === remaining.length) return { ok: false, message: '未找到该关系' };
      await this.writeRelations(remaining);
      await this.refreshGraph();
      return { ok: true };
    });
  }

  /* ---------------- 图谱与统计 ---------------- */

  public graphLayoutGet(): Promise<GraphLayout> {
    return this.enqueue(async () => clone(await this.loadLayout()));
  }

  public graphLayoutSave(positions: Record<string, GraphPoint>): Promise<{ ok: boolean }> {
    return this.enqueue(async () => {
      const [candidates, sheets, relations] = await Promise.all([this.loadCandidates(), this.loadSheets(), this.loadRelations()]);
      const layout: GraphLayout = {};
      Object.entries(positions ?? {}).forEach(([id, point]) => {
        if (!id || !point) return;
        layout[id] = { x: asNumber(point.x), y: asNumber(point.y) };
      });
      await this.writeText(PROJECT_FILES.graph, serializeGraphMarkdown(layout, candidates, sheets, relations));
      return { ok: true };
    });
  }

  public stats(): Promise<StatsData> {
    return this.enqueue(async () => {
      const [candidates, sheets, relations] = await Promise.all([this.loadCandidates(), this.loadSheets(), this.loadRelations()]);
      const group = <T extends string | number>(values: T[]): Record<string, number> => {
        const result: Record<string, number> = {};
        values.forEach((value) => {
          const key = String(value);
          result[key] = (result[key] ?? 0) + 1;
        });
        return result;
      };
      return {
        totalCandidates: candidates.length,
        totalFavorites: candidates.filter((candidate) => candidate.favorite).length,
        totalSheets: sheets.length,
        totalRelations: relations.length,
        raceDist: group(candidates.map((candidate) => candidate.race)),
        typeDist: group(candidates.map((candidate) => candidate.nameType)),
        charDist: group(candidates.map((candidate) => candidate.charCount)),
        relationTypeDist: group(relations.map((relation) => relation.relationType)),
      };
    });
  }

  /* ---------------- 旧数据迁移 ---------------- */

  /** 将旧版单个 JSON 数据导入当前项目（写入分类 Markdown 文件） */
  public importLegacyData(raw: unknown): Promise<{ candidates: number; sheets: number; relations: number }> {
    return this.enqueue(async () => {
      const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const now = Date.now();
      const candidates: Candidate[] = Array.isArray(source.candidates)
        ? source.candidates
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .map((row) => {
              const nameText = asString(row.nameText ?? row.name_text);
              if (!nameText) return null;
              const candidate: Candidate = {
                id: asString(row.id) || randomUUID(),
                race: asRace(row.race),
                nameType: asNameType(row.nameType ?? row.name_type),
                nameText,
                charCount: nameCharCount(nameText),
                structure: normalizeStructure(row.structure),
                source: row.source === 'manual' ? 'manual' : 'generated',
                favorite: row.favorite === true || row.favorite === 1,
                note: asString(row.note),
                createdAt: asNumber(row.createdAt ?? row.created_at, now),
                updatedAt: asNumber(row.updatedAt ?? row.updated_at, now),
              };
              const gender = asGender(row.gender);
              if (gender) candidate.gender = gender;
              return candidate;
            })
            .filter((candidate): candidate is Candidate => candidate !== null)
        : [];
      const sheets: Sheet[] = Array.isArray(source.sheets)
        ? source.sheets
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .map((row) => {
              const characterName = asString(row.characterName ?? row.character_name);
              if (!characterName) return null;
              const gender = asGender(row.gender);
              return {
                id: asString(row.id) || randomUUID(),
                characterName,
                race: asRace(row.race),
                ...(gender ? { gender } : {}),
                candidateId: asString(row.candidateId ?? row.candidate_id),
                occupation: asString(row.occupation),
                office: asString(row.office),
                hometown: asString(row.hometown),
                hometownCandidateId: asString(row.hometownCandidateId ?? row.hometown_candidate_id),
                nickname: asString(row.nickname),
                contractTitle: asString(row.contractTitle ?? row.contract_title),
                note: asString(row.note),
                createdAt: asNumber(row.createdAt ?? row.created_at, now),
                updatedAt: asNumber(row.updatedAt ?? row.updated_at, now),
              };
            })
            .filter((sheet): sheet is Sheet => sheet !== null)
        : [];
      const relations: Relation[] = Array.isArray(source.relations)
        ? source.relations
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .map((row) => {
              const fromId = asString(row.fromId ?? row.from_id);
              const toId = asString(row.toId ?? row.to_id);
              if (!fromId || !toId) return null;
              return {
                id: asString(row.id) || randomUUID(),
                fromType: asEntityType(row.fromType ?? row.from_type),
                fromId,
                fromName: asString(row.fromName ?? row.from_name),
                toType: asEntityType(row.toType ?? row.to_type),
                toId,
                toName: asString(row.toName ?? row.to_name),
                relationType: asString(row.relationType ?? row.relation_type, '其他'),
                note: asString(row.note),
                createdAt: asNumber(row.createdAt ?? row.created_at, now),
              };
            })
            .filter((relation): relation is Relation => relation !== null)
        : [];
      const preferences: Preferences =
        source.preferences && typeof source.preferences === 'object' && !Array.isArray(source.preferences)
          ? clone(source.preferences as Record<string, unknown>)
          : {};
      await this.writeCandidates(candidates);
      await this.writeSheets(sheets);
      await this.writeRelations(relations);
      await this.writePreferences(preferences);
      await this.writeText(PROJECT_FILES.graph, serializeGraphMarkdown({}, candidates, sheets, relations));
      await this.refreshSheetsIni();
      return { candidates: candidates.length, sheets: sheets.length, relations: relations.length };
    });
  }

  /* ---------------- 内部工具 ---------------- */

  private collectReferences(id: string, sheets: Sheet[], relations: Relation[]): CandidateReferences {
    return {
      asCharacter: sheets.some((sheet) => sheet.candidateId === id),
      asHometown: sheets.some((sheet) => sheet.hometownCandidateId === id),
      asPlace: relations.some((relation) => (relation.fromType === 'place' && relation.fromId === id) || (relation.toType === 'place' && relation.toId === id)),
    };
  }

  private referencedIds(sheets: Sheet[], relations: Relation[]): Set<string> {
    const result = new Set<string>();
    sheets.forEach((sheet) => {
      if (sheet.candidateId) result.add(sheet.candidateId);
      if (sheet.hometownCandidateId) result.add(sheet.hometownCandidateId);
    });
    relations.forEach((relation) => {
      if (relation.fromType === 'place') result.add(relation.fromId);
      if (relation.toType === 'place') result.add(relation.toId);
    });
    return result;
  }
}
