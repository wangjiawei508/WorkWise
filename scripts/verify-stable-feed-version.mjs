#!/usr/bin/env node
import YAML from 'yaml'

const expectedTag = String(process.argv[2] || '').trim()
if (!/^v\d+\.\d+\.\d+$/.test(expectedTag)) {
  throw new Error('Usage: node scripts/verify-stable-feed-version.mjs vX.Y.Z')
}

const expectedVersion = expectedTag.slice(1)
const publicBase = String(
  process.env.WORKWISE_PUBLIC_BASE_URL || 'https://www.railwise.cn/downloads'
).replace(/\/+$/, '')
const feedBase = `${publicBase}/workwise/channels/stable/latest/`

for (const fileName of ['latest.json', 'latest.yml', 'latest-mac.yml']) {
  const url = new URL(fileName, feedBase)
  url.searchParams.set('workwise_rollback_probe', `${Date.now()}-${fileName}`)
  const response = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    },
    cache: 'no-store',
    redirect: 'follow'
  })
  if (!response.ok) {
    throw new Error(`Stable metadata request failed ${response.status}: ${fileName}`)
  }

  const source = await response.text()
  const manifest = fileName.endsWith('.json') ? JSON.parse(source) : YAML.parse(source)
  if (manifest?.version !== expectedVersion) {
    throw new Error(
      `Stable ${fileName} points to ${String(manifest?.version || 'unknown')}, expected ${expectedVersion}`
    )
  }
  if (fileName === 'latest.json' && manifest?.tag !== expectedTag) {
    throw new Error(
      `Stable ${fileName} points to ${String(manifest?.tag || 'unknown')}, expected ${expectedTag}`
    )
  }
  console.log(
    `Verified ${fileName}: ${expectedVersion} (${response.headers.get('cache-control') || 'no cache-control'})`
  )
}
