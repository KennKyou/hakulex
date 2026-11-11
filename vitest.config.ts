import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    vue(),
  ],
  test: {
    environment: 'happy-dom',
    include: ['packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['./vitest.setup.ts'],
    // Run afterEach hooks in definition order, so the setup file's auto-unmount
    // happens before each test file's DOM cleanup.
    sequence: { hooks: 'list' },
  },
})
