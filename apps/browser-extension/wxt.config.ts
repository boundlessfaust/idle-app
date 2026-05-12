import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],

  manifest: {
    permissions: ['storage', 'tabs', 'commands', 'scripting'],
  },

  vite: () => ({
    resolve: {
      alias: {
        // Resolve @idle/core imports from source — no pre-compile step needed
        '@idle/core': resolve(__dirname, '../../packages/core/src'),
      },
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
