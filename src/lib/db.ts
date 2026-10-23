// 桌面数据边界：业务组件只依赖此层，所有持久化请求由 Electron 主进程完成。

import type { Candidate, CandidateFilters, NameTypeKey, RaceKey, Relation, Sheet, SourceKey } from '@/lib/types';

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
  fromType: 'sheet' | 'place';
  fromId: string;
  fromName: string;
  toType: 'sheet' | 'place';
  toId: string;
  toName: string;
  relationType: string;
  note: string;
}

export interface ExportBundle {
  exportedAt: string;
  candidates: Candidate[];
  sheets: Sheet[];
  relations: Relation[];
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

function api() {
  if (!window.workshop) throw new Error('桌面数据服务尚未就绪，请重新打开应用');
  return window.workshop;
}

export async function fetchCandidates(filters: CandidateFilters): Promise<Candidate[]> {
  return api().candidates.list(filters);
}

export async function candidateExists(race: RaceKey, nameType: NameTypeKey, nameText: string): Promise<boolean> {
  const list = await fetchCandidates({ race, nameType, minChars: 1, maxChars: 999, status: 'all', keyword: nameText, sort: 'latest' });
  return list.some((candidate) => candidate.nameText === nameText);
}

export async function insertCandidate(input: {
  race: RaceKey;
  nameType: NameTypeKey;
  nameText: string;
  structure: { label: string; word: string }[];
  source: SourceKey;
  favorite?: boolean;
  note?: string;
}): Promise<{ ok: boolean; duplicate: boolean; id: string; message?: string }> {
  return api().candidates.create(input);
}

export async function updateCandidate(id: string, patch: { favorite?: boolean; note?: string }): Promise<{ ok: boolean; message?: string }> {
  return api().candidates.update(id, patch);
}

export async function getCandidateById(id: string): Promise<Candidate | null> {
  return api().candidates.get(id);
}

export async function getCandidateReferences(id: string): Promise<{ asCharacter: boolean; asHometown: boolean; asPlace: boolean }> {
  return api().candidates.references(id);
}

export async function deleteCandidate(
  id: string,
  force: boolean,
): Promise<{ ok: boolean; refs: { asCharacter: boolean; asHometown: boolean; asPlace: boolean }; message?: string }> {
  return api().candidates.remove(id, force);
}

export async function fetchRelations(): Promise<Relation[]> {
  return api().relations.list();
}

export async function fetchSheets(): Promise<Sheet[]> {
  return api().sheets.list();
}

export async function saveSheet(input: SheetInput): Promise<{ ok: boolean; id: string; message?: string }> {
  return api().sheets.save(input);
}

export async function deleteSheet(id: string): Promise<{ ok: boolean; message?: string }> {
  return api().sheets.remove(id);
}

export async function addRelation(input: RelationInput): Promise<{ ok: boolean; message?: string }> {
  return api().relations.add(input);
}

export async function removeRelation(id: string): Promise<{ ok: boolean; message?: string }> {
  return api().relations.remove(id);
}

export async function fetchAllData(): Promise<ExportBundle> {
  const bundle = await api().data.all();
  return { ...bundle, exportedAt: new Date().toISOString() };
}

export async function fetchStats(): Promise<StatsData> {
  return api().data.stats();
}
