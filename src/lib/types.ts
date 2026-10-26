// 规范业务对象与枚举定义（内部 key 与中文展示 label 分离）

export type RaceKey = 'human' | 'elf';
export type NameTypeKey = 'person' | 'place' | 'office' | 'nickname';
export type NameGender = 'any' | 'male' | 'female' | 'neutral';
export type SourceKey = 'generated' | 'manual';
export type EntityType = 'sheet' | 'place';
export type SortKey = 'latest' | 'charCount' | 'nameText';

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
  source: SourceKey;
  favorite: boolean;
  note: string;
  createdAt: number;
  updatedAt: number;
  referenced?: boolean;
  combo?: boolean; // 多选类型生成的组合设定句
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

export type StatusFilterKey = 'all' | 'favorite' | 'referenced';

export interface CandidateFilters {
  race: RaceKey | 'all';
  nameType: NameTypeKey | 'all';
  minChars: number;
  maxChars: number;
  status: StatusFilterKey;
  keyword: string;
  sort: SortKey;
}

export const RACE_LABELS: Record<RaceKey, string> = { human: '人族', elf: '精灵族' };
export const RACE_KEYS: RaceKey[] = ['human', 'elf'];

// 旧版本曾使用 demon 作为妖族内部 key，读取旧偏好 / 旧数据时统一迁移为 elf。
export function normalizeRaceKey(raw: unknown): RaceKey {
  return raw === 'elf' || raw === 'demon' ? 'elf' : 'human';
}

export function normalizeRaceFilter(raw: unknown): RaceKey | 'all' {
  if (raw === 'elf' || raw === 'demon') return 'elf';
  return raw === 'human' ? 'human' : 'all';
}

export const GENDER_LABELS: Record<NameGender, string> = {
  any: '不限',
  male: '男性',
  female: '女性',
  neutral: '中性',
};
export const GENDER_KEYS: NameGender[] = ['any', 'male', 'female', 'neutral'];

export const TYPE_LABELS: Record<NameTypeKey, string> = {
  person: '人名',
  place: '地名',
  office: '官职',
  nickname: '绰号',
};
export const TYPE_KEYS: NameTypeKey[] = ['person', 'place', 'office', 'nickname'];

export const RELATION_TYPES = ['师徒', '父子', '同僚', '敌对', '隶属', '契约', '其他'] as const;

export const DEFAULT_FILTERS: CandidateFilters = {
  race: 'all',
  nameType: 'all',
  minChars: 1,
  maxChars: 99,
  status: 'all',
  keyword: '',
  sort: 'latest',
};

// 候选库字数筛选的合理上限（组合设定句等长文本候选也要能显示）
export const FILTER_MAX_CHARS = 99;

export function raceLabel(race: RaceKey): string {
  return RACE_LABELS[race] ?? '';
}

export function typeLabel(type: NameTypeKey): string {
  return TYPE_LABELS[type] ?? '';
}

// 候选 → 设定卡字段映射：把候选库中除名字外的设定项（职业/官职/绰号/契约/居地/能力等）提取出来，
// 供“加入设定 / 新建设定”预填使用；能力等设定卡没有独立字段的内容合并进备注。
export interface CandidateSheetFields {
  occupation: string;
  office: string;
  hometown: string;
  nickname: string;
  contractTitle: string;
  note: string;
}

export function candidateToSheetFields(c: Candidate): CandidateSheetFields {
  const parts = Array.isArray(c.structure) ? c.structure : [];
  const pick = (...labels: string[]): string => parts.find((p) => labels.includes(p.label ?? ''))?.word ?? '';
  const extras: string[] = [];
  const surname = parts.find((part) => part.label.startsWith('姓氏') || part.label.startsWith('稀有姓氏'))?.word ?? '';
  if (surname) extras.push(`姓氏：${surname}`);
  const ability = pick('特殊能力');
  if (ability) extras.push(`特殊能力：${ability}`);
  const blood = pick('血统称号');
  if (blood) extras.push(`血统称号：${blood}`);
  const title = pick('封号');
  if (title) extras.push(`封号：${title}`);
  const baseNote = typeof c.note === 'string' ? c.note : '';
  const extraText = extras.join('\n');
  const note = extraText ? (baseNote ? `${baseNote}\n\n${extraText}` : extraText) : baseNote;
  return {
    occupation: pick('营生', '职业'),
    office: pick('官职'),
    hometown: pick('居地', '属地'),
    nickname: pick('绰号'),
    contractTitle: pick('契约称号', '契约'),
    note,
  };
}

export function safeParseStructure(raw: string): StructurePart[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((p) => p && typeof p === 'object')
        .map((p) => ({ label: String(p.label ?? ''), word: String(p.word ?? '') }))
        .filter((p) => p.label && p.word);
    }
    return [];
  } catch {
    return [];
  }
}
