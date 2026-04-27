import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

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
