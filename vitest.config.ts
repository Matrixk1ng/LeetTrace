import { defineConfig } from 'vitest/config';

/**
 * Deliberately separate from vite.config.ts: that one loads the CRX plugin,
 * which rewrites the manifest and expects a browser extension build. The unit
 * tests only exercise plain modules (snapshot routing, the reducer), so they
 * need none of it.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
