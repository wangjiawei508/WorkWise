const { spawnSync } = require('node:child_process')
const { join } = require('node:path')

const vitest = join(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs')
const result = spawnSync(process.execPath, [
  vitest,
  'run',
  'src/main/services/managed-tool-service.live.test.ts'
], {
  cwd: join(__dirname, '..'),
  env: { ...process.env, WORKWISE_LIVE_MANAGED_TOOL_TEST: '1' },
  stdio: 'inherit'
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
