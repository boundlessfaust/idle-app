import { db } from './db';
import type { DetectorLogRecord } from './db';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ENTRIES_PER_DETECTOR = 500;

export async function logDetectorFailure(entry: Omit<DetectorLogRecord, 'id'>): Promise<void> {
  await db.detectorLogs.add(entry);
}

export async function pruneDetectorLogs(): Promise<void> {
  const cutoff = Date.now() - RETENTION_MS;
  await db.detectorLogs.where('at').below(cutoff).delete();

  // Dexie.uniqueKeys() returns IndexableType[] — all detector keys are strings
  const detectors = (await db.detectorLogs.orderBy('detector').uniqueKeys()) as string[];

  for (const detector of detectors) {
    const entries = await db.detectorLogs.where('detector').equals(detector).sortBy('at');

    if (entries.length > MAX_ENTRIES_PER_DETECTOR) {
      const overflow = entries.slice(0, entries.length - MAX_ENTRIES_PER_DETECTOR);
      const ids = overflow.map((e) => e.id).filter((id): id is number => id !== undefined);
      await db.detectorLogs.bulkDelete(ids);
    }
  }
}
