import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        // Only run Vitest unit tests (*.test.*). Playwright e2e specs (*.spec.ts)
        // are run by Playwright, not Vitest.
        include: ['**/*.test.{ts,tsx}'],
        setupFiles: ['./src/test/setup.ts'],
        alias: {
            '@': path.resolve(__dirname, './src')
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', '.next/']
        }
    }
})
