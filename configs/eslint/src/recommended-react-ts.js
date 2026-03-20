import eslintReact from '@eslint-react/eslint-plugin';

import recommendedTypeScript from './recommended-typescript.js';

export default [
  ...recommendedTypeScript,
  eslintReact.configs['recommended-typescript'],
];
