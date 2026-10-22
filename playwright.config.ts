import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
const reports = process.env.RECOGNITION_TEST_RUN_DIR || '.test-runtime/recognition-v3/e2e'
const backend = fileURLToPath(new URL('../nas-tools', import.meta.url))
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 45000, expect: { timeout: 10000 }, outputDir: `${reports}/results`,
  reporter: [['list'], ['junit', { outputFile: `${reports}/e2e.xml` }], ['html', { outputFolder: `${reports}/html`, open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5178', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', viewport: { width: 390, height: 844 } } }
  ],
  webServer: [
    { command: `"${backend}/.venv/bin/python" tests/tools/serve_recognition_frontend.py --port 19091`, cwd: backend, url: 'http://127.0.0.1:19091/index', timeout: 90000, reuseExistingServer: false },
    { command: 'npm run dev -- --hostname 127.0.0.1 --port 5178', env: { FLASK_TARGET: 'http://127.0.0.1:19091' }, url: 'http://127.0.0.1:5178', timeout: 90000, reuseExistingServer: false }
  ]
})
