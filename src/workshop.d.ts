import type { Candidate, CandidateFilters, NameTypeKey, RaceKey, Relation, Sheet, SourceKey, StructurePart } from '@/lib/types';
import type { StatsData } from '@/lib/db';

export interface CandidateInput {
  race: RaceKey;
  nameType: NameTypeKey;
  nameText: string;
  structure: StructurePart[];
  source: SourceKey;
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

export interface WorkshopExportBundle {
  schemaVersion: 1;
  candidates: Candidate[];
  sheets: Sheet[];
  relations: Relation[];
}

export interface SaveFileResult {
  success: boolean;
  canceled?: boolean;
  filePath?: string;
  message?: string;
}

export interface WorkshopApi {
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
    all: () => Promise<WorkshopExportBundle>;
    stats: () => Promise<StatsData>;
  };
  preferences: {
    get: (key: 'generator' | 'libraryFilters') => Promise<unknown>;
    set: (key: 'generator' | 'libraryFilters', value: unknown) => Promise<void>;
  };
  files: {
    save: (input: { fileName: string; dataBase64: string }) => Promise<SaveFileResult>;
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
