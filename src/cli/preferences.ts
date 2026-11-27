// 生成参数的默认值来源：项目 preferences.md 中保存的「生成规则」，缺省时回落到 CLI 内置默认值。
//
// 优先级：命令行参数 > 项目偏好 > CLI 内置默认值。

import type { CliOptions } from '@/cli/args';
import { DEFAULT_COUNT, DEFAULT_GEN_RULES, DEFAULT_GENDER, DEFAULT_RACE, DEFAULT_TYPE, DEFAULT_WEIGHT, WEIGHT_SCALE } from '@/cli/constants';
import type { WorkshopStorage } from '@/electron/services/workshop-storage.cts';
import type { GenParams, GenPrefs } from '@/lib/generator';
import { normalizeGenPrefs } from '@/lib/generator';
import type { NameGender, NameTypeKey, RaceKey } from '@/lib/types';

export interface ResolvedGenOptions {
  race: RaceKey;
  type: NameTypeKey;
  params: GenParams;
}

export interface ResolvedCharacterDefaults {
  race: RaceKey;
  type: NameTypeKey;
  gender: NameGender;
}

/** 读取项目偏好（preferences.md → 生成规则）；没有偏好时返回 null */
export async function loadGenPreferences(storage: WorkshopStorage): Promise<GenPrefs | null> {
  try {
    const raw = await storage.preferencesGet('generator');
    if (!raw || typeof raw !== 'object') return null;
    return normalizeGenPrefs(raw);
  } catch {
    return null;
  }
}

/** 合并生成参数：命令行参数 > 项目偏好 > 内置默认值 */
export function resolveGenOptions(options: CliOptions, prefs: GenPrefs | null): ResolvedGenOptions {
  const base = prefs?.params;
  const params: GenParams = {
    count: options.count ?? base?.count ?? DEFAULT_COUNT,
    shortMode: base?.shortMode ?? DEFAULT_GEN_RULES.shortMode,
    personSuffix: base?.personSuffix ?? DEFAULT_GEN_RULES.personSuffix,
    minChars: base?.minChars ?? DEFAULT_GEN_RULES.minChars,
    maxChars: base?.maxChars ?? DEFAULT_GEN_RULES.maxChars,
    professions: base?.professions ?? DEFAULT_GEN_RULES.professions,
    abilities: base?.abilities ?? DEFAULT_GEN_RULES.abilities,
    gender: options.gender ?? base?.gender ?? DEFAULT_GENDER,
    surnameBias: options.weight !== undefined ? Math.round(options.weight * WEIGHT_SCALE) : (base?.surnameBias ?? Math.round(DEFAULT_WEIGHT * WEIGHT_SCALE)),
  };
  return {
    race: options.race ?? prefs?.race ?? DEFAULT_RACE,
    type: options.type ?? prefs?.types[0] ?? DEFAULT_TYPE,
    params,
  };
}

/** 合并写入角色库的默认参数：命令行参数 > 项目偏好 > 内置默认值 */
export function resolveCharacterDefaults(options: CliOptions, prefs: GenPrefs | null): ResolvedCharacterDefaults {
  return {
    race: options.race ?? prefs?.race ?? DEFAULT_RACE,
    type: options.type ?? prefs?.types[0] ?? DEFAULT_TYPE,
    gender: options.gender ?? prefs?.params.gender ?? DEFAULT_GENDER,
  };
}
