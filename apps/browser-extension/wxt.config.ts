import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],

  manifest: {
    permissions: ['storage', 'tabs', 'commands', 'scripting'],
    commands: {
      'toggle-wait': {
        suggested_key: {
          default: 'Ctrl+Shift+L',
          mac: 'Command+Shift+L',
        },
        description: 'Toggle idle wait state manually',
      },
    },
  },

  vite: () => ({
    resolve: {
      alias: {
        // Resolve @idle/core imports from source — no pre-compile step needed
        '@idle/core': resolve(__dirname, '../../packages/core/src'),
      },
    },
    define: {
      // TEST_MODE=true env var bakes __TEST_MODE__ = true into the bundle.
      // Vite owns import.meta.env and won't honour custom keys via define —
      // use a plain global instead so Rollup can tree-shake the test path.
      __TEST_MODE__: JSON.stringify(process.env.TEST_MODE === 'true'),
    },
    server: {
      // WXT_HOST set in devcontainer remoteEnv; binds to 0.0.0.0 for hot-reload from host browser
      host: process.env.WXT_HOST ?? 'localhost',
    },
  }),

  webExt: {
    // WXT_OPEN_BROWSER=false in devcontainer — container has no display
    disabled: process.env.WXT_OPEN_BROWSER === 'false',
  },
});
