// 桌面数据边界：业务组件只依赖此层，所有持久化请求由 Electron 主进程完成。

import type { Candidate, CandidateFilters, NameGender, NameTypeKey, RaceKey, RarityTier, Relation, Sheet, SourceKey } from '@/lib/types';

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
  fromType: 'sheet' | 'place';
  fromId: string;
  fromName: string;
  toType: 'sheet' | 'place';
  toId: string;
  toName: string;
  relationType: string;
  note: string;
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

/** 项目摘要：项目目录路径与展示名 */
export interface ProjectSummary {
  path: string;
  name: string;
  lastOpenedAt: number;
}

export interface ProjectOpenResult {
  ok: boolean;
  project?: ProjectSummary;
  message?: string;
}

export interface PickDirectoryResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
}

function api() {
  if (!window.workshop) throw new Error('桌面数据服务尚未就绪，请重新打开应用');
  return window.workshop;
}

/* ---------------- 项目管理 ---------------- */

export async function listRecentProjects(): Promise<ProjectSummary[]> {
  return api().projects.listRecent();
}

export async function getCurrentProject(): Promise<ProjectSummary | null> {
  return api().projects.current();
}

export async function openProject(path: string): Promise<ProjectOpenResult> {
  return api().projects.open(path);
}

export async function createProject(input: { parentDir: string; name: string }): Promise<ProjectOpenResult> {
  return api().projects.create(input);
}

export async function pickProjectDirectory(kind: 'open' | 'parent' = 'open'): Promise<PickDirectoryResult> {
  return api().projects.pickDirectory(kind);
}

/** 从最近项目列表移除（不删除磁盘文件） */
export async function removeRecentProject(path: string): Promise<{ ok: boolean; message?: string }> {
  return api().projects.removeRecent(path);
}

/** 读取当前项目 `.workshop/overview.md` 的 Markdown 正文（文件不存在时为空） */
export async function fetchProjectOverview(): Promise<string> {
  return api().projects.overview();
}

export async function openProjectInVSCode(): Promise<{ ok: boolean; message?: string }> {
  return api().projects.openInVSCode();
}

export async function openProjectInCLion(): Promise<{ ok: boolean; message?: string }> {
  return api().projects.openInCLion();
}

export async function openProjectInFinder(): Promise<{ ok: boolean; message?: string }> {
  return api().projects.openInFinder();
}

export async function openRulesWindow(): Promise<void> {
  await api().rules.open();
}

export async function closeRulesWindow(): Promise<void> {
  await api().rules.close();
}

export async function notifyRulesChanged(value: unknown): Promise<boolean> {
  return api().rules.notifyChanged(value);
}

export function onRulesChanged(callback: (value: unknown) => void): () => void {
  return api().rules.onChanged(callback);
}

/* ---------------- 候选库 ---------------- */

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
  gender?: NameGender;
  rarity?: RarityTier;
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

/* ---------------- 设定与关系 ---------------- */

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

/* ---------------- 图谱与统计 ---------------- */

export interface GraphPoint {
  x: number;
  y: number;
}

export async function fetchGraphLayout(): Promise<Record<string, GraphPoint>> {
  return api().graph.getLayout();
}

export async function saveGraphLayout(positions: Record<string, GraphPoint>): Promise<{ ok: boolean }> {
  return api().graph.saveLayout(positions);
}

export async function fetchStats(): Promise<StatsData> {
  return api().data.stats();
}
