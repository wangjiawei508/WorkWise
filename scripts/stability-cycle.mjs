import { spawnSync } from 'node:child_process'

const durationMinutes = Math.max(1, Number(process.env.WORKWISE_STABILITY_MINUTES || 10))
const intervalMinutes = Math.max(1, Number(process.env.WORKWISE_STABILITY_INTERVAL_MINUTES || 10))
const deadline = Date.now() + durationMinutes * 60_000
let cycle = 0

const commands = [
  ['npm', ['test', '--', '--run',
    'src/main/cancellation-registry.test.ts',
    'src/main/services/canonical-containment.test.ts',
    'src/main/services/safe-spawn.test.ts',
    'src/main/settings-store.test.ts',
    'src/renderer/src/write/write-workspace-store.test.ts']],
  ['npm', ['--prefix', 'kun', 'test', '--', '--run',
    'tests/atomic-write.test.ts',
    'tests/attachment-store.test.ts',
    'tests/safe-web-fetch.test.ts',
    'tests/loop.test.ts']]
]

while (Date.now() < deadline) {
  cycle += 1
  console.log(`[workwise:stability] cycle ${cycle} started`)
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { stdio: 'inherit', env: process.env })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  const remaining = deadline - Date.now()
  if (remaining <= 0) break
  await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, intervalMinutes * 60_000)))
}

console.log(`[workwise:stability] completed ${cycle} cycle(s) over ${durationMinutes} minute(s)`)
