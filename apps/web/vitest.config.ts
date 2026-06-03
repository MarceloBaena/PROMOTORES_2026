import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@promotor/config': resolve(__dirname, '../../packages/config/src/index.ts'),
      '@promotor/types': resolve(__dirname, '../../packages/types/src/index.ts'),
      '@promotor/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
    },
  },
});
