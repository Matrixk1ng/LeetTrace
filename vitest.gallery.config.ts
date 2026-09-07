import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * The gallery generator (`npm run gallery`) — a standalone config rather than
 * a merge of vitest.config.ts, because mergeConfig concatenates `include` and
 * would drag the whole unit suite along. See tests/dev/gallery.render.tsx.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/dev/**/*.render.tsx'],
    environment: 'jsdom',
  },
});
