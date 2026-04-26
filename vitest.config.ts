import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: false,
    // Most tests run in node; the jsdom environment is opted-in per file
    // with `// @vitest-environment jsdom` for store tests that need
    // `localStorage` (zustand persist).
    environment: 'node',
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
