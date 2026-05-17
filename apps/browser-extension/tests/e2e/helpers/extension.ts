import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '../../../.output/chrome-mv3');

export const isLive = process.env.E2E_LIVE === 'true';
const FIXTURE_PORT = Number(process.env.E2E_FIXTURE_PORT ?? 7331);

export type SiteKey = 'claude' | 'chatgpt' | 'gemini' | 'perplexity';

export interface SiteConfig {
  key: SiteKey;
  liveUrl: string;
  fixtureUrl: string;
  triggerStreaming(page: Page): Promise<void>;
  stopStreaming(page: Page): Promise<void>;
}

export const SITES: SiteConfig[] = [
  {
    key: 'claude',
    liveUrl: 'https://claude.ai/new',
    fixtureUrl: `http://127.0.0.1:${FIXTURE_PORT}/claude/`,
    async triggerStreaming(page) {
      await page.evaluate(() => {
        const btn = document.createElement('button');
        btn.setAttribute('aria-label', 'Stop Response');
        btn.id = '__idle_stop_btn';
        document.body.appendChild(btn);
      });
    },
    async stopStreaming(page) {
      await page.evaluate(() => {
        document.getElementById('__idle_stop_btn')?.remove();
      });
    },
  },
  {
    key: 'chatgpt',
    liveUrl: 'https://chatgpt.com/',
    fixtureUrl: `http://127.0.0.1:${FIXTURE_PORT}/chatgpt/`,
    async triggerStreaming(page) {
      await page.evaluate(() => {
        const div = document.createElement('div');
        div.setAttribute('data-message-author-role', 'assistant');
        div.setAttribute('data-status', 'streaming');
        div.id = '__idle_streaming_div';
        document.body.appendChild(div);
      });
    },
    async stopStreaming(page) {
      await page.evaluate(() => {
        document.getElementById('__idle_streaming_div')?.remove();
      });
    },
  },
  {
    key: 'gemini',
    liveUrl: 'https://gemini.google.com/app',
    fixtureUrl: `http://127.0.0.1:${FIXTURE_PORT}/gemini/`,
    async triggerStreaming(page) {
      await page.evaluate(() => {
        const el = document.createElement('model-response');
        el.className = 'loading';
        el.id = '__idle_model_response';
        document.body.appendChild(el);
      });
    },
    async stopStreaming(page) {
      await page.evaluate(() => {
        document.getElementById('__idle_model_response')?.remove();
      });
    },
  },
  {
    key: 'perplexity',
    liveUrl: 'https://perplexity.ai/',
    fixtureUrl: `http://127.0.0.1:${FIXTURE_PORT}/perplexity/`,
    async triggerStreaming(page) {
      await page.evaluate(() => {
        const el = document.createElement('div');
        el.className = 'LoadingDots';
        el.id = '__idle_loading_dots';
        document.body.appendChild(el);
      });
    },
    async stopStreaming(page) {
      await page.evaluate(() => {
        document.getElementById('__idle_loading_dots')?.remove();
      });
    },
  },
];

// ── Custom fixture ────────────────────────────────────────────────────────────

type TestFixtures = {
  // Each test gets a page from the extension's persistent context.
  page: Page;
};

type WorkerFixtures = {
  extContext: BrowserContext;
  extensionId: string;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  extContext: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture API requires object destructuring
    async ({}, use) => {
      // Extensions require the full Chromium binary, not the headless shell.
      // headless: false + --headless=new runs full Chrome in headless mode
      // without needing an X11 display, with full extension support.
      const ctx = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
          '--headless=new',
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      await use(ctx);
      await ctx.close();
    },
    { scope: 'worker' },
  ],

  extensionId: [
    async ({ extContext }, use) => {
      let [sw] = extContext.serviceWorkers();
      if (!sw) sw = await extContext.waitForEvent('serviceworker');
      const id = sw.url().split('/')[2];
      await use(id);
    },
    { scope: 'worker' },
  ],

  // Override the default `page` fixture so each test gets a page
  // from the extension's persistent context (where the extension is loaded).
  page: async ({ extContext }, use) => {
    const pg = await extContext.newPage();
    await use(pg);
    await pg.close();
  },
});

export { expect } from '@playwright/test';

// ── Navigation ────────────────────────────────────────────────────────────────

export async function navigateToFixture(page: Page, site: SiteConfig): Promise<void> {
  const url = isLive ? site.liveUrl : site.fixtureUrl;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Give the content script 1 s to attach and start the MutationObserver
  await page.waitForTimeout(1_000);
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function getSW(context: BrowserContext) {
  const [sw] = context.serviceWorkers();
  return sw;
}

export async function resetStorage(context: BrowserContext): Promise<void> {
  const sw = await getSW(context);
  if (!sw) return;
  await sw.evaluate(() => new Promise<void>((res) => chrome.storage.local.clear(res)));
}

export async function setMuteUntil(context: BrowserContext, futureMs: number): Promise<void> {
  const sw = await getSW(context);
  if (!sw) return;
  await sw.evaluate(
    (muteUntil) =>
      new Promise<void>((res) =>
        chrome.storage.local.get(['settings'], (r) => {
          const settings = Object.assign({}, r.settings as object, { muteUntil });
          chrome.storage.local.set({ settings }, res);
        }),
      ),
    futureMs,
  );
}

export async function setEnabled(context: BrowserContext, enabled: boolean): Promise<void> {
  const sw = await getSW(context);
  if (!sw) return;
  await sw.evaluate(
    (en) =>
      new Promise<void>((res) =>
        chrome.storage.local.get(['settings'], (r) => {
          const settings = Object.assign({}, r.settings as object, { enabled: en });
          chrome.storage.local.set({ settings }, res);
        }),
      ),
    enabled,
  );
}

// ── Panel visibility ──────────────────────────────────────────────────────────

export async function waitForPanelVisible(page: Page): Promise<void> {
  // Use the shadow host element to pierce into the shadow root.
  // Playwright auto-pierces open shadow roots when chaining locators.
  await page
    .locator('idle-panel')
    .locator('.idle-panel')
    .waitFor({ state: 'visible', timeout: 10_000 });
}

export async function waitForPanelHidden(page: Page): Promise<void> {
  await page
    .locator('idle-panel')
    .locator('.idle-panel')
    .waitFor({ state: 'hidden', timeout: 10_000 });
}

export async function triggerAndWaitForPanel(page: Page, site: SiteConfig): Promise<void> {
  await site.triggerStreaming(page);
  await waitForPanelVisible(page);
}
