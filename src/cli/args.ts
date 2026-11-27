// 命令行参数解析：把 argv 解析成结构化选项，参数错误只记录不抛异常。

import {
  DEFAULT_LIST_TARGET,
  GENDER_ALIASES,
  LIST_TARGET_ALIASES,
  LIST_TARGETS,
  MAX_COUNT,
  MAX_WEIGHT,
  MIN_COUNT,
  MIN_WEIGHT,
  RACE_ALIASES,
  TYPE_ALIASES,
} from '@/cli/constants';
import type { ListTarget } from '@/cli/constants';
import type { NameGender, NameTypeKey, RaceKey } from '@/lib/types';

export type CliCommand = 'gen' | 'list' | 'add' | 'open' | 'help' | 'completion';
export type ColorMode = 'auto' | 'always' | 'never';

export interface CliOptions {
  /** 子命令；未给出子命令时为空字符串（此时直接输出用法） */
  command: CliCommand | '';
  /** `help <命令>` 的主题 */
  helpTopic: string;
  /** `list <类别>` 的数据类别 */
  listTarget: ListTarget;
  /** 数据类别是否由命令行显式指定 */
  listTargetProvided: boolean;
  /** `add <ID>` 的生成结果 ID */
  addId: string;
  /** `completion <shell>` 的 shell */
  completionShell: string;
  /** 族群；未指定时为 undefined（由项目偏好或默认值决定） */
  race?: RaceKey;
  /** 名称类型；未指定时为 undefined（由项目偏好或默认值决定） */
  type?: NameTypeKey;
  /** 性别；未指定时为 undefined（由项目偏好或默认值决定） */
  gender?: NameGender;
  /** 姓氏稀有倾向（0–1）；未指定时为 undefined */
  weight?: number;
  /** 生成数量；未指定时为 undefined */
  count?: number;
  name: string;
  note: string;
  favorite: boolean;
  /** 项目目录，默认为当前工作目录 */
  dir: string;
  color: ColorMode;
  help: boolean;
  version: boolean;
  /** 参数错误信息；非空时直接报错退出 */
  error: string;
}

const COMMAND_ALIASES: Record<string, CliCommand> = {
  gen: 'gen',
  generate: 'gen',
  list: 'list',
  add: 'add',
  open: 'open',
  help: 'help',
  completion: 'completion',
};

export function defaultOptions(): CliOptions {
  return {
    command: '',
    helpTopic: '',
    listTarget: DEFAULT_LIST_TARGET,
    listTargetProvided: false,
    addId: '',
    completionShell: '',
    name: '',
    note: '',
    favorite: false,
    dir: '',
    color: 'auto',
    help: false,
    version: false,
    error: '',
  };
}

/** 归一化参数值：拉丁字母转小写，中文原样保留 */
function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function lookup<T>(table: Record<string, T>, value: string): T | undefined {
  const key = normalizeKey(value);
  if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
  const lowered = Object.keys(table).find((item) => item.toLowerCase() === key);
  return lowered ? table[lowered] : undefined;
}

function parseNumber(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** 解析 list 的数据类别 */
function lookupListTarget(value: string): ListTarget | undefined {
  return lookup(LIST_TARGET_ALIASES, value);
}

/**
 * 解析命令行参数。
 *
 * 支持 `--flag value` 与 `--flag=value` 两种写法；命令可写成子命令（`gen` / `list` / `add` / `open`），
 * 也可写成等价开关（`--list` / `--add`）。未给出子命令时 `command` 为空字符串。
 */
export function parseArgs(argv: string[]): CliOptions {
  const options = defaultOptions();
  let index = 0;

  const takeValue = (inline: string | undefined, flag: string): string | undefined => {
    if (inline !== undefined) return inline;
    const next = argv[index];
    if (next === undefined) {
      options.error = `${flag} 需要一个取值`;
      return undefined;
    }
    index += 1;
    return next;
  };

  while (index < argv.length) {
    const arg = argv[index];
    index += 1;
    if (arg === '--') continue;

    if (arg.startsWith('--')) {
      const separator = arg.indexOf('=');
      const flag = separator >= 0 ? arg.slice(0, separator) : arg;
      const inline = separator >= 0 ? arg.slice(separator + 1) : undefined;
      switch (flag) {
        case '--list':
          options.command = 'list';
          if (inline !== undefined) {
            const target = lookupListTarget(inline);
            if (!target) {
              options.error = `未知数据类别「${inline}」，可选：${LIST_TARGETS.join('、')}`;
              break;
            }
            options.listTarget = target;
            options.listTargetProvided = true;
          }
          break;
        case '--add':
          options.command = 'add';
          break;
        case '--help':
          options.help = true;
          break;
        case '--version':
          options.version = true;
          break;
        case '--color':
          options.color = 'always';
          break;
        case '--no-color':
          options.color = 'never';
          break;
        case '--favorite':
          options.favorite = true;
          break;
        case '--race':
        case '--族群': {
          const value = takeValue(inline, flag);
          if (value === undefined) break;
          const race = lookup(RACE_ALIASES, value);
          if (!race) {
            options.error = `未知族群「${value}」，可选：人族、精灵族、妖鬼、混血`;
            break;
          }
          options.race = race;
          break;
        }
        case '--type':
        case '--类型': {
          const value = takeValue(inline, flag);
          if (value === undefined) break;
          const type = lookup(TYPE_ALIASES, value);
          if (!type) {
            options.error = `未知类型「${value}」，可选：人名、地名`;
            break;
          }
          options.type = type;
          break;
        }
        case '--gender':
        case '--性别': {
          const value = takeValue(inline, flag);
          if (value === undefined) break;
          const gender = lookup(GENDER_ALIASES, value);
          if (!gender) {
            options.error = `未知性别「${value}」，可选：不限（混合）、男性、女性、中性`;
            break;
          }
          options.gender = gender;
          break;
        }
        case '--weight':
        case '--权重': {
          const value = takeValue(inline, flag);
          if (value === undefined) break;
          const weight = parseNumber(value);
          if (weight === undefined || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
            options.error = `权重需在 ${MIN_WEIGHT} 到 ${MAX_WEIGHT} 之间，收到「${value}」`;
            break;
          }
          options.weight = weight;
          break;
        }
        case '--count':
        case '--数量': {
          const value = takeValue(inline, flag);
          if (value === undefined) break;
          const count = parseNumber(value);
          if (count === undefined || !Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
            options.error = `数量需为 ${MIN_COUNT} 到 ${MAX_COUNT} 之间的整数，收到「${value}」`;
            break;
          }
          options.count = count;
          break;
        }
        case '--name':
        case '--名称': {
          const value = takeValue(inline, flag);
          if (value === undefined) break;
          options.name = value;
          break;
        }
        case '--note':
        case '--备注': {
          const value = takeValue(inline, flag);
          if (value === undefined) break;
          options.note = value;
          break;
        }
        case '--dir':
        case '--目录': {
          const value = takeValue(inline, flag);
          if (value === undefined) break;
          options.dir = value;
          break;
        }
        default:
          options.error = `未知选项：${flag}`;
          break;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      if (arg === '-h') {
        options.help = true;
        continue;
      }
      options.error = `未知选项：${arg}`;
      continue;
    }

    // 位置参数：第一个是子命令，之后按子命令接收
    if (!options.command) {
      const command = COMMAND_ALIASES[normalizeKey(arg)];
      if (!command) {
        options.error = `未知命令：${arg}`;
        continue;
      }
      options.command = command;
      continue;
    }

    switch (options.command) {
      case 'help':
        if (!options.helpTopic) options.helpTopic = arg;
        else options.error = `未知参数：${arg}`;
        break;
      case 'list': {
        const target = lookupListTarget(arg);
        if (!target) {
          options.error = `未知数据类别「${arg}」，可选：${LIST_TARGETS.join('、')}`;
          break;
        }
        options.listTarget = target;
        options.listTargetProvided = true;
        break;
      }
      case 'add':
        if (!options.addId) options.addId = arg;
        else options.error = `未知参数：${arg}`;
        break;
      case 'completion':
        if (!options.completionShell) options.completionShell = arg;
        else options.error = `未知参数：${arg}`;
        break;
      default:
        options.error = `未知参数：${arg}`;
        break;
    }
  }

  return options;
}
