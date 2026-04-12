import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import {defineConfig, globalIgnores} from 'eslint/config';
import eslintConfig from '@config/eslint';

export default defineConfig([
  ...eslintConfig.recommendedReactTs,
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'error',
      '@eslint-react/dom/no-dangerously-set-innerhtml': 'off',
      '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': 'off',
      '@eslint-react/no-array-index-key': 'off',
    },
  },
]);
