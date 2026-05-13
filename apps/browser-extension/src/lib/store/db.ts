import Dexie, { type Table } from 'dexie';

export interface SettingsRecord {
  id: 1; // singleton
  enabled: boolean;
  promptCapture: boolean;
  promptCaptureNudgeDismissed: boolean;
  muteUntil: number; // epoch ms; 0 = not muted
  rotationWindowHours: number; // 1 | 2 | 4 | 8; 0 = browser session
  lastResetAt: number; // epoch ms
  windowN: number;
  badgeStyle: 'none' | 'active' | 'mute';
  disabledCategories: string[]; // ActivityCategory[]
}

export interface PanelPositionRecord {
  id: 1; // singleton
  corner: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export interface RotationHistoryRecord {
  activityId: string;
  seenAt: number; // epoch ms
}

export interface DetectorLogRecord {
  id?: number;
  detector: string;
  providerVersion: string;
  errorType: 'selector_miss' | 'observer_error' | 'init_fail';
  at: number;
  message: string;
}

export interface PinnedNoteRecord {
  id: 1; // singleton
  text: string;
  pinnedAt: number;
}

export class IdleDb extends Dexie {
  settings!: Table<SettingsRecord, number>;
  panelPosition!: Table<PanelPositionRecord, number>;
  rotationHistory!: Table<RotationHistoryRecord, string>;
  detectorLogs!: Table<DetectorLogRecord, number>;
  pinnedNote!: Table<PinnedNoteRecord, number>;

  constructor() {
    super('idle-db');
    this.version(1).stores({
      settings: 'id',
      panelPosition: 'id',
      rotationHistory: 'activityId, seenAt',
      detectorLogs: '++id, detector, at',
      pinnedNote: 'id',
    });
  }
}

export const db = new IdleDb();

export const DEFAULT_SETTINGS: SettingsRecord = {
  id: 1,
  enabled: true,
  promptCapture: false,
  promptCaptureNudgeDismissed: false,
  muteUntil: 0,
  rotationWindowHours: 4,
  lastResetAt: 0,
  windowN: 30,
  badgeStyle: 'none',
  disabledCategories: [],
};

export async function getSettings(): Promise<SettingsRecord> {
  const s = await db.settings.get(1);
  return s ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(partial: Partial<SettingsRecord>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...partial, id: 1 });
}

export async function getPanelCorner(): Promise<PanelPositionRecord['corner']> {
  const r = await db.panelPosition.get(1);
  return r?.corner ?? 'bottom-right';
}

export async function savePanelCorner(corner: PanelPositionRecord['corner']): Promise<void> {
  await db.panelPosition.put({ id: 1, corner });
}

export async function getRotationHistory(): Promise<string[]> {
  const rows = await db.rotationHistory.orderBy('seenAt').toArray();
  return rows.map((r) => r.activityId);
}

export async function addToRotationHistory(activityId: string): Promise<void> {
  await db.rotationHistory.put({ activityId, seenAt: Date.now() });
}

export async function clearRotationHistory(): Promise<void> {
  await db.rotationHistory.clear();
}

export async function getPinnedNote(): Promise<string | null> {
  const r = await db.pinnedNote.get(1);
  return r?.text ?? null;
}

export async function savePinnedNote(text: string): Promise<void> {
  await db.pinnedNote.put({ id: 1, text, pinnedAt: Date.now() });
}

export async function clearPinnedNote(): Promise<void> {
  await db.pinnedNote.delete(1);
}
