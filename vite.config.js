import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'fs';

/**
 * Vite plugin to fix HTML output paths for Chrome Extension structure.
 *
 * Problem: Vite preserves the source directory structure, so
 * `src/popup/index.html` → `dist/src/popup/index.html`.
 * Chrome expects `popup/index.html` per the manifest.
 *
 * This plugin:
 * 1. Moves built HTML files to extension-friendly output paths
 * 2. Fixes asset paths from nested source output to stable relative paths
 * 3. Cleans up the temporary `dist/src/` directory
 */
function chromeExtensionHtmlFix() {
  return {
    name: 'chrome-extension-html-fix',
    closeBundle() {
      const htmlMoves = [
        {
          srcHtml: resolve(__dirname, 'dist/src/popup/index.html'),
          destDir: resolve(__dirname, 'dist/popup'),
          destHtml: resolve(__dirname, 'dist/popup/index.html'),
          assetPrefix: './assets/',
        },
        {
          srcHtml: resolve(__dirname, 'dist/src/blocked/index.html'),
          destDir: resolve(__dirname, 'dist'),
          destHtml: resolve(__dirname, 'dist/blocked.html'),
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

      // Clean up dist/src/
      const distSrc = resolve(__dirname, 'dist/src');
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
        blocked: resolve(__dirname, 'src/blocked/index.html'),
        background: resolve(__dirname, 'src/background.js'),
        enforcer: resolve(__dirname, 'src/content/enforcer.js'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'enforcer') return 'content/enforcer.js';
          return 'popup/assets/[name]-[hash].js';
        },
        chunkFileNames: 'popup/assets/[name]-[hash].js',
        assetFileNames: 'popup/assets/[name]-[hash][extname]',
      },
    },
  },
});
