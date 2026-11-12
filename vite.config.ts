/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// Relative paths, so the app works from any folder: GitHub Pages serves it
// under /<repo name>/, and renaming the repo must not break it.
const base = './';

// Shown in Settings so you can tell which version is running.
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  base,
  define: {
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Ask before swapping in a new version so a round is never interrupted.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'U Flow',
        short_name: 'U Flow',
        description: 'Public Forum flowing for rebuttal and constructive speakers: bank, case, timers, crossfire and speech builder.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#16181f',
        theme_color: '#16181f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The Word/PDF/Excel exporters are big but must work offline too.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  build: {
    // The Word/PDF/Excel exporters are large on purpose and only load when you export.
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
