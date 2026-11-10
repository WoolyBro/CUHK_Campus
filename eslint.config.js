import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config({ ignores: ['dist', 'node_modules', 'public', 'data', 'playwright-report', 'test-results'] }, js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['**/*.{ts,tsx}'],
  languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
  plugins: { 'react-hooks': reactHooks },
  rules: {
    // Classic hook rules. The scene mutates long-lived three.js objects and a shared camera rig
    // by design, so the React-Compiler purity rules are intentionally not enabled.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'prefer-const': ['error', { destructuring: 'all' }],
  },
})
