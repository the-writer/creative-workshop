import type { Candidate, CandidateFilters, NameGender, NameTypeKey, RaceKey, RarityTier, Relation, Sheet, SourceKey, StructurePart } from '@/lib/types';
import type { GraphPoint, PickDirectoryResult, ProjectOpenResult, ProjectSummary, StatsData } from '@/lib/db';

export interface CandidateInput {
  race: RaceKey;
  nameType: NameTypeKey;
  nameText: string;
  structure: StructurePart[];
  source: SourceKey;
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

export interface WorkshopApi {
  projects: {
    listRecent: () => Promise<ProjectSummary[]>;
    current: () => Promise<ProjectSummary | null>;
    open: (path: string) => Promise<ProjectOpenResult>;
    create: (input: { parentDir: string; name: string }) => Promise<ProjectOpenResult>;
    pickDirectory: (kind: 'open' | 'parent') => Promise<PickDirectoryResult>;
    removeRecent: (path: string) => Promise<{ ok: boolean; message?: string }>;
    overview: () => Promise<string>;
    openInVSCode: () => Promise<{ ok: boolean; message?: string }>;
    openInCLion: () => Promise<{ ok: boolean; message?: string }>;
    openInFinder: () => Promise<{ ok: boolean; message?: string }>;
    onChanged: (callback: (project: ProjectSummary | null) => void) => () => void;
  };
  rules: {
    open: () => Promise<void>;
    close: () => Promise<void>;
    notifyChanged: (value: unknown) => Promise<boolean>;
    onChanged: (callback: (value: unknown) => void) => () => void;
  };
  candidates: {
    list: (filters: CandidateFilters) => Promise<Candidate[]>;
    get: (id: string) => Promise<Candidate | null>;
    create: (input: CandidateInput) => Promise<{ ok: boolean; duplicate: boolean; id: string; message?: string }>;
    update: (id: string, patch: { favorite?: boolean; note?: string }) => Promise<{ ok: boolean; message?: string }>;
    references: (id: string) => Promise<{ asCharacter: boolean; asHometown: boolean; asPlace: boolean }>;
    remove: (id: string, force: boolean) => Promise<{ ok: boolean; refs: { asCharacter: boolean; asHometown: boolean; asPlace: boolean }; message?: string }>;
  };
  sheets: {
    list: () => Promise<Sheet[]>;
    save: (input: SheetInput) => Promise<{ ok: boolean; id: string; message?: string }>;
    remove: (id: string) => Promise<{ ok: boolean; message?: string }>;
  };
  relations: {
    list: () => Promise<Relation[]>;
    add: (input: Omit<Relation, 'id' | 'createdAt'>) => Promise<{ ok: boolean; message?: string }>;
    remove: (id: string) => Promise<{ ok: boolean; message?: string }>;
  };
  data: {
    stats: () => Promise<StatsData>;
  };
  graph: {
    getLayout: () => Promise<Record<string, GraphPoint>>;
    saveLayout: (positions: Record<string, GraphPoint>) => Promise<{ ok: boolean }>;
  };
  preferences: {
    get: (key: 'generator' | 'libraryFilters') => Promise<unknown>;
    set: (key: 'generator' | 'libraryFilters', value: unknown) => Promise<void>;
  };
  clipboard: {
    writeText: (text: string) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    workshop: WorkshopApi;
  }
}
