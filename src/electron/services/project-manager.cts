// 项目管理：维护最近项目列表（userData/projects.json），负责打开 / 新建项目与 VS Code、CLion、Finder 打开目录。

import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { shell } from 'electron';
import { WorkshopStorage, type OpenedProject } from './workshop-storage.cjs';

export interface ProjectConfig {
  /** 项目内数据目录名，默认 `.workshop` */
  dataDirName?: string;
  /** 项目登记文件名，默认 `projects.json` */
  registryFileName?: string;
  /** 旧版单 JSON 数据文件名，默认 `workshop.json` */
  legacyDataFileName?: string;
  /** 最近项目数量上限，默认 10 */
  maxRecentProjects?: number;
}

export interface ProjectSummary {
  path: string;
  name: string;
  lastOpenedAt: number;
}

export interface ProjectResult {
  ok: boolean;
  project?: ProjectSummary;
  message?: string;
}

interface ProjectsState {
  schemaVersion: 1;
  recentProjects: ProjectSummary[];
}

const EMPTY_STATE: ProjectsState = { schemaVersion: 1, recentProjects: [] };
const INVALID_NAME = /[\\/:*?"<>|\u0000-\u001f]/;
const MAX_PROJECT_NAME_LENGTH = 60;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class ProjectManager {
  private currentProject: ProjectSummary | null = null;
  private state: ProjectsState = clone(EMPTY_STATE);
  private initialized = false;

  private readonly registryPath: string;
  private readonly legacyDataPath: string;
  private readonly dataDirName: string;
  private readonly maxRecentProjects: number;

  public constructor(
    private readonly userDataDir: string,
    private readonly storage: WorkshopStorage,
    private readonly config: ProjectConfig = {},
  ) {
    this.dataDirName = config.dataDirName && config.dataDirName.trim() !== '' ? config.dataDirName : '.workshop';
    this.registryPath = join(userDataDir, config.registryFileName && config.registryFileName.trim() !== '' ? config.registryFileName : 'projects.json');
    this.legacyDataPath = join(userDataDir, config.legacyDataFileName && config.legacyDataFileName.trim() !== '' ? config.legacyDataFileName : 'workshop.json');
    const maxRecent = config.maxRecentProjects;
    this.maxRecentProjects = typeof maxRecent === 'number' && maxRecent > 0 ? Math.floor(maxRecent) : 10;
  }

  /** 项目登记文件绝对路径（用于启动日志） */
  public get registryFilePath(): string {
    return this.registryPath;
  }

  public get current(): ProjectSummary | null {
    return this.currentProject ? clone(this.currentProject) : null;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.loadState();
    await this.migrateLegacyData();
  }

  public async listRecent(): Promise<ProjectSummary[]> {
    const existing = this.state.recentProjects.filter((project) => this.isExistingDirectory(project.path)).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    return Promise.all(
      existing.map(async (project) => ({
        ...clone(project),
        name: await this.readProjectDisplayName(project.path, project.name),
      })),
    );
  }

  /**
   * 从最近项目列表中移除指定项目，只改 `projects.json`，**不删除磁盘上的任何文件**。
   * 若移除的是当前项目，同时关闭数据服务并清空当前项目。
   */
  public async removeRecent(projectPath: string): Promise<{ ok: boolean; message?: string }> {
    const resolved = resolve(String(projectPath ?? ''));
    const before = this.state.recentProjects.length;
    const remaining = this.state.recentProjects.filter((project) => project.path !== resolved);
    if (remaining.length === before) return { ok: false, message: '该目录不在最近项目列表中' };
    this.state = { schemaVersion: 1, recentProjects: remaining };
    if (this.currentProject?.path === resolved) {
      this.currentProject = null;
      await this.storage.close();
    }
    try {
      await this.saveState();
    } catch (error) {
      return { ok: false, message: `无法写入项目登记：${error instanceof Error ? error.message : String(error)}` };
    }
    return { ok: true };
  }

  /**
   * 打开项目；目录不存在时自动创建，缺少 `.workshop` 时自动初始化为项目。
   *
   * 这使「打开项目」可以覆盖两种场景：选择一个新目录即新建项目；选择一个已有空目录即就地初始化。
   */
  public async open(projectPath: string): Promise<ProjectResult> {
    const resolved = resolve(String(projectPath ?? ''));
    try {
      let isEmptyDirectory = false;
      if (!existsSync(resolved)) {
        await mkdir(resolved, { recursive: true });
        isEmptyDirectory = true;
      } else if (!statSync(resolved).isDirectory()) {
        return { ok: false, message: '所选路径不是目录' };
      } else {
        const entries = await readdir(resolved);
        isEmptyDirectory = entries.every((entry) => entry === '.DS_Store');
      }
      if (this.currentProject?.path === resolved) return { ok: true, project: clone(this.currentProject) };
      if (isEmptyDirectory) await this.seedEmptyProject(resolved);
      const opened = await this.storage.open(resolved);
      return this.activate(opened, await this.readProjectDisplayName(resolved, opened.name));
    } catch (error) {
      return { ok: false, message: `无法打开项目：${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * 按项目名称打开最近项目：先匹配展示名（README 首行），再匹配目录名，均忽略大小写。
   * 仅搜索 `projects.json` 中登记且目录仍存在的项目。
   */
  public async openByName(projectName: string): Promise<ProjectResult> {
    const name = String(projectName ?? '').trim();
    if (!name) return { ok: false, message: '缺少项目名称' };
    const normalized = name.toLocaleLowerCase();
    const recent = await this.listRecent();
    const match = recent.find((project) => project.name.toLocaleLowerCase() === normalized || basename(project.path).toLocaleLowerCase() === normalized);
    if (!match) return { ok: false, message: `未找到项目「${name}」，请先在创作工坊中打开该项目` };
    return this.open(match.path);
  }

  public async create(input: { parentDir: string; name: string }): Promise<ProjectResult> {
    const parentDir = resolve(String(input.parentDir ?? ''));
    const name = String(input.name ?? '').trim();
    if (!name) return { ok: false, message: '项目名称不能为空' };
    if (name === '.' || name === '..' || INVALID_NAME.test(name) || name.startsWith('.')) {
      return { ok: false, message: '项目名称不能包含路径分隔符或特殊字符，也不能以 . 开头' };
    }
    if (Array.from(name).length > MAX_PROJECT_NAME_LENGTH) return { ok: false, message: `项目名称不能超过 ${MAX_PROJECT_NAME_LENGTH} 个字符` };
    if (!existsSync(parentDir)) return { ok: false, message: '存放位置不存在，请重新选择' };
    const target = join(parentDir, name);
    if (existsSync(target)) return { ok: false, message: '同名目录已存在，请换一个项目名称' };
    await mkdir(target, { recursive: true });
    await this.seedEmptyProject(target, name);
    const opened = await this.storage.open(target);
    return this.activate(opened, await this.readProjectDisplayName(target, opened.name));
  }

  /** 通过 VS Code 打开当前项目目录；未安装 VS Code 时回退到文件管理器 */
  public async openInVSCode(): Promise<{ ok: boolean; message?: string }> {
    const project = this.currentProject;
    if (!project) return { ok: false, message: '尚未打开项目' };
    const binaryCandidates = ['/usr/local/bin/code', '/opt/homebrew/bin/code'];
    const binary = binaryCandidates.find((candidate) => existsSync(candidate)) ?? 'code';
    if (await this.spawnDetached(binary, [project.path])) return { ok: true };
    if (process.platform === 'darwin' && (await this.spawnDetached('/usr/bin/open', ['-a', 'Visual Studio Code', project.path]))) {
      return { ok: true };
    }
    const fallbackError = await shell.openPath(project.path);
    if (fallbackError) return { ok: false, message: `未检测到 VS Code，且无法打开项目目录：${fallbackError}` };
    return { ok: true, message: '未检测到 VS Code，已在文件管理器中打开项目目录' };
  }

  /** 通过 CLion 打开当前项目目录；未安装 CLion 时回退到文件管理器 */
  public async openInCLion(): Promise<{ ok: boolean; message?: string }> {
    const project = this.currentProject;
    if (!project) return { ok: false, message: '尚未打开项目' };
    const binaryCandidates = ['/usr/local/bin/clion', '/opt/homebrew/bin/clion', '/Applications/CLion.app/Contents/MacOS/clion'];
    const binary = binaryCandidates.find((candidate) => existsSync(candidate)) ?? 'clion';
    if (await this.spawnDetached(binary, [project.path])) return { ok: true };
    if (process.platform === 'darwin' && (await this.spawnDetached('/usr/bin/open', ['-a', 'CLion', project.path]))) {
      return { ok: true };
    }
    const fallbackError = await shell.openPath(project.path);
    if (fallbackError) return { ok: false, message: `未检测到 CLion，且无法打开项目目录：${fallbackError}` };
    return { ok: true, message: '未检测到 CLion，已在 Finder 中打开项目目录' };
  }

  /** 在系统文件管理器（macOS 为 Finder）中打开当前项目目录 */
  public async openInFinder(): Promise<{ ok: boolean; message?: string }> {
    const project = this.currentProject;
    if (!project) return { ok: false, message: '尚未打开项目' };
    const error = await shell.openPath(project.path);
    if (error) return { ok: false, message: `无法在 Finder 中打开项目目录：${error}` };
    return { ok: true };
  }

  private async activate(opened: OpenedProject, displayName?: string): Promise<ProjectResult> {
    const project: ProjectSummary = { path: opened.path, name: displayName || opened.name, lastOpenedAt: Date.now() };
    this.currentProject = project;
    try {
      await this.remember(project);
    } catch (error) {
      console.error(`[创作工坊] 最近项目写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
    console.info(`[创作工坊] 项目：${project.path}`);
    console.info(`[创作工坊] 项目数据目录：${opened.workshopPath}`);
    return { ok: true, project: clone(project) };
  }

  private async remember(project: ProjectSummary): Promise<void> {
    const recent = this.state.recentProjects.filter((item) => item.path !== project.path);
    recent.unshift({ ...project });
    this.state = { schemaVersion: 1, recentProjects: recent.slice(0, this.maxRecentProjects) };
    await this.saveState();
  }

  /**
   * 空目录初始化：写入 README.md（首行即项目名）与第一卷/第一章.md。
   * 仅在目录原本为空时调用，已存在的文件不会被覆盖。
   */
  private async seedEmptyProject(projectPath: string, name = basename(projectPath)): Promise<void> {
    await mkdir(join(projectPath, '第一卷'), { recursive: true });
    await this.writeFileIfMissing(join(projectPath, 'README.md'), `# ${name}\n`);
    await this.writeFileIfMissing(join(projectPath, '第一卷', '第一章.md'), '# 第一章\n');
  }

  private async writeFileIfMissing(filePath: string, content: string): Promise<void> {
    try {
      await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  /** 项目展示名优先取 README.md 第一行（去掉 Markdown 标题前缀），否则回退登记名称。 */
  private async readProjectDisplayName(projectPath: string, fallback: string): Promise<string> {
    try {
      const content = await readFile(join(projectPath, 'README.md'), 'utf8');
      const firstLine = (content.split(/\r?\n/, 1)[0] ?? '').trim();
      const name = firstLine.replace(/^#+\s*/, '').trim();
      return name || fallback;
    } catch {
      return fallback;
    }
  }

  private isExistingDirectory(projectPath: string): boolean {
    try {
      return existsSync(projectPath) && statSync(projectPath).isDirectory();
    } catch {
      return false;
    }
  }

  private async loadState(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.registryPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return;
      const recentProjects = (parsed as Record<string, unknown>).recentProjects;
      if (!Array.isArray(recentProjects)) return;
      this.state = {
        schemaVersion: 1,
        recentProjects: recentProjects
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map((item) => ({
            path: typeof item.path === 'string' ? item.path : '',
            name: typeof item.name === 'string' ? item.name : '',
            lastOpenedAt: typeof item.lastOpenedAt === 'number' && Number.isFinite(item.lastOpenedAt) ? item.lastOpenedAt : 0,
          }))
          .filter((item) => item.path !== '')
          .slice(0, this.maxRecentProjects),
      };
    } catch {
      // 登记文件不存在或损坏时从空列表开始
    }
  }

  private async saveState(): Promise<void> {
    await mkdir(this.userDataDir, { recursive: true });
    const tempPath = `${this.registryPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.registryPath);
  }

  /** 首次升级：把旧版 userData/workshop.json 迁移为一个默认项目 */
  private async migrateLegacyData(): Promise<void> {
    if (existsSync(this.registryPath)) return;
    if (!existsSync(this.legacyDataPath)) return;
    let legacy: unknown;
    try {
      legacy = JSON.parse(await readFile(this.legacyDataPath, 'utf8'));
    } catch {
      return;
    }
    const baseDir = join(this.userDataDir, 'projects');
    let target = join(baseDir, '默认项目');
    let suffix = 2;
    while (existsSync(target)) {
      target = join(baseDir, `默认项目-${suffix}`);
      suffix += 1;
    }
    try {
      await mkdir(join(target, this.dataDirName), { recursive: true });
      const opened = await this.storage.open(target);
      const imported = await this.storage.importLegacyData(legacy);
      this.state = {
        schemaVersion: 1,
        recentProjects: [{ path: opened.path, name: opened.name, lastOpenedAt: Date.now() }],
      };
      await this.saveState();
      await this.storage.close();
      console.info(`[创作工坊] 已迁移旧数据到项目：${opened.path}（候选 ${imported.candidates} · 设定 ${imported.sheets} · 关系 ${imported.relations}）`);
    } catch (error) {
      console.error(`[创作工坊] 旧数据迁移失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private spawnDetached(command: string, args: string[]): Promise<boolean> {
    return new Promise((resolveResult) => {
      try {
        const child = spawn(command, args, { detached: true, stdio: 'ignore' });
        child.once('error', () => resolveResult(false));
        child.once('spawn', () => {
          child.unref();
          resolveResult(true);
        });
      } catch {
        resolveResult(false);
      }
    });
  }
}
