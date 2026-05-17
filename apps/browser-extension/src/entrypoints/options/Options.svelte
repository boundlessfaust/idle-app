<script lang="ts">
import type { ActivityCategory } from '@idle/core/activities/catalog';
import { onMount } from 'svelte';
import { db } from '../../lib/store/db';
import {
  type Corner,
  type Settings,
  getPanelCorner,
  getSettings,
  savePanelCorner,
  saveSettings,
} from '../../lib/store/storage';

// ── Static detector registry (bump when detector files change) ────────────
const DETECTORS = [
  {
    contextKey: 'web:claude.ai',
    site: 'claude.ai',
    providerVersion: '1.0.1',
    lastVerified: '2026-05-13',
  },
  {
    contextKey: 'web:chatgpt.com',
    site: 'chatgpt.com',
    providerVersion: '1.0.0',
    lastVerified: '2026-05-14',
  },
  {
    contextKey: 'web:gemini.google.com',
    site: 'gemini.google.com',
    providerVersion: '1.0.0',
    lastVerified: '2026-05-17',
  },
  {
    contextKey: 'web:perplexity.ai',
    site: 'perplexity.ai',
    providerVersion: '1.0.0',
    lastVerified: '2026-05-17',
  },
];

const KNOWN_SITES = ['claude.ai', 'chatgpt.com', 'gemini.google.com', 'perplexity.ai'];

const ALL_CATEGORIES: ActivityCategory[] = [
  'PhysicalReset',
  'ContextPreserving',
  'WriteOnly',
  'Diffuse',
];

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  PhysicalReset: 'Physical Reset',
  ContextPreserving: 'Context Preserving',
  WriteOnly: 'Write Only',
  Diffuse: 'Diffuse',
};

// Band → eligible categories (matches selector.ts logic)
const BAND_CATEGORIES: Record<string, ActivityCategory[]> = {
  short: ['PhysicalReset'],
  'medium-short': ['PhysicalReset', 'ContextPreserving'],
  'medium-long': ['ContextPreserving', 'WriteOnly'],
  long: ['Diffuse', 'WriteOnly'],
};

const CITATIONS = [
  {
    key: 'Baird et al. 2012',
    text: 'Baird B, Smallwood J, Mrazek MD, et al. Inspired by distraction: Mind wandering facilitates creative incubation. Psychological Science. 2012.',
  },
  {
    key: 'Mark et al. 2008',
    text: 'Mark G, Gudith D, Klocke U. The cost of interrupted work: More speed and stress. CHI 2008.',
  },
  {
    key: 'Cowan 2010',
    text: 'Cowan N. The magical mystery four: How is working memory capacity limited, and why? Current Directions in Psychological Science. 2010.',
  },
  {
    key: 'Henning et al. 1997',
    text: 'Henning RA, Jacques P, Kissel GV, Sullivan AB, Alteras-Webb SM. Frequent short rest breaks from computer work: Effects on productivity and well-being at two field sites. Ergonomics. 1997.',
  },
];

// ── State ─────────────────────────────────────────────────────────────────
let settings = $state<Settings | null>(null);
let panelCorner = $state<Corner>('bottom-right');
let hotkeyConflict = $state(false);
let detectorFailures = $state<Record<string, number>>({});
let rawDexieData = $state('');

interface DetectorStatus {
  contextKey: string;
  site: string;
  providerVersion: string;
  lastVerified: string;
  failures: number;
}

const detectorStatuses = $derived<DetectorStatus[]>(
  DETECTORS.map((d) => ({
    ...d,
    failures: detectorFailures[d.contextKey] ?? 0,
  })),
);

// ── Mount ─────────────────────────────────────────────────────────────────
onMount(async () => {
  const [s, corner, commands] = await Promise.all([
    getSettings(),
    getPanelCorner(),
    chrome.commands.getAll(),
  ]);
  settings = s;
  panelCorner = corner;

  const cmd = commands.find((c) => c.name === 'toggle-wait');
  hotkeyConflict = !cmd?.shortcut;

  // Re-check hotkey when user returns to this tab (e.g. after visiting chrome://extensions/shortcuts)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      const cmds = await chrome.commands.getAll();
      const c = cmds.find((x) => x.name === 'toggle-wait');
      hotkeyConflict = !c?.shortcut;
    }
  });

  await loadDetectorFailures();
});

async function loadDetectorFailures() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const failures: Record<string, number> = {};
  for (const d of DETECTORS) {
    const count = await db.detectorLogs
      .where('detector')
      .equals(d.contextKey)
      .and((e) => e.at >= cutoff)
      .count();
    failures[d.contextKey] = count;
  }
  detectorFailures = failures;
}

// ── Settings helpers ──────────────────────────────────────────────────────
async function set<K extends keyof Settings>(key: K, value: Settings[K]) {
  if (!settings) return;
  settings = { ...settings, [key]: value };
  await saveSettings({ [key]: value } as Partial<Settings>);
}

function isSiteEnabled(site: string): boolean {
  if (!settings) return true;
  return settings.siteEnabled?.[site] !== false;
}

async function toggleSite(site: string) {
  if (!settings) return;
  const next = { ...(settings.siteEnabled ?? {}), [site]: !isSiteEnabled(site) };
  await set('siteEnabled', next);
}

function isCategoryEnabled(cat: ActivityCategory): boolean {
  if (!settings) return true;
  return !settings.disabledCategories.includes(cat);
}

function getDisableWarning(cat: ActivityCategory): string | null {
  if (!settings) return null;
  const wouldBeDisabled = new Set([...settings.disabledCategories, cat]);
  const emptyBands: string[] = [];
  for (const [band, cats] of Object.entries(BAND_CATEGORIES)) {
    if (cats.every((c) => wouldBeDisabled.has(c))) {
      emptyBands.push(band);
    }
  }
  if (emptyBands.length === 0) return null;
  return `Disabling this leaves ${emptyBands.join(', ')} with no activities.`;
}

async function toggleCategory(cat: ActivityCategory) {
  if (!settings) return;
  const enabled = isCategoryEnabled(cat);
  const next = enabled
    ? [...settings.disabledCategories, cat]
    : settings.disabledCategories.filter((c) => c !== cat);
  await set('disabledCategories', next);
}

// ── Actions ───────────────────────────────────────────────────────────────
async function resetPanelPosition() {
  await db.panelPosition.delete(1);
  panelCorner = 'bottom-right';
  await savePanelCorner('bottom-right');
}

async function clearDetectorLogs() {
  await db.detectorLogs.clear();
  await loadDetectorFailures();
}

async function exportData() {
  const [s, pos, history, logs, note] = await Promise.all([
    db.settings.toArray(),
    db.panelPosition.toArray(),
    db.rotationHistory.toArray(),
    db.detectorLogs.toArray(),
    db.pinnedNote.toArray(),
  ]);
  const payload = {
    settings: s,
    panelPosition: pos,
    rotationHistory: history,
    detectorLogs: logs,
    pinnedNote: note,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `idle-export-${today}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function onAdvancedToggle(e: Event) {
  if ((e.target as HTMLDetailsElement).open) {
    const [s, pos, history, logs, note] = await Promise.all([
      db.settings.toArray(),
      db.panelPosition.toArray(),
      db.rotationHistory.toArray(),
      db.detectorLogs.toArray(),
      db.pinnedNote.toArray(),
    ]);
    rawDexieData = JSON.stringify(
      {
        settings: s,
        panelPosition: pos,
        rotationHistory: history,
        detectorLogs: logs,
        pinnedNote: note,
      },
      null,
      2,
    );
  }
}

function openShortcuts() {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}
</script>

<div class="options">
  {#if hotkeyConflict}
    <div class="banner" role="alert">
      <span class="banner-msg">Hotkey unset — manual toggle won't fire.</span>
      <button class="banner-link" onclick={openShortcuts}>Set shortcut →</button>
    </div>
  {/if}

  <div class="page-header">
    <h1 class="page-title">Idle Settings</h1>
  </div>

  {#if settings}
    <!-- ── Sites ───────────────────────────────────────────────────────── -->
    <section class="section">
      <h2 class="section-title">Sites</h2>
      <div class="control-list">
        {#each KNOWN_SITES as site}
          <div class="row">
            <span class="row-label">{site}</span>
            <button
              class="toggle"
              class:on={isSiteEnabled(site)}
              onclick={() => toggleSite(site)}
              aria-pressed={isSiteEnabled(site)}
              aria-label={isSiteEnabled(site) ? `Disable Idle on ${site}` : `Enable Idle on ${site}`}
            >
              {isSiteEnabled(site) ? 'On' : 'Off'}
            </button>
          </div>
        {/each}
      </div>
    </section>

    <!-- ── Activity categories ─────────────────────────────────────────── -->
    <section class="section">
      <h2 class="section-title">Activity Categories</h2>
      <div class="control-list">
        {#each ALL_CATEGORIES as cat}
          {@const enabled = isCategoryEnabled(cat)}
          {@const warning = enabled ? getDisableWarning(cat) : null}
          <div class="category-row">
            <div class="row">
              <span class="row-label">{CATEGORY_LABELS[cat]}</span>
              <button
                class="toggle"
                class:on={enabled}
                onclick={() => toggleCategory(cat)}
                aria-pressed={enabled}
                aria-label={enabled ? `Disable ${CATEGORY_LABELS[cat]}` : `Enable ${CATEGORY_LABELS[cat]}`}
              >
                {enabled ? 'On' : 'Off'}
              </button>
            </div>
            {#if warning}
              <p class="warning-text" role="alert">{warning}</p>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- ── Rotation interval ───────────────────────────────────────────── -->
    <section class="section">
      <h2 class="section-title">Rotation Reset Interval</h2>
      <p class="section-desc">How often the activity pool resets to prevent repetition.</p>
      <select
        class="select"
        value={settings.rotationWindowHours}
        onchange={(e) => set('rotationWindowHours', Number((e.target as HTMLSelectElement).value))}
        aria-label="Rotation reset interval"
      >
        <option value={1}>1 hour</option>
        <option value={2}>2 hours</option>
        <option value={4}>4 hours</option>
        <option value={8}>8 hours</option>
        <option value={0}>Browser session</option>
      </select>
    </section>

    <!-- ── Panel position ─────────────────────────────────────────────── -->
    <section class="section">
      <h2 class="section-title">Panel Position</h2>
      <div class="row">
        <span class="row-label">Saved corner: <strong>{panelCorner}</strong></span>
        <button class="action-btn" onclick={resetPanelPosition}>Reset to default</button>
      </div>
    </section>

    <!-- ── Badge style ────────────────────────────────────────────────── -->
    <section class="section">
      <h2 class="section-title">Toolbar Badge</h2>
      <select
        class="select"
        value={settings.badgeStyle}
        onchange={(e) =>
          set('badgeStyle', (e.target as HTMLSelectElement).value as 'none' | 'active' | 'mute')}
        aria-label="Toolbar badge style"
      >
        <option value="none">None</option>
        <option value="active">Active indicator</option>
        <option value="mute">Mute indicator</option>
      </select>
    </section>

    <!-- ── Prompt capture ─────────────────────────────────────────────── -->
    <section class="section">
      <h2 class="section-title">Prompt Capture</h2>
      <div class="row">
        <div class="label-stack">
          <span class="row-label">Show your prompt in Context activities</span>
          <span class="sublabel">Current message only — stored locally for this session, never transmitted</span>
        </div>
        <button
          class="toggle"
          class:on={settings.promptCapture}
          onclick={() => set('promptCapture', !settings!.promptCapture)}
          aria-pressed={settings.promptCapture}
          aria-label={settings.promptCapture ? 'Disable prompt capture' : 'Enable prompt capture'}
        >
          {settings.promptCapture ? 'On' : 'Off'}
        </button>
      </div>
    </section>

    <!-- ── Detector status ────────────────────────────────────────────── -->
    <section class="section">
      <div class="section-header-row">
        <h2 class="section-title">Detector Status</h2>
        <button class="action-btn" onclick={clearDetectorLogs}>Clear logs</button>
      </div>
      <div class="table-wrap">
        <table class="detector-table">
          <thead>
            <tr>
              <th>Site</th>
              <th>Selector version</th>
              <th>Last verified</th>
              <th>Failures (7d)</th>
            </tr>
          </thead>
          <tbody>
            {#each detectorStatuses as d}
              <tr>
                <td>{d.site}</td>
                <td class="mono">{d.providerVersion}</td>
                <td class="mono">{d.lastVerified}</td>
                <td class:failures-nonzero={d.failures > 0}>{d.failures}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Export ─────────────────────────────────────────────────────── -->
    <section class="section">
      <h2 class="section-title">Data</h2>
      <button class="action-btn" onclick={exportData}>Export local data as JSON</button>
    </section>

    <!-- ── Advanced settings ──────────────────────────────────────────── -->
    <!-- svelte-ignore a11y_no_redundant_roles -->
    <details class="advanced" ontoggle={onAdvancedToggle} role="group">
      <summary class="advanced-summary">Advanced Settings</summary>

      <div class="advanced-body">
        <!-- Log retention -->
        <div class="adv-row">
          <label class="adv-label" for="log-retention">Log retention period</label>
          <select
            id="log-retention"
            class="select select-sm"
            value={settings.logRetentionDays}
            onchange={(e) =>
              set('logRetentionDays', Number((e.target as HTMLSelectElement).value))}
          >
            <option value={1}>1 day</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>

        <!-- Log entry cap -->
        <div class="adv-row">
          <label class="adv-label" for="log-cap">Log entry cap per detector</label>
          <input
            id="log-cap"
            type="number"
            class="num-input"
            min="10"
            max="5000"
            value={settings.logEntryCap}
            onchange={(e) => set('logEntryCap', Number((e.target as HTMLInputElement).value))}
          />
        </div>

        <!-- Rotation N -->
        <div class="adv-row">
          <label class="adv-label" for="rotation-n">
            Rotation window N
            <span class="adv-hint">Activities seen in the last N sessions are skipped in selection.</span>
          </label>
          <input
            id="rotation-n"
            type="number"
            class="num-input"
            min="1"
            max="500"
            value={settings.windowN}
            onchange={(e) => set('windowN', Number((e.target as HTMLInputElement).value))}
          />
        </div>

        <!-- Raw Dexie inspector -->
        <div class="adv-section">
          <h3 class="adv-heading">Raw data inspector</h3>
          <pre class="raw-data">{rawDexieData || 'Loading...'}</pre>
        </div>

        <!-- About -->
        <div class="adv-section">
          <h3 class="adv-heading">About</h3>
          <p class="about-line">Idle — AI wait time micro-recovery activities</p>
          <p class="about-line">Version 0.0.1</p>
          <h4 class="citations-heading">Research citations</h4>
          <ul class="citations">
            {#each CITATIONS as c}
              <li class="citation"><strong>{c.key}:</strong> {c.text}</li>
            {/each}
          </ul>
        </div>
      </div>
    </details>
  {:else}
    <p class="loading">Loading settings…</p>
  {/if}
</div>

<style>
  .options {
    max-width: 640px;
    margin: 0 auto;
    padding: 32px 24px 64px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ── Hotkey conflict banner ──────────────────────────────────────── */
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: #f5ede0;
    border: 1px solid #e8d5b7;
    border-radius: 4px;
    margin-bottom: 24px;
    font-size: 13px;
    color: #5a4a30;
  }

  .banner-msg {
    flex: 1;
  }

  .banner-link {
    background: none;
    border: none;
    color: #7a5a20;
    cursor: pointer;
    font-size: 13px;
    padding: 4px 8px;
    min-height: 44px;
    min-width: 44px;
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
  }

  .banner-link:hover {
    color: #5a3a00;
  }

  .banner-link:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
    border-radius: 2px;
  }

  /* ── Page header ─────────────────────────────────────────────────── */
  .page-header {
    margin-bottom: 32px;
  }

  .page-title {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
    letter-spacing: -0.01em;
  }

  /* ── Section ─────────────────────────────────────────────────────── */
  .section {
    padding: 20px 0;
    border-top: 1px solid #e8e8e8;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    font-size: 15px;
    font-weight: 600;
    color: #1a1a1a;
  }

  .section-desc {
    font-size: 13px;
    color: #777;
    margin-top: -4px;
  }

  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  /* ── Rows ────────────────────────────────────────────────────────── */
  .control-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 44px;
  }

  .row-label {
    font-size: 13px;
    color: #444;
    flex: 1;
  }

  .label-stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .sublabel {
    font-size: 11px;
    color: #888;
  }

  /* ── Toggle button ───────────────────────────────────────────────── */
  .toggle {
    min-width: 56px;
    min-height: 44px;
    padding: 5px 14px;
    border-radius: 20px;
    border: 1px solid #ccc;
    background: #eee;
    color: #777;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background 150ms,
      color 150ms,
      border-color 150ms;
  }

  .toggle.on {
    background: #5b9e9a;
    border-color: #4a8a86;
    color: #fff;
  }

  .toggle:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }

  /* ── Category rows ───────────────────────────────────────────────── */
  .category-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .warning-text {
    font-size: 11px;
    color: #a06020;
    padding-left: 4px;
  }

  /* ── Select ──────────────────────────────────────────────────────── */
  .select {
    height: 44px;
    padding: 0 12px;
    border: 1px solid #d8d8d8;
    border-radius: 4px;
    background: #f2f2f0;
    color: #333;
    font-size: 13px;
    cursor: pointer;
    min-width: 180px;
  }

  .select:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }

  .select-sm {
    min-width: 140px;
  }

  /* ── Number input ────────────────────────────────────────────────── */
  .num-input {
    height: 44px;
    padding: 0 12px;
    border: 1px solid #d8d8d8;
    border-radius: 4px;
    background: #f2f2f0;
    color: #333;
    font-size: 13px;
    width: 100px;
  }

  .num-input:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }

  /* ── Action button ───────────────────────────────────────────────── */
  .action-btn {
    min-height: 44px;
    padding: 5px 14px;
    border-radius: 4px;
    border: 1px solid #d8d8d8;
    background: #f2f2f0;
    color: #444;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .action-btn:hover {
    background: #eaeae8;
  }

  .action-btn:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
  }

  /* ── Detector table ──────────────────────────────────────────────── */
  .table-wrap {
    overflow-x: auto;
  }

  .detector-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .detector-table th {
    text-align: left;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #e8e8e8;
  }

  .detector-table td {
    padding: 10px 12px;
    color: #444;
    border-bottom: 1px solid #f0f0ee;
  }

  .mono {
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
    font-size: 12px;
  }

  .failures-nonzero {
    color: #a06020;
    font-weight: 500;
  }

  /* ── Advanced section ────────────────────────────────────────────── */
  .advanced {
    border-top: 1px solid #e8e8e8;
    margin-top: 4px;
  }

  .advanced-summary {
    display: flex;
    align-items: center;
    padding: 20px 0;
    font-size: 15px;
    font-weight: 600;
    color: #1a1a1a;
    cursor: pointer;
    list-style: none;
    user-select: none;
    gap: 8px;
  }

  .advanced-summary::-webkit-details-marker {
    display: none;
  }

  .advanced-summary::before {
    content: '▶';
    font-size: 10px;
    color: #888;
    transition: transform 150ms;
    display: inline-block;
  }

  .advanced[open] .advanced-summary::before {
    transform: rotate(90deg);
  }

  .advanced-summary:focus-visible {
    outline: 2px solid #5b9e9a;
    outline-offset: 2px;
    border-radius: 2px;
  }

  .advanced-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 24px;
  }

  .adv-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .adv-label {
    font-size: 13px;
    color: #444;
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .adv-hint {
    font-size: 11px;
    color: #888;
    font-weight: 400;
  }

  .adv-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .adv-heading {
    font-size: 13px;
    font-weight: 600;
    color: #555;
  }

  .raw-data {
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
    font-size: 11px;
    color: #555;
    background: #f2f2f0;
    border: 1px solid #e8e8e8;
    border-radius: 4px;
    padding: 12px;
    overflow-x: auto;
    max-height: 320px;
    overflow-y: auto;
    white-space: pre;
    line-height: 1.5;
  }

  .about-line {
    font-size: 13px;
    color: #555;
  }

  .citations-heading {
    font-size: 12px;
    font-weight: 600;
    color: #777;
    margin-top: 4px;
  }

  .citations {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .citation {
    font-size: 12px;
    color: #666;
    line-height: 1.5;
  }

  /* ── Loading ─────────────────────────────────────────────────────── */
  .loading {
    font-size: 13px;
    color: #888;
    padding: 32px 0;
  }
</style>
