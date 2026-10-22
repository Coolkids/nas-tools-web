import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), quasar: fileURLToPath(new URL('./node_modules/quasar/dist/quasar.client.js', import.meta.url)) } },
  test: { environment: 'jsdom', setupFiles: ['tests/unit/setup.ts'], include: ['tests/unit/**/*.spec.ts'],
    reporters: ['default', 'junit'], outputFile: { junit: `${process.env.RECOGNITION_TEST_RUN_DIR || '.test-runtime/recognition-v3'}/unit.xml` },
    clearMocks: true }
})
