<script lang="ts">
import type { ActivityCategory } from '@idle/core/activities/catalog';
import type { Activity } from '@idle/core/activities/catalog';
import { rotationWindowExpired } from '@idle/core/activities/rotation';
import { selectActivity } from '@idle/core/activities/selector';
import { elapsedToBand } from '@idle/core/detection/bands';
import type { WaitBand } from '@idle/core/detection/types';
import { onMount } from 'svelte';

// Incoming props
interface PanelProps {
  siteOffset?: { x: number; y: number };
}
const { siteOffset = { x: 0, y: 0 } }: PanelProps = $props();
import {
  type Corner,
  addToRotationHistory,
  clearRotationHistory,
  getPanelCorner,
  getPinnedNote,
  getRotationHistory,
  getSettings,
  saveSettings,
} from '../../../lib/store/storage';
import ActivityCard from './ActivityCard.svelte';
import DragHandle from './DragHandle.svelte';
import MuteButton from './MuteButton.svelte';
import SkipButton from './SkipButton.svelte';
import WriteOnlyTextarea from './WriteOnlyTextarea.svelte';

// ── Motion + timing ───────────────────────────────────────────────────────
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEBOUNCE_MS = 500;
const FADE_IN_MS = prefersReduced ? 0 : 1500;
const FADE_OUT_MS = prefersReduced ? 0 : 400;

// ── Dark mode ─────────────────────────────────────────────────────────────
const hostDark =
  document.body.classList.contains('dark') ||
  document.documentElement.getAttribute('data-theme') === 'dark' ||
  document.documentElement.classList.contains('dark');
const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const dark = hostDark || sysDark;

// ── Panel visibility ──────────────────────────────────────────────────────
let visible = $state(false);
let opacity = $state(0);
let fadingOut = $state(false);
let mutedForWait = $state(false);

// ── Timers ────────────────────────────────────────────────────────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let fadeOutTimer: ReturnType<typeof setTimeout> | null = null;

// ── Activity state ────────────────────────────────────────────────────────
let waitStartedAt = $state<number | null>(null);
let currentActivity = $state<Activity | null>(null);
let currentBand = $state<WaitBand | 'unknown'>('unknown');
let pinnedNoteText = $state('');
let pinnedNoteActive = $state(false);

// ── Position ──────────────────────────────────────────────────────────────
const PANEL_W = 320;
const PANEL_H = 200;
const MARGIN = 16;

let corner = $state<Corner>('bottom-right');
// biome-ignore lint/style/useConst: mutated via bind:dragging in template (DragHandle)
let dragging = $state(false);
let dragX = $state(0);
let dragY = $state(0);

function cornerToXY(c: Corner): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ox = siteOffset.x;
  const oy = siteOffset.y; // negative = move up; applied to bottom corners only
  switch (c) {
    case 'top-left':
      return { x: MARGIN, y: MARGIN };
    case 'top-right':
      return { x: vw - PANEL_W - MARGIN, y: MARGIN };
    case 'bottom-left':
      return { x: MARGIN + ox, y: vh - PANEL_H - MARGIN + oy };
    case 'bottom-right':
      return { x: vw - PANEL_W - MARGIN + ox, y: vh - PANEL_H - MARGIN + oy };
  }
}

// Live position: during drag use raw coordinates; otherwise derive from corner
const panelX = $derived(dragging ? dragX : cornerToXY(corner).x);
const panelY = $derived(dragging ? dragY : cornerToXY(corner).y);

// Sync drag start position when drag begins
$effect(() => {
  if (!dragging) {
    const pos = cornerToXY(corner);
    dragX = pos.x;
    dragY = pos.y;
  }
});

// ── Init from Dexie ───────────────────────────────────────────────────────
onMount(async () => {
  const [settings, savedCorner, pinned] = await Promise.all([
    getSettings(),
    getPanelCorner(),
    getPinnedNote(),
  ]);
  corner = savedCorner;
  if (pinned !== null) {
    pinnedNoteText = pinned;
    pinnedNoteActive = true;
  }
  // Seed drag coords to match initial corner
  const pos = cornerToXY(savedCorner);
  dragX = pos.x;
  dragY = pos.y;
});

// ── Show / Hide ───────────────────────────────────────────────────────────
function showPanel() {
  if (mutedForWait) return;
  if (fadeOutTimer !== null) {
    clearTimeout(fadeOutTimer);
    fadeOutTimer = null;
  }
  fadingOut = false;
  visible = true;
  opacity = 0;
  // requestAnimationFrame ensures the browser registers opacity=0 before transition starts
  requestAnimationFrame(() => {
    opacity = 1;
  });
}

function hidePanel() {
  if (!visible) return;
  fadingOut = true;
  opacity = 0;
  fadeOutTimer = setTimeout(
    () => {
      fadeOutTimer = null;
      visible = false;
      fadingOut = false;
      currentActivity = null;
      mutedForWait = false;
      waitStartedAt = null;
    },
    prefersReduced ? 0 : FADE_OUT_MS,
  );
}

// ── Wait event API (called from content/index.ts) ──────────────────────────
export function handleWaitStart(at: number) {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  mutedForWait = false;
  waitStartedAt = at;

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;

    const settings = await getSettings();
    if (Date.now() < settings.muteUntil) return;

    // Time-window rotation reset
    const now = Date.now();
    if (settings.rotationWindowHours > 0 && settings.lastResetAt === 0) {
      await saveSettings({ lastResetAt: now });
    } else if (rotationWindowExpired(settings.rotationWindowHours, settings.lastResetAt, now)) {
      await clearRotationHistory();
      await saveSettings({ lastResetAt: now });
    }

    const history = await getRotationHistory();
    const band = elapsedToBand(Date.now() - at);
    currentBand = band;

    const activity = selectActivity({
      band,
      history,
      windowN: settings.windowN,
      disabledCategories: new Set(settings.disabledCategories as ActivityCategory[]),
    });

    if (!activity) return;
    currentActivity = activity;
    await addToRotationHistory(activity.id);
    showPanel();
  }, DEBOUNCE_MS);
}

export function handleWaitEnd() {
  if (debounceTimer !== null) {
    // wait_end within debounce window — suppress entirely
    clearTimeout(debounceTimer);
    debounceTimer = null;
    return;
  }
  hidePanel();
}

// ── Skip ──────────────────────────────────────────────────────────────────
async function handleSkip() {
  const settings = await getSettings();
  const history = await getRotationHistory();
  const activity = selectActivity({
    band: currentBand,
    history,
    windowN: settings.windowN,
    disabledCategories: new Set(settings.disabledCategories as ActivityCategory[]),
  });
  if (!activity) return;
  currentActivity = activity;
  await addToRotationHistory(activity.id);
}

// ── Mute ──────────────────────────────────────────────────────────────────
function handleMuteWait() {
  mutedForWait = true;
  hidePanel();
}

// ── Keyboard ──────────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible) {
    hidePanel();
  }
}

function onCornerChange(c: Corner) {
  corner = c;
}

// Expose for testing
export { visible };
</script>

<svelte:window onkeydown={onKeyDown} />

{#if visible}
  <div
    class="idle-panel"
    class:dark
    style:left="{panelX}px"
    style:top="{panelY}px"
    style:opacity
    style:transition={prefersReduced
      ? 'none'
      : fadingOut
        ? `opacity ${FADE_OUT_MS}ms ease`
        : `opacity ${FADE_IN_MS}ms ease`}
    role="region"
    aria-label="Idle activity suggestion"
  >
    <DragHandle {corner} bind:dragging bind:dragX bind:dragY {onCornerChange} />

    {#if currentActivity}
      <ActivityCard activity={currentActivity} band={currentBand} />

      <div class="panel-actions">
        <SkipButton onSkip={handleSkip} />
        <MuteButton onMuteWait={handleMuteWait} />
      </div>

      {#if currentActivity.category === 'WriteOnly'}
        <WriteOnlyTextarea
          initialText={pinnedNoteActive ? pinnedNoteText : ''}
          initialPinned={pinnedNoteActive}
        />
      {/if}
    {/if}
  </div>
{/if}

<style>
  :global(*) {
    box-sizing: border-box;
  }

  .idle-panel {
    position: fixed;
    z-index: 2147483647;
    width: 320px;
    min-height: 160px;
    max-width: calc(100vw - 32px);
    padding: 12px 16px 8px;

    /* Light theme defaults (CSS custom properties scoped to panel root) */
    --idle-bg: #fafafa;
    --idle-surface-alt: #f3f3f3;
    --idle-primary: #1a1a1a;
    --idle-secondary: #3a3a3a;
    --idle-muted: #888;
    --idle-border: rgba(0, 0, 0, 0.08);
    --idle-accent: #3d8b7a;
    --idle-accent-fg: #fff;

    background: var(--idle-bg);
    border: 1px solid var(--idle-border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      system-ui,
      sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--idle-primary);
  }

  .idle-panel.dark {
    --idle-bg: #1e1e1e;
    --idle-surface-alt: #2a2a2a;
    --idle-primary: #e8e8e8;
    --idle-secondary: #c0c0c0;
    --idle-muted: #7a7a7a;
    --idle-border: rgba(255, 255, 255, 0.1);
    --idle-accent: #5bab96;
    --idle-accent-fg: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .panel-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid var(--idle-border);
  }
</style>
