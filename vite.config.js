import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { renameSync, mkdirSync, existsSync, rmSync } from 'fs';

/**
 * Vite plugin to fix HTML output paths for Chrome Extension structure.
 * Vite outputs `src/popup/index.html` → `dist/src/popup/index.html`.
 * We move it to `dist/popup/index.html` to match the manifest.
 */
function chromeExtensionHtmlFix() {
  return {
    name: 'chrome-extension-html-fix',
    closeBundle() {
      const srcPopup = resolve(__dirname, 'dist/src/popup');
      const destPopup = resolve(__dirname, 'dist/popup');

      if (existsSync(srcPopup)) {
        // Ensure dest/popup exists (it may already contain assets/)
        if (!existsSync(destPopup)) {
          mkdirSync(destPopup, { recursive: true });
        }

        // Move index.html from dist/src/popup/ to dist/popup/
        const srcHtml = resolve(srcPopup, 'index.html');
        const destHtml = resolve(destPopup, 'index.html');
        if (existsSync(srcHtml)) {
          renameSync(srcHtml, destHtml);
        }

        // Clean up the empty dist/src directory
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
