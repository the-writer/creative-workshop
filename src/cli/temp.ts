// 临时生成结果：把最近几次 `workshop gen` 的输出保存在 `.workshop/temp.md`，
// 供 `workshop add <ID>` 按 ID 直接收录到角色库。

import { randomBytes } from 'node:crypto';

import { TEMP_MAX_BATCHES } from '@/cli/constants';
import type { TempEntry, WorkshopStorage } from '@/electron/services/workshop-storage.cts';

/** 生成批次 ID：同一次 gen 的结果共享一个批次，便于按批次裁剪历史 */
export function createBatchId(): string {
  return `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
}

/** 条目归属的批次标识 */
function batchOf(entry: TempEntry): string {
  return entry.batch || entry.id;
}

/**
 * 追加一批生成结果并落盘。
 *
 * 只保留最近 `TEMP_MAX_BATCHES` 个批次（最新在前），更早的结果会被丢弃。
 */
export async function saveTempBatch(storage: WorkshopStorage, entries: TempEntry[]): Promise<void> {
  const existing = await storage.tempList();
  const merged = [...entries, ...existing];
  const batches: string[] = [];
  for (const entry of merged) {
    const batch = batchOf(entry);
    if (!batches.includes(batch)) batches.push(batch);
    if (batches.length >= TEMP_MAX_BATCHES) break;
  }
  const kept = merged.filter((entry) => batches.includes(batchOf(entry)));
  await storage.tempSave(kept);
}

/** 按 ID 查找一条生成结果 */
export async function findTempEntry(storage: WorkshopStorage, id: string): Promise<TempEntry | null> {
  const entries = await storage.tempList();
  return entries.find((entry) => entry.id === id) ?? null;
}
