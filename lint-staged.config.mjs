/**
 * By default, we use global executables for all apps and packages.
 * If any app/package needs to use their own executables,
 * create lint-staged.config.mjs under its own folder,
 * and import configs from this file if needed.
 *
 * See https://github.com/lint-staged/lint-staged?tab=readme-ov-file#how-to-use-lint-staged-in-a-multi-package-monorepo.
 * */
export const prettierConfig = Object.freeze({
  '*': ['prettier --write --ignore-unknown --no-error-on-unmatched-pattern'],
});

export const eslintConfig = Object.freeze({
  './**/src/**/*.?(m)(j|t)(s|sx)': ['eslint --fix'],
});

export default {
  ...prettierConfig,
  ...eslintConfig,
};
