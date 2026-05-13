<script lang="ts">
import { type Corner, savePanelCorner } from '../../../lib/store/storage';

export type { Corner };

const PANEL_W = 320;
const PANEL_H = 200;

interface Props {
  corner: Corner;
  dragging?: boolean;
  dragX?: number;
  dragY?: number;
  onCornerChange: (c: Corner) => void;
}

let {
  corner,
  dragging = $bindable(false),
  dragX = $bindable(0),
  dragY = $bindable(0),
  onCornerChange,
}: Props = $props();

let startClientX = 0;
let startClientY = 0;
let startPanelX = 0;
let startPanelY = 0;

function nearestCorner(x: number, y: number): Corner {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const panelCx = x + PANEL_W / 2;
  const panelCy = y + PANEL_H / 2;
  if (panelCx < cx) {
    return panelCy < cy ? 'top-left' : 'bottom-left';
  }
  return panelCy < cy ? 'top-right' : 'bottom-right';
}

function onPointerDown(e: PointerEvent) {
  if ((e.target as Element).closest('button')) return;
  dragging = true;
  startClientX = e.clientX;
  startClientY = e.clientY;
  startPanelX = dragX;
  startPanelY = dragY;
  (e.currentTarget as Element).setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  dragX = Math.max(
    0,
    Math.min(window.innerWidth - PANEL_W, startPanelX + (e.clientX - startClientX)),
  );
  dragY = Math.max(
    0,
    Math.min(window.innerHeight - PANEL_H, startPanelY + (e.clientY - startClientY)),
  );
}

async function onPointerUp() {
  if (!dragging) return;
  dragging = false;
  const snapped = nearestCorner(dragX, dragY);
  onCornerChange(snapped);
  await savePanelCorner(snapped);
}

async function resetPosition() {
  const defaultCorner: Corner = 'bottom-right';
  onCornerChange(defaultCorner);
  await savePanelCorner(defaultCorner);
}
</script>

<div
  class="drag-handle"
  role="button"
  tabindex="0"
  aria-label="Drag to reposition panel"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
>
  <button
    class="reset-btn"
    onclick={resetPosition}
    aria-label="Reset panel position to default corner"
    title="Reset position"
  >
    ↩
  </button>
</div>

<style>
  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    cursor: grab;
    height: 28px;
    touch-action: none;
    user-select: none;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .drag-handle:focus-visible {
    outline: 2px solid var(--idle-accent);
    outline-offset: 2px;
    border-radius: 3px;
  }

  .reset-btn {
    opacity: 0;
    padding: 4px 6px;
    min-height: 44px;
    min-width: 44px;
    background: none;
    border: none;
    font-size: 14px;
    color: var(--idle-muted);
    cursor: pointer;
    transition: opacity 150ms ease;
    font-family: inherit;
  }

  .drag-handle:hover .reset-btn,
  .reset-btn:focus-visible {
    opacity: 1;
  }

  .reset-btn:focus-visible {
    outline: 2px solid var(--idle-accent);
    outline-offset: 2px;
    border-radius: 3px;
  }
</style>
