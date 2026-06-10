import {
  SITES,
  expect,
  navigateToFixture,
  resetStorage,
  setEnabled,
  setMuteUntil,
  setSiteEnabled,
  test,
  triggerAndWaitForPanel,
  waitForPanelHidden,
  waitForPanelVisible,
} from './helpers/extension';

for (const site of SITES) {
  test.describe(`${site.key} — panel`, () => {
    test.beforeEach(async ({ extContext, page }) => {
      await resetStorage(extContext);
      // Disable CSS transitions so timing assertions are deterministic
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await navigateToFixture(page, site);
    });

    // ── 1. Panel appearance ───────────────────────────────────────────────────

    test('panel hidden during 500 ms debounce then visible after wait_start', async ({ page }) => {
      // Before streaming: panel should not exist in shadow DOM
      const shadowHostCount = await page.locator('idle-panel').count();
      expect(shadowHostCount).toBeGreaterThan(0); // content script loaded

      const panelBefore = await page.locator('idle-panel').locator('.idle-panel').isVisible();
      expect(panelBefore).toBe(false);

      await site.triggerStreaming(page);

      // Immediately: still within 500 ms debounce — must NOT show yet
      const duringDebounce = await page.locator('idle-panel').locator('.idle-panel').isVisible();
      expect(duringDebounce).toBe(false);

      // After debounce elapses the panel should appear
      await waitForPanelVisible(page);

      // Panel has correct ARIA landmarks
      await expect(
        page.locator('[role="region"][aria-label="Idle activity suggestion"]'),
      ).toBeVisible();
    });

    test('panel appears ~500 ms after streaming starts — single debounce only', async ({
      page,
    }) => {
      await site.triggerStreaming(page);

      // One 500 ms debounce (in the provider) plus messaging/selection slack.
      // A second stacked debounce in the Panel would push this past 1 000 ms.
      await page.waitForTimeout(850);
      const visibleAt850 = await page.locator('idle-panel').locator('.idle-panel').isVisible();
      expect(visibleAt850).toBe(true);
    });

    // ── 2. Panel dismissal ────────────────────────────────────────────────────

    test('panel fades out after wait_end', async ({ page }) => {
      await triggerAndWaitForPanel(page, site);

      await site.stopStreaming(page);

      await waitForPanelHidden(page);
    });

    // ── 3. Skip behaviour ─────────────────────────────────────────────────────

    test('Skip cycles to a new activity within the same band', async ({ page }) => {
      await triggerAndWaitForPanel(page, site);

      const bodyBefore = await page.locator('idle-panel').locator('.card-body').textContent();

      await page
        .locator('idle-panel')
        .locator('button[aria-label="Skip to next activity"]')
        .click();

      // Activity card updates asynchronously — wait for text to change
      await expect(page.locator('idle-panel').locator('.card-body')).not.toHaveText(
        bodyBefore ?? '',
        { timeout: 5_000 },
      );

      // Panel stays visible
      await expect(page.locator('idle-panel').locator('.idle-panel')).toBeVisible();
    });

    // ── 4. Mute for this wait ─────────────────────────────────────────────────

    test('Mute for this wait hides panel; next wait_start shows it again', async ({
      page,
      extContext,
    }) => {
      await triggerAndWaitForPanel(page, site);

      // Open mute menu
      await page.locator('idle-panel').locator('button', { hasText: 'Mute' }).click();
      await page.locator('idle-panel').locator('button', { hasText: 'Mute for this wait' }).click();

      await waitForPanelHidden(page);

      // Stop streaming, brief pause, start again — mute was single-wait only
      await site.stopStreaming(page);
      await page.waitForTimeout(300);

      await site.triggerStreaming(page);
      await waitForPanelVisible(page);
    });

    // ── 5. Mute for 1 hour ────────────────────────────────────────────────────

    test('muteUntil in storage suppresses panel on wait_start', async ({ page, extContext }) => {
      await setMuteUntil(extContext, Date.now() + 3_600_000);
      await page.waitForTimeout(150); // let storage write settle

      await site.triggerStreaming(page);

      // After debounce window panel must NOT appear
      await page.waitForTimeout(800);
      await expect(page.locator('idle-panel').locator('.idle-panel')).not.toBeVisible();
    });

    // ── 6. Keyboard dismissal ─────────────────────────────────────────────────

    test('Escape key hides panel; aria-live region had activity text', async ({ page }) => {
      await triggerAndWaitForPanel(page, site);

      // Verify aria-live region exists with content
      const liveRegion = page.locator('idle-panel').locator('[aria-live="polite"]');
      await expect(liveRegion).toBeVisible();
      const bodyText = await page.locator('idle-panel').locator('.card-body').textContent();
      expect(bodyText?.trim().length).toBeGreaterThan(0);

      // Dismiss with Escape
      await page.keyboard.press('Escape');

      await waitForPanelHidden(page);
    });

    // ── 7. Master toggle OFF ──────────────────────────────────────────────────

    test('settings.enabled = false suppresses panel on wait_start', async ({
      page,
      extContext,
    }) => {
      await setEnabled(extContext, false);
      await page.waitForTimeout(150);

      await site.triggerStreaming(page);

      await page.waitForTimeout(800);
      await expect(page.locator('idle-panel').locator('.idle-panel')).not.toBeVisible();
    });

    // ── 9. Per-site toggle OFF ────────────────────────────────────────────────

    test('siteEnabled[hostname]=false suppresses panel on wait_start', async ({
      page,
      extContext,
    }) => {
      // The fixture page sets data-idle-site on body to identify the target hostname
      const hostname = await page.evaluate(
        () => document.body.dataset.idleSite ?? window.location.hostname,
      );
      await setSiteEnabled(extContext, hostname, false);
      await page.waitForTimeout(150);

      await site.triggerStreaming(page);

      await page.waitForTimeout(800);
      await expect(page.locator('idle-panel').locator('.idle-panel')).not.toBeVisible();
    });

    // ── 8. Shadow DOM isolation ───────────────────────────────────────────────

    test('panel is in shadow DOM; host-page styles do not pierce it', async ({ page }) => {
      await triggerAndWaitForPanel(page, site);

      // Shadow host must exist with an open shadow root
      const isShadowHost = await page.evaluate(() => {
        const host = document.querySelector('idle-panel');
        return host instanceof HTMLElement && host.shadowRoot instanceof ShadowRoot;
      });
      expect(isShadowHost).toBe(true);

      // .idle-panel must NOT be a direct descendant of document.body
      const directInBody = await page.evaluate(
        () => document.body.querySelector('.idle-panel') !== null,
      );
      expect(directInBody).toBe(false);

      // .idle-panel IS inside the shadow root
      const inShadow = await page.evaluate(() => {
        const host = document.querySelector('idle-panel');
        return !!host?.shadowRoot?.querySelector('.idle-panel');
      });
      expect(inShadow).toBe(true);

      // Host-page CSS must not bleed through shadow boundary
      await page.evaluate(() => {
        const s = document.createElement('style');
        s.textContent = '.idle-panel { background: rgb(255, 0, 0) !important; }';
        document.head.appendChild(s);
      });

      const panelBg = await page.evaluate(() => {
        const host = document.querySelector('idle-panel');
        const el = host?.shadowRoot?.querySelector('.idle-panel');
        return el ? getComputedStyle(el).backgroundColor : '';
      });
      expect(panelBg).not.toBe('rgb(255, 0, 0)');
    });
  });
}

// ── Multi-tab singleton across SW restart ───────────────────────────────────
// MV3 kills the background service worker after ~30s idle — easily within a
// single AI wait. Singleton state must survive the restart (storage.session),
// so a new wait on the same hostname still dismisses the older tab's panel.
test.describe('multi-tab singleton', () => {
  test('wait in a second tab dismisses first tab panel even after SW restart', async ({
    extContext,
    page,
  }) => {
    await resetStorage(extContext);
    const site = SITES[0];
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await navigateToFixture(page, site);
    await site.triggerStreaming(page);
    await waitForPanelVisible(page);

    // Deterministically terminate the background SW (stand-in for Chrome's
    // ~30s idle kill). It restarts on the next extension message.
    const marker = Math.random().toString(36).slice(2);
    const swBefore = extContext.serviceWorkers()[0];
    expect(swBefore).toBeTruthy();
    await swBefore?.evaluate((m) => {
      (globalThis as Record<string, unknown>).__idleTestMarker = m;
    }, marker);
    const cdp = await extContext.newCDPSession(page);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    await page.waitForTimeout(500);

    const pageB = await extContext.newPage();
    try {
      await pageB.emulateMedia({ reducedMotion: 'reduce' });
      await navigateToFixture(pageB, site);
      await site.triggerStreaming(pageB);
      await waitForPanelVisible(pageB);

      // The SW handling tab B's wait must be a fresh instance, otherwise this
      // test proves nothing — fail loudly if the CDP kill stopped working.
      const swAfter = extContext.serviceWorkers()[0];
      const markerAfter = await swAfter?.evaluate(
        () => (globalThis as Record<string, unknown>).__idleTestMarker,
      );
      expect(markerAfter, 'service worker was not actually restarted').toBeUndefined();

      // Same hostname, new tab → the first tab's panel must be dismissed
      await waitForPanelHidden(page);
    } finally {
      await pageB.close();
    }
  });
});
