// Unified chrome.storage.local adapter — no Dexie dependency.
// Used by both content scripts and background SW in Phase 4.
// Dexie will be introduced in Phase 5+ for detector logs and complex queries.

export type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface Settings {
  enabled: boolean;
  detectionMode: 'auto' | 'manual';
  muteUntil: number; // epoch ms; 0 = not muted
  rotationWindowHours: number; // 1 | 2 | 4 | 8; 0 = browser session
  lastResetAt: number;
  windowN: number;
  badgeStyle: 'none' | 'active' | 'mute';
  disabledCategories: string[];
  siteEnabled: Record<string, boolean>; // hostname → enabled; default true
  logRetentionDays: number; // 1 | 3 | 7 | 30; default 7
  logEntryCap: number; // per-detector cap; default 500
}

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  detectionMode: 'auto',
  muteUntil: 0,
  rotationWindowHours: 4,
  lastResetAt: 0,
  windowN: 30,
  badgeStyle: 'none',
  disabledCategories: [],
  siteEnabled: { 'claude.ai': true, 'chatgpt.com': true },
  logRetentionDays: 7,
  logEntryCap: 500,
};

function storageGet<T>(keys: string[]): Promise<Record<string, T>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result as Record<string, T>));
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  const result = await storageGet<Settings>(['settings']);
  return { ...DEFAULT_SETTINGS, ...(result.settings ?? {}) };
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await storageSet({ settings: { ...current, ...partial } });
}

// ── Panel corner ──────────────────────────────────────────────────────────────

export async function getPanelCorner(): Promise<Corner> {
  const result = await storageGet<Corner>(['panelCorner']);
  return result.panelCorner ?? 'bottom-right';
}

export async function savePanelCorner(corner: Corner): Promise<void> {
  await storageSet({ panelCorner: corner });
}

// ── Rotation history ──────────────────────────────────────────────────────────

export async function getRotationHistory(): Promise<string[]> {
  const result = await storageGet<string[]>(['rotationHistory']);
  return result.rotationHistory ?? [];
}

export async function addToRotationHistory(activityId: string): Promise<void> {
  const history = await getRotationHistory();
  // Keep the activity in its latest position (dedup + append)
  const updated = [...history.filter((id) => id !== activityId), activityId];
  await storageSet({ rotationHistory: updated });
}

export async function clearRotationHistory(): Promise<void> {
  await storageRemove(['rotationHistory']);
}

// ── Pinned note ───────────────────────────────────────────────────────────────

export async function getPinnedNote(): Promise<string | null> {
  const result = await storageGet<string>(['pinnedNote']);
  return result.pinnedNote ?? null;
}

export async function savePinnedNote(text: string): Promise<void> {
  await storageSet({ pinnedNote: text });
}

export async function clearPinnedNote(): Promise<void> {
  await storageRemove(['pinnedNote']);
}
