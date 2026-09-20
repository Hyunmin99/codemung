import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/renderer/src/**/*.test.{ts,tsx}', 'src/main/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/renderer/src/test/setup.ts'],
    clearMocks: true
  }
})
