const nextCoreWebVitals = require('eslint-config-next/core-web-vitals');
const unusedImports = require('eslint-plugin-unused-imports');

module.exports = [
  ...nextCoreWebVitals,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    plugins: { 'unused-imports': unusedImports },
    rules: {
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
          'newlines-between': 'always',
          pathGroupsExcludedImportTypes: ['builtin', 'external', 'object'],
          alphabetize: { order: 'asc', caseInsensitive: true },
          pathGroups: [{ pattern: '~/**', group: 'external', position: 'before' }],
        },
      ],
    },
  },
];
