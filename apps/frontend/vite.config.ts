import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, {reactCompilerPreset} from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import {ViteImageOptimizer} from 'vite-plugin-image-optimizer';
import svgr from 'vite-plugin-svgr';

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
    alias: [
      {find: '@', replacement: path.resolve(__dirname, './src')},
      {find: /^highlight.js$/, replacement: 'highlight.js/lib/common'},
    ],
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/highlight.js/')) return 'hljs';
          if (id.includes('node_modules/diff2html/')) return 'diff2html';
          if (id.includes('node_modules/react-markdown/'))
            return 'react-markdown';
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': `http://localhost:${process.env.PORT ?? '3000'}`,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
