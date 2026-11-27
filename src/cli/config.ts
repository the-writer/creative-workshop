// 运行时配置：集中读取 package.json 的 `creationWorkshop` 配置段，CLI 与主进程共用同一份来源。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface CreationWorkshopConfig {
  project?: {
    dataDirName?: string;
  };
}

export interface CliConfig {
  /** 项目数据目录名 */
  dataDirName: string;
  /** 应用版本号 */
  version: string;
}

const FALLBACK: CliConfig = { dataDirName: '.workshop', version: '0.0.0' };

/**
 * 读取 CLI 需要的运行期配置。
 *
 * 打包后 `release/cli/cli.cjs` 位于 `app.asar/release/cli`，`package.json` 在 `app.asar` 根目录；
 * 开发态同理位于仓库根目录，因此统一按「上两级」定位。
 */
export function readCliConfig(): CliConfig {
  try {
    const base = typeof __dirname === 'string' ? __dirname : process.cwd();
    const raw = JSON.parse(readFileSync(resolve(base, '..', '..', 'package.json'), 'utf8')) as {
      version?: string;
      creationWorkshop?: CreationWorkshopConfig;
    };
    return {
      dataDirName: raw.creationWorkshop?.project?.dataDirName?.trim() || FALLBACK.dataDirName,
      version: raw.version?.trim() || FALLBACK.version,
    };
  } catch {
    return FALLBACK;
  }
}
