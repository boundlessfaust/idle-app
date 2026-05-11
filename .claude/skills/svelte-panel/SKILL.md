---
name: svelte-panel
description: >
  Use when creating or modifying Svelte 5 components in the browser extension's
  content script UI (apps/browser-extension/entrypoints/content/ui/).
  Covers shadow DOM injection, the Kindle aesthetic, accessibility requirements,
  animation constraints, the 50KB bundle budget, dark mode, and the floating
  panel position/drag system.
compatibility: >
  Claude Code. Requires WXT + Svelte 5 (rune mode) + Tailwind CSS.
  Content script environment — no access to host page's JS globals.
---

## Shadow DOM Injection (mandatory)

The panel MUST be injected into a shadow DOM root to prevent CSS bleed from the host site.

```typescript
// apps/browser-extension/entrypoints/content/index.ts
export default defineContentScript({
  matches: ['*://claude.ai/*', '*://chatgpt.com/*', ...],
  cssInjectionMode: 'ui',  // WXT handles shadow root creation

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'idle-panel',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        const app = mount(Panel, { target: container });
        return app;
      },
      onRemove(app) {
        if (app) unmount(app);
      },
    });
    ui.mount();
  },
});
```

NEVER inject directly into `document.body` or query the host page's DOM from UI code.

## Aesthetic Constraints — "Kindle, not Duolingo"

| ✅ Do | ❌ Never |
|---|---|
| Low contrast surfaces | Bright accent colors |
| Single muted action color | Multiple competing colors |
| Plain text, no icons for decoration | Icons that demand attention |
| Generous whitespace | Dense information layouts |
| Quiet fade animations | Slides, bounces, pops |
| Neutral grays + one teal accent max | Gradients, glows, color fills on cards |

**Panel visual hierarchy:**
1. Activity body text (primary — most readable)
2. Activity title (secondary)
3. Skip / Mute controls (tertiary — visually recessive)
4. Panel border (nearly invisible — 1px, high alpha)

## Component Inventory

```
entrypoints/content/ui/
├── Panel.svelte               # Root; manages show/hide, fade, position
├── ActivityCard.svelte        # Displays one activity (title + body + duration hint)
├── SkipButton.svelte          # Cycles within band; never escalates band
├── MuteButton.svelte          # "Mute for this wait" (in-memory) + "Mute 1h" (Dexie)
├── WriteOnlyTextarea.svelte   # WriteOnly category only; includes PinButton
├── DragHandle.svelte          # Free-float drag; saves {x,y} to Dexie; "Reset" action
└── PromptCaptureNudge.svelte  # One-time inline nudge; privacy copy required
```

## Panel Lifecycle & Timing

```
User sends prompt
  └─ Provider fires wait_start
       └─ 500ms debounce timer starts
            ├─ wait_end fires within 500ms → cancel, render nothing
            └─ 500ms elapsed → 1500ms fade-in begins → panel visible
                  └─ wait_end fires → 400ms fade-out → panel hidden
```

Implement with Svelte 5 runes:

```svelte
<!-- Panel.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let visible = $state(false);
  let opacity = $state(0);

  // Respect prefers-reduced-motion
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FADE_IN_MS = prefersReduced ? 0 : 1500;
  const FADE_OUT_MS = prefersReduced ? 0 : 400;

  export function show() {
    visible = true;
    requestAnimationFrame(() => { opacity = 1; });
  }

  export function hide() {
    opacity = 0;
    setTimeout(() => { visible = false; }, prefersReduced ? 0 : FADE_OUT_MS);
  }
</script>

{#if visible}
  <div
    class="idle-panel"
    style:opacity
    style:transition={prefersReduced ? 'none' : `opacity ${FADE_OUT_MS}ms ease`}
    role="region"
    aria-label="Idle activity suggestion"
    aria-live="polite"
  >
    <slot />
  </div>
{/if}
```

## Floating Position & Drag

```svelte
<!-- DragHandle.svelte -->
<script lang="ts">
  import { panelPositionStore } from '../../../lib/store/settings';

  let dragging = $state(false);
  let startPos = { x: 0, y: 0 };

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    startPos = { x: e.clientX - $panelPositionStore.x, y: e.clientY - $panelPositionStore.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - 320, e.clientX - startPos.x));
    const y = Math.max(0, Math.min(window.innerHeight - 200, e.clientY - startPos.y));
    panelPositionStore.set({ x, y });
  }

  function onPointerUp() {
    dragging = false;
    // Persist to Dexie via store
    panelPositionStore.persist();
  }

  function resetPosition() {
    panelPositionStore.set({ x: window.innerWidth - 340, y: window.innerHeight - 220 });
    panelPositionStore.persist();
  }
</script>

<div
  class="drag-handle"
  role="button"
  aria-label="Drag to reposition panel"
  tabindex="0"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
>
  <button class="reset-btn" onclick={resetPosition} aria-label="Reset panel position">↩</button>
  <slot />
</div>
```

Panel CSS uses `position: fixed` with `left` and `top` driven by the store.
On `ResizeObserver` viewport change: clamp to in-bounds WITHOUT overwriting the saved Dexie value.

## Dark Mode

```svelte
<script lang="ts">
  // Check host site theme first, fall back to system preference
  const hostDark = document.body.classList.contains('dark')
    || document.documentElement.getAttribute('data-theme') === 'dark'
    || document.documentElement.classList.contains('dark');
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = $state(hostDark || sysDark);
</script>

<div class:dark>
  <!-- Tailwind dark: variants work from here -->
</div>
```

## Accessibility Requirements (non-negotiable)
- Panel root: `role="region"` + `aria-label="Idle activity suggestion"`
- `aria-live="polite"` on the activity card — screen readers announce new activity
- Keyboard: Tab → Skip → Mute → (Textarea if WriteOnly). Escape → dismiss panel.
- All interactive elements: minimum 44×44px tap target
- Focus ring visible on all interactive elements (do not suppress `:focus-visible`)
- Respect `prefers-reduced-motion` — set transition durations to 0ms, not `display: none` hacks

## Keyboard Dismiss

```svelte
<svelte:window onkeydown={(e) => { if (e.key === 'Escape') hide(); }} />
```

## PromptCaptureNudge Copy (exact — do not rephrase)

```
"Want to see your prompt here? Stored locally for this session only — nothing leaves your browser."
[Enable]  [Dismiss]
```

"Enable" → writes `settings.promptCapture = true` to Dexie immediately.
"Dismiss" → writes `settings.promptCaptureNudgeDismissed = true`; never shown again.
Show only once; check `promptCaptureNudgeDismissed` from settings store before rendering.

## Bundle Budget

Content script (all JS + CSS injected into host page) MUST stay under **50KB gzipped**.

Check after each phase:
```bash
bun run build
gzip -c apps/browser-extension/.output/chrome-mv3/content-scripts/content.js | wc -c
```

If budget is exceeded:
1. Check for accidentally bundled large dependencies
2. Verify Tailwind purge is running (only used classes should be in output)
3. Consider dynamic import for WriteOnlyTextarea (only needed for WriteOnly activities)

## Checklist Before Submitting a Panel PR
- [ ] Shadow DOM injection via WXT `createShadowRootUi`
- [ ] No direct `document.body` queries from UI components
- [ ] `prefers-reduced-motion` disables all transitions
- [ ] `aria-live="polite"` on activity card
- [ ] Keyboard: Tab order correct, Escape dismisses
- [ ] Dark mode works (host class check + system fallback)
- [ ] Bundle size checked — under 50KB gzipped
- [ ] `bun run lint` passes
