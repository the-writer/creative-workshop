// 命令行工具常量：默认值、取值范围与别名集中在此，业务代码不散落字面量。

import type { NameGender, NameTypeKey, RaceKey } from '@/lib/types';

/** 命令名（错误提示前缀、帮助文案使用） */
export const CLI_NAME = 'workshop';

/** 应用标识：拉起桌面应用时使用 */
export const APP_NAME = 'Creation Workshop';
export const APP_BUNDLE_ID = 'cn.com.stdout.creation-workshop';

/** 生成参数默认值 */
export const DEFAULT_RACE: RaceKey = 'human';
export const DEFAULT_TYPE: NameTypeKey = 'person';
export const DEFAULT_GENDER: NameGender = 'any';
/** 姓氏稀有倾向：0 = 按人口，1 = 极稀有 */
export const DEFAULT_WEIGHT = 0.6;
export const DEFAULT_COUNT = 10;

/** 取值范围 */
export const MIN_COUNT = 1;
export const MAX_COUNT = 100;
export const MIN_WEIGHT = 0;
export const MAX_WEIGHT = 1;

/** 权重（0–1）换算为应用内姓氏权重刻度（0–100）的倍率 */
export const WEIGHT_SCALE = 100;

/** 族群别名：中文标签与内部 key 均可直接传入 */
export const RACE_ALIASES: Record<string, RaceKey> = {
  human: 'human',
  人族: 'human',
  人类: 'human',
  elf: 'elf',
  精灵族: 'elf',
  精灵: 'elf',
  yaogui: 'yaogui',
  妖鬼: 'yaogui',
  妖鬼族: 'yaogui',
  mixed: 'mixed',
  混血: 'mixed',
};

/** 名称类型别名 */
export const TYPE_ALIASES: Record<string, NameTypeKey> = {
  person: 'person',
  人名: 'person',
  place: 'place',
  地名: 'place',
};

/** 性别别名：「混合」与「不限」同义，表示男女混合 */
export const GENDER_ALIASES: Record<string, NameGender> = {
  any: 'any',
  不限: 'any',
  混合: 'any',
  male: 'male',
  男性: 'male',
  female: 'female',
  女性: 'female',
  neutral: 'neutral',
  中性: 'neutral',
};

/** 角色库文件名：人名写入候选库，地名写入地名库 */
export const CANDIDATES_FILE = 'candidates.md';
export const PLACES_FILE = 'places.md';
