// 命令行工具入口：解析参数 → 调用命令 → 返回退出码。
//
// 桌面应用以 `--cli` 参数进入本入口（见 `src/electron/main.cts`），
// 开发态也可直接用 node 运行构建产物 `release/cli/cli.cjs`。

import { parseArgs } from '@/cli/args';
import { runAdd } from '@/cli/commands/add';
import { runGenerate } from '@/cli/commands/generate';
import { runList } from '@/cli/commands/list';
import { runOpen } from '@/cli/commands/open';
import { CLI_NAME } from '@/cli/constants';
import { readCliConfig } from '@/cli/config';
import { createPalette, writeErr, writeOut } from '@/cli/format';
import { helpText } from '@/cli/help';

export function runCli(argv: string[]): number {
  const options = parseArgs(argv);
  const palette = createPalette(options.color);
  const write = (text: string): void => writeOut(text);
  const writeError = (text: string): void => writeErr(text, palette, CLI_NAME);

  if (options.error) {
    writeError(options.error);
    writeError(`使用 ${CLI_NAME} --help 查看用法`);
    return 1;
  }

  const config = readCliConfig();

  if (options.version) {
    write(`${CLI_NAME} ${config.version}`);
    return 0;
  }

  if (options.help || options.command === 'help') {
    write(helpText(options.helpTopic));
    return 0;
  }

  switch (options.command) {
    case 'gen':
      return runGenerate(options, palette, write);
    case 'list':
      return runList(options, palette, config.dataDirName, write, writeError);
    case 'add':
      return runAdd(options, config.dataDirName, write, writeError);
    case 'open':
      return runOpen(write, writeError);
    default:
      writeError(`未知命令：${options.command}`);
      return 1;
  }
}

// 直接以 node 运行构建产物时自动执行；被桌面应用 require 时只导出函数，由主进程决定退出码。
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  process.exitCode = runCli(process.argv.slice(2));
}
