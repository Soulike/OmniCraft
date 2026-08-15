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
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/restrict-template-expressions': 'off',
      // `return somePromise` inside a `try`/`finally` or an `await using`
      // scope is a use-after-close: the scope unwinds — running the `finally`,
      // or disposing the resource — before the promise settles. Verified
      // against a `FileHandle`: dropping the `await` makes the read reject
      // because the handle is already closed. Reading for it is not a
      // reasonable expectation, so the rule enforces it.
      '@typescript-eslint/return-await': [
        'error',
        'error-handling-correctness-only',
      ],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {allowDefaultCaseForExhaustiveSwitch: false},
      ],
      '@typescript-eslint/unified-signatures': 'off',
    },
  },
];
