import path from 'node:path';

import tseslint from 'typescript-eslint';

import recommendedJavaScript from './recommended-javascript.js';

export default [
  ...recommendedJavaScript,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: path.resolve('./'),
      },
    },
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unified-signatures': 'off',
    },
  },
];
