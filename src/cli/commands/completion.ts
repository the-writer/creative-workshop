// `workshop completion`：输出指定 shell 的命令补全脚本。
//
// 脚本随应用分发（`runtime/completions`），安装时由 pkg 安装脚本自动注册到对应 shell。

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { CliOptions } from '@/cli/args';
import { COMPLETION_SHELLS, type CompletionShell } from '@/cli/constants';

/** 补全脚本文件名：zsh 需要 `_workshop`（放在 fpath 中），其余按 shell 命名 */
const COMPLETION_FILES: Record<CompletionShell, string> = {
  zsh: '_workshop',
  bash: 'workshop.bash',
  fish: 'workshop.fish',
};

/** 定位随应用分发的补全脚本目录 */
function completionDir(): string | null {
  const candidates: string[] = [];
  const resourcesPath = (process as { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) candidates.push(join(resourcesPath, 'runtime', 'completions'));
  // 开发态：release/cli → ../../runtime/completions
  candidates.push(resolve(__dirname, '..', '..', 'runtime', 'completions'));
  return candidates.find((dir) => existsSync(dir)) ?? null;
}

/** 从环境变量推断当前 shell */
function detectShell(): CompletionShell {
  const name = (process.env.SHELL ?? '').split('/').pop() ?? '';
  const matched = COMPLETION_SHELLS.find((shell) => shell === name);
  return matched ?? 'zsh';
}

export function runCompletion(options: CliOptions, write: (text: string) => void, writeError: (text: string) => void): number {
  const requested = options.completionShell.trim().toLowerCase();
  const shell = (requested || detectShell()) as CompletionShell;
  if (!COMPLETION_SHELLS.includes(shell)) {
    writeError(`未知的 shell「${options.completionShell}」，可选：${COMPLETION_SHELLS.join('、')}`);
    return 1;
  }

  const dir = completionDir();
  if (!dir) {
    writeError('找不到随应用分发的补全脚本');
    return 1;
  }
  const file = join(dir, COMPLETION_FILES[shell]);
  if (!existsSync(file)) {
    writeError(`找不到补全脚本：${file}`);
    return 1;
  }
  write(readFileSync(file, 'utf8').trimEnd());
  return 0;
}
