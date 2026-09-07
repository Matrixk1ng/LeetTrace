import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Deliberately separate from vite.config.ts: that one loads the CRX plugin,
 * which rewrites the manifest and expects a browser extension build. The unit
 * tests only exercise plain modules and React components, so they need none of
 * it — just JSX and a DOM.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
});
