import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { renameSync, mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'fs';

/**
 * Vite plugin to fix HTML output paths for Chrome Extension structure.
 *
 * Problem: Vite preserves the source directory structure, so
 * `src/popup/index.html` → `dist/src/popup/index.html`.
 * Chrome expects `popup/index.html` per the manifest.
 *
 * This plugin:
 * 1. Moves the HTML to `dist/popup/index.html`
 * 2. Fixes asset paths from `../../popup/assets/` to `./assets/`
 * 3. Cleans up the empty `dist/src/` directory
 */
function chromeExtensionHtmlFix() {
  return {
    name: 'chrome-extension-html-fix',
    closeBundle() {
      const srcHtml = resolve(__dirname, 'dist/src/popup/index.html');
      const destDir = resolve(__dirname, 'dist/popup');
      const destHtml = resolve(destDir, 'index.html');

      if (existsSync(srcHtml)) {
        // Ensure dest directory exists
        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }

        // Read and fix asset paths
        let html = readFileSync(srcHtml, 'utf-8');
        // Fix paths: ../../popup/assets/ → ./assets/
        html = html.replace(/(?:\.\.\/)+popup\/assets\//g, './assets/');
        writeFileSync(destHtml, html, 'utf-8');

        // Clean up dist/src/
        const distSrc = resolve(__dirname, 'dist/src');
        if (existsSync(distSrc)) {
          rmSync(distSrc, { recursive: true, force: true });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    chromeExtensionHtmlFix(),
  ],

  // Chrome extensions require relative paths for all assets
  base: '',

  build: {
    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        background: resolve(__dirname, 'src/background.js'),
        blocker: resolve(__dirname, 'src/content/blocker.js'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'blocker') return 'content/blocker.js';
          return 'popup/assets/[name]-[hash].js';
        },
        chunkFileNames: 'popup/assets/[name]-[hash].js',
        assetFileNames: 'popup/assets/[name]-[hash][extname]',
      },
    },
  },
});
