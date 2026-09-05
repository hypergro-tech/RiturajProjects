import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Single-file build for publishing as a claude.ai artifact (VITE_ARTIFACT=1).
 * Everything is inlined except the pdf.js worker file, which the artifact build never loads
 * (it imports the worker module on the main thread instead).
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    assetsInlineLimit: (file) => !/\.mjs$/.test(file),
    cssCodeSplit: false,
    chunkSizeWarningLimit: 20000,
  },
});
