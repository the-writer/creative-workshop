import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { WorkshopStorage } from '../dist-electron/services/workshop-storage.cjs';
import { ProjectManager } from '../dist-electron/services/project-manager.cjs';

const tempDirs = [];

async function createStorage() {
  const projectDir = await mkdtemp(join(tmpdir(), 'creation-workshop-'));
  tempDirs.push(projectDir);
  const storage = new WorkshopStorage({ dataDirName: '.workshop' });
  await storage.open(projectDir);
  return { storage, projectDir, workshopDir: join(projectDir, '.workshop') };
}

async function readWorkshopFile(workshopDir, fileName) {
  return readFile(join(workshopDir, fileName), 'utf8');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test('creates .workshop files and persists preferences/candidate as Markdown', async () => {
  const { storage, workshopDir } = await createStorage();
  for (const fileName of ['project.md', 'candidates.md', 'sheets.md', 'relations.md', 'graph.md', 'preferences.md', 'sheets.ini']) {
    assert.ok((await readWorkshopFile(workshopDir, fileName)).length > 0, `${fileName} 应已创建`);
  }
  await storage.preferencesSet('generator', { race: 'elf', count: 20 });
  const created = await storage.candidateCreate({
    race: 'human',
    nameType: 'person',
    nameText: '雷·恩医·珂希',
    structure: [{ label: '姓氏（1.0%人口）', word: '雷' }],
    source: 'generated',
    gender: 'neutral',
    rarity: 'SSSR',
    favorite: true,
  });
  assert.equal(created.ok, true);

  const candidatesMd = await readWorkshopFile(workshopDir, 'candidates.md');
  assert.match(candidatesMd, /# 名称候选/);
  assert.match(candidatesMd, /## 雷·恩医·珂希/);
  assert.match(candidatesMd, /- 性别: 中性/);
  assert.match(candidatesMd, /- 稀有度: SSSR/);
  assert.match(candidatesMd, /- 收藏: 是/);
  const preferencesMd = await readWorkshopFile(workshopDir, 'preferences.md');
  assert.match(preferencesMd, /## 生成规则/);
  assert.match(preferencesMd, /"race": "elf"/);

  const reopened = new WorkshopStorage({ dataDirName: '.workshop' });
  await reopened.open(join(workshopDir, '..'));
  assert.deepEqual(await reopened.preferencesGet('generator'), { race: 'elf', count: 20 });
  const filters = { race: 'all', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  const list = await reopened.candidatesList(filters);
  assert.equal(list.length, 1);
  assert.equal(list[0].nameText, '雷·恩医·珂希');
  assert.equal(list[0].charCount, 5, '字数应排除「·」分隔符');
  assert.equal(list[0].gender, 'neutral');
  assert.equal(list[0].rarity, 'SSSR');
});

test('writes relation summary to sheets.md and keeps candidates only under [候选]', async () => {
  const { storage, workshopDir } = await createStorage();
  await storage.candidateCreate({ race: 'human', nameType: 'person', nameText: '林深', structure: [], source: 'manual', note: '男主名字' });
  await storage.candidateCreate({ race: 'human', nameType: 'place', nameText: '边界城', structure: [], source: 'manual', note: '边境主城' });
  const lin = await storage.sheetSave({
    characterName: '林深',
    race: 'human',
    gender: 'female',
    candidateId: '',
    occupation: '剑修',
    office: '',
    hometown: '',
    hometownCandidateId: '',
    nickname: '',
    contractTitle: '',
    note: '',
  });
  const su = await storage.sheetSave({
    characterName: '苏晚',
    race: 'human',
    candidateId: '',
    occupation: '',
    office: '',
    hometown: '',
    hometownCandidateId: '',
    nickname: '',
    contractTitle: '',
    note: '',
  });
  await storage.relationAdd({
    fromType: 'sheet',
    fromId: lin.id,
    fromName: '林深',
    toType: 'sheet',
    toId: lin.id,
    toName: '林深',
    relationType: '男主',
    note: '',
  });
  await storage.relationAdd({
    fromType: 'sheet',
    fromId: lin.id,
    fromName: '林深',
    toType: 'sheet',
    toId: su.id,
    toName: '苏晚',
    relationType: '师徒',
    note: '',
  });
  await storage.relationAdd({
    fromType: 'sheet',
    fromId: lin.id,
    fromName: '林深',
    toType: 'sheet',
    toId: su.id,
    toName: '苏晚',
    relationType: '青梅竹马',
    note: '',
  });

  const sheetsMd = await readWorkshopFile(workshopDir, 'sheets.md');
  assert.match(sheetsMd, /- 性别: 女性/);
  assert.match(sheetsMd, /- 关系: 自己（男主）、[^\n]*苏晚（师徒）/);
  assert.match(sheetsMd, /- 关系: [^\n]*苏晚（青梅竹马）/);
  const relationsMd = await readWorkshopFile(workshopDir, 'relations.md');
  assert.match(relationsMd, /- 关系类型: 青梅竹马/);
  assert.equal((await storage.sheetsList()).find((sheet) => sheet.characterName === '林深')?.gender, 'female');

  const ini = await readWorkshopFile(workshopDir, 'sheets.ini');
  assert.match(ini, /\[人物\]/);
  assert.match(ini, /林深 = 剑修/);
  assert.doesNotMatch(ini, /\[地名\]/);
  assert.doesNotMatch(ini, /^边界城 = /m);
  assert.match(ini, /\[候选\]/);
  assert.match(ini, /; 林深 = 男主名字/);
  assert.match(ini, /; 边界城 = 边境主城/);
});

test('rejects duplicate candidate names', async () => {
  const { storage } = await createStorage();
  const input = {
    race: 'human',
    nameType: 'place',
    nameText: '青石城',
    structure: [{ label: '地形前缀', word: '青石' }],
    source: 'generated',
  };
  assert.equal((await storage.candidateCreate(input)).ok, true);
  assert.deepEqual(await storage.candidateCreate(input), {
    ok: false,
    duplicate: true,
    id: '',
    message: '该名称已在库中',
  });
});

test('requires force before deleting a referenced candidate and then clears references', async () => {
  const { storage } = await createStorage();
  const candidate = await storage.candidateCreate({
    race: 'human',
    nameType: 'person',
    nameText: '雷恩',
    structure: [],
    source: 'generated',
  });
  const sheet = await storage.sheetSave({
    characterName: '雷恩',
    race: 'human',
    candidateId: candidate.id,
    occupation: '',
    office: '',
    hometown: '',
    hometownCandidateId: '',
    nickname: '',
    contractTitle: '',
    note: '',
  });
  assert.equal(sheet.ok, true);
  const blocked = await storage.candidateDelete(candidate.id, false);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.refs.asCharacter, true);
  const filters = { race: 'all', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  assert.equal((await storage.candidatesList(filters)).length, 1);
  assert.equal((await storage.candidateDelete(candidate.id, true)).ok, true);
  assert.equal((await storage.sheetsList())[0]?.candidateId, '');
});

test('cascades sheet removal into relations and updates stats', async () => {
  const { storage } = await createStorage();
  const baseSheet = {
    race: 'human',
    candidateId: '',
    occupation: '',
    office: '',
    hometown: '',
    hometownCandidateId: '',
    nickname: '',
    contractTitle: '',
    note: '',
  };
  const first = await storage.sheetSave({ ...baseSheet, characterName: '雷恩' });
  const second = await storage.sheetSave({ ...baseSheet, characterName: '兰诺' });
  assert.equal(
    (
      await storage.relationAdd({
        fromType: 'sheet',
        fromId: first.id,
        fromName: '雷恩',
        toType: 'sheet',
        toId: second.id,
        toName: '兰诺',
        relationType: '同僚',
        note: '',
      })
    ).ok,
    true,
  );
  assert.equal((await storage.stats()).totalRelations, 1);
  assert.equal((await storage.sheetDelete(first.id)).ok, true);
  const stats = await storage.stats();
  assert.equal(stats.totalSheets, 1);
  assert.equal(stats.totalRelations, 0);
});

test('supports self relations and counts them once per sheet', async () => {
  const { storage, workshopDir } = await createStorage();
  const sheet = await storage.sheetSave({
    characterName: '雷恩',
    race: 'human',
    candidateId: '',
    occupation: '',
    office: '',
    hometown: '',
    hometownCandidateId: '',
    nickname: '',
    contractTitle: '',
    note: '',
  });
  const added = await storage.relationAdd({
    fromType: 'sheet',
    fromId: sheet.id,
    fromName: '雷恩',
    toType: 'sheet',
    toId: sheet.id,
    toName: '雷恩',
    relationType: '契约',
    note: '与自身立约',
  });
  assert.equal(added.ok, true);
  const relations = await storage.relationsList();
  assert.equal(relations.length, 1);
  assert.equal(relations[0].fromId, relations[0].toId);
  const sheets = await storage.sheetsList();
  assert.equal(sheets[0]?.relationCount, 1, '自关联只计一次');
  assert.match(await readWorkshopFile(workshopDir, 'relations.md'), /契约/);
  assert.match(await readWorkshopFile(workshopDir, 'sheets.md'), /- 关系: 自己（契约）/);
  const graphMd = await readWorkshopFile(workshopDir, 'graph.md');
  assert.match(graphMd, /连线数: 0/, '自关联不应进入图谱快照');
  assert.doesNotMatch(graphMd, /契约/);

  // 模拟旧数据：relations.md 有自关联，但 sheets.md 缺少派生的关系摘要
  const sheetsWithoutRelation = (await readWorkshopFile(workshopDir, 'sheets.md')).replace(/^- 关系:.*\n/m, '');
  assert.doesNotMatch(sheetsWithoutRelation, /- 关系:/);
  await writeFile(join(workshopDir, 'sheets.md'), sheetsWithoutRelation, 'utf8');

  const reopened = new WorkshopStorage({ dataDirName: '.workshop' });
  await reopened.open(join(workshopDir, '..'));
  const reloaded = await reopened.relationsList();
  assert.equal(reloaded.length, 1, '自关联应能从 Markdown 重新解析');
  assert.equal(reloaded[0].fromId, reloaded[0].toId);
  assert.match(await readWorkshopFile(workshopDir, 'sheets.md'), /- 关系: 自己（契约）/, '打开项目时应补写关系摘要');
});

test('tolerates malformed Markdown entries and starts from empty data', async () => {
  const { storage, workshopDir } = await createStorage();
  await writeFile(join(workshopDir, 'candidates.md'), '# 名称候选\n\n## 坏数据\n\n这不是字段行\n', 'utf8');
  const filters = { race: 'all', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  assert.deepEqual(await storage.candidatesList(filters), []);
  assert.equal((await storage.stats()).totalCandidates, 0);
  assert.equal((await storage.candidateCreate({ race: 'human', nameType: 'place', nameText: '青石城', structure: [], source: 'generated' })).ok, true);
  assert.equal((await storage.candidatesList(filters)).length, 1);
});

test('imports legacy JSON data into classified Markdown files and migrates demon race', async () => {
  const { storage, workshopDir } = await createStorage();
  const imported = await storage.importLegacyData({
    schemaVersion: 1,
    candidates: [
      {
        id: 'legacy-candidate',
        race: 'demon',
        nameType: 'person',
        nameText: '旧妖族名',
        structure: [],
        source: 'generated',
        favorite: false,
        note: '',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    sheets: [
      {
        id: 'legacy-sheet',
        characterName: '旧妖族角色',
        race: 'demon',
        candidateId: 'legacy-candidate',
        occupation: '剑修',
        office: '',
        hometown: '',
        hometownCandidateId: '',
        nickname: '',
        contractTitle: '',
        note: '',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    relations: [],
    preferences: { generator: { race: 'demon' } },
  });
  assert.equal(imported.candidates, 1);
  assert.equal(imported.sheets, 1);
  const filters = { race: 'elf', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  const candidates = await storage.candidatesList(filters);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].race, 'elf');
  assert.equal((await storage.sheetsList())[0].race, 'elf');
  assert.deepEqual(await storage.preferencesGet('generator'), { race: 'demon' });
  assert.match(await readWorkshopFile(workshopDir, 'sheets.md'), /旧妖族角色/);
  assert.match(await readWorkshopFile(workshopDir, 'relations.md'), /# 人物与地名关系/);
});

test('persists graph layout coordinates in graph.md and keeps them after data changes', async () => {
  const { storage, workshopDir } = await createStorage();
  const sheet = await storage.sheetSave({
    characterName: '雷恩',
    race: 'human',
    candidateId: '',
    occupation: '',
    office: '',
    hometown: '',
    hometownCandidateId: '',
    nickname: '',
    contractTitle: '',
    note: '',
  });
  const nodeId = `s:${sheet.id}`;
  assert.deepEqual(await storage.graphLayoutSave({ [nodeId]: { x: 12.5, y: 30.25 } }), { ok: true });
  assert.deepEqual(await storage.graphLayoutGet(), { [nodeId]: { x: 12.5, y: 30.25 } });
  const graphMd = await readWorkshopFile(workshopDir, 'graph.md');
  assert.match(graphMd, /## 节点布局/);
  assert.match(graphMd, /节点布局|人物：雷恩/);

  // 数据变化刷新快照时不应丢失布局
  await storage.candidateCreate({ race: 'human', nameType: 'place', nameText: '青石城', structure: [], source: 'generated' });
  assert.deepEqual(await storage.graphLayoutGet(), { [nodeId]: { x: 12.5, y: 30.25 } });
  assert.match(await readWorkshopFile(workshopDir, 'graph.md'), /节点布局/);
});

test('supports hand-written Markdown candidate files', async () => {
  const { storage, workshopDir } = await createStorage();
  await writeFile(
    join(workshopDir, 'candidates.md'),
    [
      '# 名称候选',
      '',
      '## 手写·候选',
      '',
      '- ID: `hand-written-id`',
      '- 名称: 手写·候选',
      '- 族群: 精灵族',
      '- 类型: 人名',
      '- 性别: 女性',
      '- 来源: 手动',
      '- 收藏: 否',
      '- 备注: "第一行\\n第二行"',
      '- 创建时间: 2026-10-26T00:00:00.000Z',
      '- 更新时间: 2026-10-26T00:00:00.000Z',
      '',
    ].join('\n'),
    'utf8',
  );
  const filters = { race: 'all', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  const [candidate] = await storage.candidatesList(filters);
  assert.equal(candidate.nameText, '手写·候选');
  assert.equal(candidate.race, 'elf');
  assert.equal(candidate.gender, 'female');
  assert.equal(candidate.source, 'manual');
  assert.equal(candidate.note, '第一行\n第二行');
  assert.equal(candidate.charCount, 4);
});

test('opens a missing directory by creating it and initializing .workshop', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'creation-workshop-projects-'));
  tempDirs.push(baseDir);
  const storage = new WorkshopStorage({ dataDirName: '.workshop' });
  const manager = new ProjectManager(join(baseDir, 'userData'), storage, {
    dataDirName: '.workshop',
    registryFileName: 'projects.json',
    legacyDataFileName: 'workshop.json',
    maxRecentProjects: 10,
  });
  await manager.initialize();
  const target = join(baseDir, '新项目');
  const result = await manager.open(target);
  assert.equal(result.ok, true);
  assert.equal(result.project?.path, target);
  assert.ok(existsSync(join(target, '.workshop', 'candidates.md')));
  assert.equal(await readFile(join(target, 'README.md'), 'utf8'), '# 新项目\n');
  assert.equal(await readFile(join(target, '第一卷', '第一章.md'), 'utf8'), '# 第一章\n');
  const recent = await manager.listRecent();
  assert.equal(recent[0]?.path, target);
  assert.equal(recent[0]?.name, '新项目');
});

test('uses the first line of README.md as the project display name', async () => {
  const baseDir = await mkdtemp(join(tmpdir(), 'creation-workshop-readme-'));
  tempDirs.push(baseDir);
  const storage = new WorkshopStorage({ dataDirName: '.workshop' });
  const manager = new ProjectManager(join(baseDir, 'userData'), storage, {
    dataDirName: '.workshop',
    registryFileName: 'projects.json',
    legacyDataFileName: 'workshop.json',
    maxRecentProjects: 10,
  });
  await manager.initialize();
  const target = join(baseDir, '目录名');
  await manager.open(target);
  await writeFile(join(target, 'README.md'), '# 星河纪事\n\n第二行内容\n', 'utf8');
  const recent = await manager.listRecent();
  assert.equal(recent[0]?.name, '星河纪事');
});
