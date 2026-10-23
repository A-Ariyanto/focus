import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'fs';

/**
 * Build target: `chrome` (default) or `firefox`, set via the TARGET env var.
 * Both targets share all source code; only the manifest and output dir differ.
 */
const TARGET = process.env.TARGET === 'firefox' ? 'firefox' : 'chrome';
const OUT_DIR = resolve(__dirname, 'dist', TARGET);

/**
 * Vite plugin that writes a browser-specific manifest.json.
 *
 * - Chrome MV3 runs the background as a service worker.
 * - Firefox MV3 does not support `background.service_worker`; it runs the
 *   background as an event page via `background.scripts`, and requires a
 *   gecko add-on ID.
 */
function extensionManifest() {
  return {
    name: 'extension-manifest',
    closeBundle() {
      const manifest = JSON.parse(
        readFileSync(resolve(__dirname, 'src/manifest.json'), 'utf-8')
      );

      if (TARGET === 'firefox') {
        manifest.background = { scripts: ['background.js'], type: 'module' };
        manifest.browser_specific_settings = {
          gecko: {
            id: 'my-extension@personal.local',
            // 128 ESR: MV3 host permissions are requested at install time
            strict_min_version: '128.0',
            // Required by AMO; all data stays on the user's device
            data_collection_permissions: { required: ['none'] },
          },
        };
      }

      writeFileSync(
        resolve(OUT_DIR, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf-8'
      );
    },
  };
}

/**
 * Vite plugin to fix HTML output paths for the extension structure.
 *
 * Problem: Vite preserves the source directory structure, so
 * `src/popup/index.html` → `<outDir>/src/popup/index.html`.
 * The browser expects `popup/index.html` per the manifest.
 *
 * This plugin:
 * 1. Moves built HTML files to extension-friendly output paths
 * 2. Fixes asset paths from nested source output to stable relative paths
 * 3. Cleans up the temporary `<outDir>/src/` directory
 */
function extensionHtmlFix() {
  return {
    name: 'extension-html-fix',
    closeBundle() {
      const htmlMoves = [
        {
          srcHtml: resolve(OUT_DIR, 'src/popup/index.html'),
          destDir: resolve(OUT_DIR, 'popup'),
          destHtml: resolve(OUT_DIR, 'popup/index.html'),
          assetPrefix: './assets/',
        },
        {
          srcHtml: resolve(OUT_DIR, 'src/blocked/index.html'),
          destDir: OUT_DIR,
          destHtml: resolve(OUT_DIR, 'blocked.html'),
          assetPrefix: './popup/assets/',
        },
      ];

      for (const move of htmlMoves) {
        if (!existsSync(move.srcHtml)) continue;

        // Ensure destination directory exists
        if (!existsSync(move.destDir)) {
          mkdirSync(move.destDir, { recursive: true });
        }

        // Read and fix asset paths
        let html = readFileSync(move.srcHtml, 'utf-8');
        html = html.replace(/(?:\.\.\/)+popup\/assets\//g, move.assetPrefix);
        writeFileSync(move.destHtml, html, 'utf-8');
      }

      // Clean up <outDir>/src/
      const distSrc = resolve(OUT_DIR, 'src');
      if (existsSync(distSrc)) {
        rmSync(distSrc, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    extensionHtmlFix(),
    extensionManifest(),
  ],

  // Extensions require relative paths for all assets
  base: '',

  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,

    // Chrome will not reuse a preloaded chrome-extension:// resource across its
    // internal "worlds", so every emitted <link rel="modulepreload"> is fetched,
    // discarded, and logged as a "cross-world extension resource mismatch".
    // The module graph loads these chunks anyway; preloading only buys a wasted
    // duplicate fetch of local files. Emit no preload links.
    modulePreload: false,

    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        blocked: resolve(__dirname, 'src/blocked/index.html'),
        background: resolve(__dirname, 'src/background.js'),
        enforcer: resolve(__dirname, 'src/content/enforcer.js'),
        youtubeFocus: resolve(__dirname, 'src/content/youtube-focus.js'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'enforcer') return 'content/enforcer.js';
          if (chunkInfo.name === 'youtubeFocus') return 'content/youtube-focus.js';
          return 'popup/assets/[name]-[hash].js';
        },
        chunkFileNames: 'popup/assets/[name]-[hash].js',
        assetFileNames: 'popup/assets/[name]-[hash][extname]',
      },
    },
  },
});
