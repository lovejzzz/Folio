import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const HEX = String.raw`/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\b/`;
const ARBITRARY = String.raw`/(^|\s)[a-z0-9:-]*-\[[^\]]+\]/`;

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-e2e/**', '**/node_modules/**', '**/test-results/**', '**/playwright-report/**', '.claude/**', 'apps/web/qa/**', 'apps/web/.qa-me/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['error'] }],
      'no-warning-comments': ['error', { terms: ['v0.'], location: 'anywhere' }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${HEX}]`, message: 'Use a token from tokens.ts, not a raw colour.' },
        { selector: `TemplateElement[value.raw=${HEX}]`, message: 'Use a token from tokens.ts, not a raw colour.' },
        { selector: `Literal[value=${ARBITRARY}]`, message: 'No arbitrary Tailwind values; add a token or a component class.' },
        { selector: `TemplateElement[value.raw=${ARBITRARY}]`, message: 'No arbitrary Tailwind values; add a token or a component class.' },
      ],
    },
  },
  {
    // The tokens file is the one place raw values live.
    files: ['packages/ui/src/tokens.ts', 'packages/ui/src/tokensCss.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // core, ai and export are pure: no React, no app code, no browser UI state.
    files: ['packages/core/src/**', 'packages/ai/src/**', 'packages/export/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'react-*', '@tanstack/*', 'zustand', 'dexie'], message: 'Core packages never import UI or storage.' },
            { group: ['@folio/web', '**/apps/**'], message: 'Packages never import the app.' },
            { group: ['@folio/ui/src/**'], message: 'Only @folio/ui/tokens may be imported outside the UI.' },
          ],
          paths: [{ name: '@folio/ui', message: 'Only @folio/ui/tokens may be imported outside the UI.' }],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@folio/*'], message: 'core imports nothing from the other packages.' }, { group: ['react', 'react-*'], message: 'core never imports React.' }] },
      ],
    },
  },
  {
    files: ['scripts/**', 'packages/*/scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    // Message catalogues and hand-written sample content are data, not logic.
    files: ['apps/web/src/i18n/*.ts', 'packages/core/src/sample/**', '**/test/**', '**/e2e/**', '**/*.test.{ts,tsx}'],
    rules: { 'max-lines': 'off', 'max-lines-per-function': 'off' },
  },
);
