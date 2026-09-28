import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { cspHashes, previewHeaders } from './headers.plugin.ts';
import { preloadFonts, trimFonts } from './fonts.plugin.ts';

export default defineConfig({
  plugins: [trimFonts(), preloadFonts(), react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), cspHashes(), previewHeaders()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // Fonts are always separate files: the CSP allows fonts from 'self' only.
    assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined),
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
