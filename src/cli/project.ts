// 项目数据访问：命令行工具统一调用桌面应用的数据服务（WorkshopStorage）读写 `.workshop`，
// 不在脚本里自行解析 Markdown 文件，保证两端的数据格式与读写规则完全一致。

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CliOptions } from '@/cli/args';
import { WorkshopStorage } from '@/electron/services/workshop-storage.cts';

export interface ProjectContext {
  /** 项目目录 */
  projectDir: string;
  /** 项目内的 `.workshop` 数据目录 */
  workshopDir: string;
  /** 数据服务：所有读写都经由它完成 */
  storage: WorkshopStorage;
}

/** 解析项目目录（默认为当前工作目录） */
export function resolveProjectDir(options: CliOptions): string {
  return resolve(options.dir.trim() === '' ? process.cwd() : options.dir);
}

/**
 * 关联项目数据目录。
 *
 * 只定位 `.workshop` 的读写位置，不创建目录、不初始化文件；缺文件时读取结果为空。
 */
export function attachProject(options: CliOptions, dataDirName: string): ProjectContext {
  const projectDir = resolveProjectDir(options);
  const storage = new WorkshopStorage({ dataDirName });
  const opened = storage.attach(projectDir);
  return { projectDir, workshopDir: opened.workshopPath, storage };
}

/** 数据目录是否存在 */
export function hasDataDir(context: ProjectContext): boolean {
  return existsSync(context.workshopDir);
}
