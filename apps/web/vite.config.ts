import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { trimFonts } from './fonts.plugin';

export default defineConfig({
  plugins: [trimFonts(), react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
