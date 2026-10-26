import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { WorkshopStorage } from '../dist-electron/services/workshop-storage.cjs';

const tempDirs = [];

async function createStorage() {
  const dir = await mkdtemp(join(tmpdir(), 'creation-workshop-'));
  tempDirs.push(dir);
  const dataFile = join(dir, 'workshop.json');
  return { storage: new WorkshopStorage(dataFile), dataFile };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test('persists preferences and candidate writes to JSON', async () => {
  const { storage, dataFile } = await createStorage();
  await storage.preferencesSet('generator', { race: 'elf', count: 20 });
  const created = await storage.candidateCreate({
    race: 'human',
    nameType: 'person',
    nameText: '雷恩',
    structure: [{ label: '短名', word: '雷恩' }],
    source: 'generated',
    favorite: true,
  });
  assert.equal(created.ok, true);
  const persisted = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.equal(persisted.preferences.generator.race, 'elf');
  assert.equal(persisted.candidates[0].nameText, '雷恩');
  assert.deepEqual(await new WorkshopStorage(dataFile).preferencesGet('generator'), { race: 'elf', count: 20 });
});

test('rejects duplicate candidate names', async () => {
  const { storage } = await createStorage();
  const input = {
    race: 'human',
    nameType: 'place',
    nameText: '青石城',
    structure: [{ label: '地名', word: '青石' }],
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

test('backs up malformed JSON and starts with empty data', async () => {
  const { storage, dataFile } = await createStorage();
  await writeFile(dataFile, '{not-json', 'utf8');
  const filters = { race: 'all', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  assert.deepEqual(await storage.candidatesList(filters), []);
  assert.equal((await storage.stats()).totalCandidates, 0);
});

test('migrates legacy demon race values to elf on read', async () => {
  const { storage, dataFile } = await createStorage();
  const legacy = {
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
        candidateId: '',
        occupation: '',
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
    preferences: {},
  };
  await writeFile(dataFile, JSON.stringify(legacy), 'utf8');
  const filters = { race: 'elf', nameType: 'all', minChars: 1, maxChars: 99, status: 'all', keyword: '', sort: 'latest' };
  const candidates = await storage.candidatesList(filters);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].race, 'elf');
  assert.equal((await storage.sheetsList())[0].race, 'elf');
});
