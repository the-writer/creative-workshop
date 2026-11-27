import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';
import { WorkshopStorage } from '../release/electron/services/workshop-storage.cjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliBundle = join(repoRoot, 'release', 'cli', 'cli.cjs');
const tempDirs = [];

function createProjectDir() {
  const dir = spawnSync('mktemp', ['-d', join(tmpdir(), 'creation-workshop-cli-')], { encoding: 'utf8' }).stdout.trim();
  tempDirs.push(dir);
  return dir;
}

/** 运行命令行工具，返回退出码与输出 */
function runCli(args, cwd) {
  const result = spawnSync(process.execPath, [cliBundle, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** 写入项目偏好（preferences.md 的生成规则） */
async function writePreferences(projectDir, generator) {
  await mkdir(join(projectDir, '.workshop'), { recursive: true });
  await writeFile(
    join(projectDir, '.workshop', 'preferences.md'),
    ['# 偏好设置', '', '## 生成规则', '', '```json', JSON.stringify(generator, null, 2), '```', '', ''].join('\n'),
    'utf8',
  );
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test('prints the usage when no sub-command is given', () => {
  const result = runCli([], repoRoot);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage: workshop <command> \[options\]/);
  assert.match(result.stdout, /list \[sheets\|places\|candidates\]/);
});

test('generates the requested number of names as a table', () => {
  assert.ok(existsSync(cliBundle), '缺少 CLI 构建产物，请先执行 pnpm run build:cli');
  const projectDir = createProjectDir();
  const result = runCli(['gen', '--count', '5'], projectDir);
  assert.equal(result.code, 0);
  const lines = result.stdout.trim().split('\n');
  assert.match(lines[0], /ID\s+名称/);
  assert.match(lines[1], /^-+/);
  const dataLines = lines.slice(2).filter((line) => /^[a-z0-9]+_\d+\s/.test(line));
  assert.equal(dataLines.length, 5, '表格应输出 5 行数据');
  assert.match(result.stdout, /共 5 条/);
});

test('rejects invalid arguments with a non-zero exit code', () => {
  const result = runCli(['gen', '--count', '0'], repoRoot);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /数量需为/);
});

test('adds a character to the local library and lists it back', async () => {
  const projectDir = createProjectDir();
  const added = runCli(['add', '--race', 'elf', '--gender', 'female', '--name', '希尔维', '--note', '精灵族法师'], projectDir);
  assert.equal(added.code, 0);
  assert.match(added.stdout, /已写入/);
  assert.ok(existsSync(join(projectDir, '.workshop', 'candidates.md')), '应创建 .workshop/candidates.md');

  const listed = runCli(['list', 'candidates'], projectDir);
  assert.equal(listed.code, 0);
  assert.match(listed.stdout, /希尔维/);
  assert.match(listed.stdout, /精灵族/);
  assert.match(listed.stdout, /共 1 条/);

  // 桌面应用读取同一份数据，CLI 写入的记录必须能被主进程解析
  const storage = new WorkshopStorage({ dataDirName: '.workshop' });
  await storage.open(projectDir);
  const filters = { race: 'all', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  const candidates = await storage.candidatesList(filters);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].nameText, '希尔维');
  assert.equal(candidates[0].race, 'elf');
  assert.equal(candidates[0].gender, 'female');
  assert.equal(candidates[0].source, 'manual');
  assert.equal(candidates[0].note, '精灵族法师');
});

test('lists the setting sheets by default', async () => {
  const projectDir = createProjectDir();
  const storage = new WorkshopStorage({ dataDirName: '.workshop' });
  await storage.open(projectDir);
  await storage.sheetSave({
    characterName: '云隐',
    race: 'human',
    candidateId: '',
    occupation: '游侠',
    hometown: '',
    hometownIds: [],
    note: '',
  });

  const listed = runCli(['list'], projectDir);
  assert.equal(listed.code, 0);
  assert.match(listed.stdout, /设定卡/);
  assert.match(listed.stdout, /云隐/);
  assert.match(listed.stdout, /游侠/);
});

test('rejects duplicated names in the same library', () => {
  const projectDir = createProjectDir();
  assert.equal(runCli(['add', '--name', '云隐'], projectDir).code, 0);
  const duplicated = runCli(['add', '--name', '云隐'], projectDir);
  assert.equal(duplicated.code, 1);
  assert.match(duplicated.stderr, /该名称已在库中/);
});

test('writes place names into places.md', async () => {
  const projectDir = createProjectDir();
  assert.equal(runCli(['add', '--type', 'place', '--name', '青云城'], projectDir).code, 0);
  assert.ok(existsSync(join(projectDir, '.workshop', 'places.md')));
  const storage = new WorkshopStorage({ dataDirName: '.workshop' });
  await storage.open(projectDir);
  const places = await storage.placesList();
  assert.equal(places.length, 1);
  assert.equal(places[0].name, '青云城');

  const listed = runCli(['list', 'places'], projectDir);
  assert.equal(listed.code, 0);
  assert.match(listed.stdout, /青云城/);
});

test('keeps the generated names in temp.md and adds them by id', async () => {
  const projectDir = createProjectDir();
  const generated = runCli(['gen', '--count', '3'], projectDir);
  assert.equal(generated.code, 0);

  const tempFile = join(projectDir, '.workshop', 'temp.md');
  assert.ok(existsSync(tempFile), '应保存 .workshop/temp.md');
  const tempText = await readFile(tempFile, 'utf8');
  const ids = [...tempText.matchAll(/^- ID: `([^`]+)`$/gm)].map((match) => match[1]);
  assert.equal(ids.length, 3, 'temp.md 应保留 3 条生成结果');

  const added = runCli(['add', ids[0]], projectDir);
  assert.equal(added.code, 0);
  assert.match(added.stdout, /已写入/);

  const storage = new WorkshopStorage({ dataDirName: '.workshop' });
  await storage.open(projectDir);
  const filters = { race: 'all', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  const candidates = await storage.candidatesList(filters);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source, 'generated');
});

test('reports an unknown generated id', () => {
  const projectDir = createProjectDir();
  const result = runCli(['add', 'not-exist_0'], projectDir);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /未找到生成结果/);
});

test('uses the generation rules stored in preferences.md as defaults', async () => {
  const projectDir = createProjectDir();
  await writePreferences(projectDir, {
    schemaVersion: 2,
    race: 'elf',
    types: ['place'],
    params: {
      count: 2,
      shortMode: 'mix',
      personSuffix: 'father',
      minChars: 4,
      maxChars: 8,
      professions: [],
      abilities: [],
      gender: 'female',
      surnameBias: 80,
    },
  });

  const generated = runCli(['gen'], projectDir);
  assert.equal(generated.code, 0);
  assert.match(generated.stdout, /共 2 条/);
  assert.match(generated.stdout, /精灵族/);
  assert.match(generated.stdout, /地名/);
});

test('reports a missing library instead of failing silently', () => {
  const projectDir = createProjectDir();
  const result = runCli(['list'], projectDir);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /没有 .workshop 数据目录/);
});

test('prints the shell completion script', () => {
  const result = runCli(['completion', 'zsh'], repoRoot);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /#compdef workshop/);
});

test('keeps the candidates file readable after repeated writes', async () => {
  const projectDir = createProjectDir();
  for (const name of ['甲一', '乙二', '丙三']) {
    assert.equal(runCli(['add', '--name', name], projectDir).code, 0);
  }
  const text = await readFile(join(projectDir, '.workshop', 'candidates.md'), 'utf8');
  assert.equal((text.match(/^## /gm) ?? []).length, 3);
  const storage = new WorkshopStorage({ dataDirName: '.workshop' });
  await storage.open(projectDir);
  const filters = { race: 'all', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  const candidates = await storage.candidatesList(filters);
  assert.equal(candidates.length, 3);
});
