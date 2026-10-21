import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/* Tests that need scratch files (os.tmpdir()) get a folder inside the repo,
 * gitignored, instead of the system temp folder. */
const testTmp = resolve(import.meta.dirname, '.test-tmp')
mkdirSync(testTmp, { recursive: true })

/* Unit suite configuration. The coverage floors are a ratchet: the numbers
 * are the measured baseline at the time of docs/adr/0001-testing.md, and CI
 * fails a change that drops below them. Raise a floor when you raise
 * coverage; never lower one. `pnpm test` runs without coverage for speed;
 * `pnpm test:coverage` (CI) enforces the floors. */
export default defineConfig({
  test: {
    passWithNoTests: true,
    env: { TMPDIR: testTmp, TMP: testTmp, TEMP: testTmp },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { lines: 24, statements: 24, branches: 26, functions: 21 }
    }
  }
})
