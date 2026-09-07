import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // react-refresh is about Vite's HMR boundary, which only exists for the
    // extension's own source. Tests and generators are bundled by vitest and
    // never hot-reloaded, so the rule has nothing to say about them.
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite],
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'scripts/**/*.mjs', '*.config.{ts,js}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
