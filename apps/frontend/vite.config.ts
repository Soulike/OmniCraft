import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, {reactCompilerPreset} from '@vitejs/plugin-react';
import {ViteImageOptimizer} from 'vite-plugin-image-optimizer';
import svgr from 'vite-plugin-svgr';
import {defineConfig} from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({presets: [reactCompilerPreset()]}),
    svgr(),
    ViteImageOptimizer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
