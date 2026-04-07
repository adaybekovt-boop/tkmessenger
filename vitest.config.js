import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/**/*.{js,jsx}', 'src/context/**/*.{js,jsx}', 'src/components/**/*.{js,jsx}'],
      exclude: ['src/**/__tests__/**']
    }
  }
});
