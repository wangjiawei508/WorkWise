import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'
import { getOfficialMarketplaceCatalog } from './official-marketplace-catalog'
import {
  MANAGED_PYTHON_VERSION,
  MANAGED_UV_VERSION,
  ManagedUvRuntimeService,
  type ManagedUvRuntimeV1
} from './managed-uv-runtime-service'
import {
  inspectPackageDirectory,
  packageInstallLimitsFor
} from './package-installation-service'
import {
  materializePypiPackage,
  validatePythonDependencyLock
} from './pypi-package-materializer'

const execFileAsync = promisify(execFile)
const roots: string[] = []
const liveDescribe = process.env.WORKWISE_PYPI_LIVE === '1' ? describe : describe.skip

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `workwise-${label}-`))
  roots.push(root)
  return root
}

async function assertNoLinks(root: string): Promise<void> {
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const info = await lstat(path)
      expect(info.isSymbolicLink(), `Unexpected symbolic link: ${path}`).toBe(false)
      if (info.isDirectory()) await visit(path)
    }
  }
  await visit(root)
}

async function liveRuntime(root: string): Promise<ManagedUvRuntimeV1> {
  const injectedUv = process.env.WORKWISE_LIVE_UV_PATH
  const injectedPython = process.env.WORKWISE_LIVE_PYTHON_PATH
  if (!injectedUv || !injectedPython) {
    return new ManagedUvRuntimeService({ rootDirectory: join(root, 'runtime') }).ensure()
  }
  const uvPath = await realpath(injectedUv)
  const pythonPath = await realpath(injectedPython)
  const cacheDirectory = process.env.WORKWISE_LIVE_UV_CACHE ?? join(root, 'runtime-cache')
  const pythonInstallDirectory = process.env.WORKWISE_LIVE_PYTHON_ROOT ?? dirname(dirname(pythonPath))
  await mkdir(cacheDirectory, { recursive: true })
  const [uvVersion, pythonVersion] = await Promise.all([
    execFileAsync(uvPath, ['--version'], { timeout: 30_000 }),
    execFileAsync(pythonPath, ['--version'], { timeout: 30_000 })
  ])
  expect(uvVersion.stdout).toContain(`uv ${MANAGED_UV_VERSION}`)
  expect(`${pythonVersion.stdout}${pythonVersion.stderr}`).toContain(`Python ${MANAGED_PYTHON_VERSION}`)
  return {
    uvPath,
    uvVersion: MANAGED_UV_VERSION,
    pythonPath,
    pythonVersion: MANAGED_PYTHON_VERSION,
    cacheDirectory,
    pythonInstallDirectory
  }
}

async function curlFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  const scratch = await mkdtemp(join(tmpdir(), 'workwise-live-fetch-'))
  const output = join(scratch, 'response.bin')
  const args = [
    '--http1.1',
    '--fail',
    '--silent',
    '--show-error',
    '--max-time', '120',
    '--output', output,
    '--write-out', '%{url_effective}\n%{http_code}\n%{content_type}'
  ]
  if (init?.redirect === 'follow') args.push('--location')
  for (const [key, value] of new Headers(init?.headers).entries()) {
    args.push('--header', `${key}: ${value}`)
  }
  args.push(url)
  try {
    const result = await execFileAsync('curl', args, {
      timeout: 130_000,
      maxBuffer: 1024 * 1024
    })
    const [effectiveUrl, statusText, contentType] = result.stdout.trim().split('\n')
    const bytes = await readFile(output)
    const response = new Response(bytes, {
      status: Number(statusText),
      headers: {
        'content-length': String(bytes.byteLength),
        ...(contentType ? { 'content-type': contentType } : {})
      }
    })
    Object.defineProperty(response, 'url', { value: effectiveUrl || url })
    return response
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

liveDescribe('managed Python plugin live smoke', () => {
  afterAll(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('runs locked MCPB uv and a relocated catalog wheel without modifying plugin payloads', async () => {
    const root = await tempRoot('managed-python-live')
    const runtime = await liveRuntime(root)
    const environment = {
      ...process.env,
      UV_CACHE_DIR: runtime.cacheDirectory,
      UV_PYTHON_INSTALL_DIR: runtime.pythonInstallDirectory,
      UV_NO_PROGRESS: '1',
      UV_PYTHON_DOWNLOADS: 'never'
    }

    const mcpbRoot = join(root, 'mcpb')
    const entrypoint = join(mcpbRoot, 'server', 'main.py')
    await mkdir(dirname(entrypoint), { recursive: true })
    await writeFile(join(mcpbRoot, 'LICENSE'), 'MIT License\n')
    await writeFile(join(mcpbRoot, 'pyproject.toml'), [
      '[project]',
      'name = "workwise-mcpb-live"',
      'version = "1.0.0"',
      'requires-python = ">=3.12,<3.13"',
      'dependencies = []',
      ''
    ].join('\n'))
    await writeFile(entrypoint, 'print("workwise-mcpb-ready")\n')
    await execFileAsync(runtime.uvPath, [
      '--cache-dir', runtime.cacheDirectory,
      '--managed-python',
      '--no-python-downloads',
      '--no-progress',
      '--directory', mcpbRoot,
      '--no-config',
      'lock',
      '--python', runtime.pythonPath
    ], { env: environment, timeout: 5 * 60_000 })
    const beforeMcpb = await inspectPackageDirectory(mcpbRoot)
    const mcpbRun = await execFileAsync(runtime.uvPath, [
      '--cache-dir', runtime.cacheDirectory,
      '--managed-python',
      '--no-python-downloads',
      '--no-progress',
      '--directory', mcpbRoot,
      '--no-config',
      'run',
      '--locked',
      '--isolated',
      '--no-env-file',
      '--no-editable',
      '--python', runtime.pythonPath,
      entrypoint
    ], { env: environment, timeout: 5 * 60_000 })
    expect(mcpbRun.stdout.trim()).toBe('workwise-mcpb-ready')
    expect(await inspectPackageDirectory(mcpbRoot)).toEqual(beforeMcpb)

    const item = getOfficialMarketplaceCatalog().find((candidate) => candidate.id === 'time-mcp')
    expect(item).toBeDefined()
    if (!item || item.source.kind !== 'pypi') throw new Error('Official Time MCP catalog entry is invalid.')
    const materialized = join(root, 'time-mcp')
    await materializePypiPackage(item, materialized, {
      runtime: { ensure: async () => runtime },
      fetch: curlFetch as typeof fetch
    })
    const metadata = JSON.parse(await readFile(
      join(materialized, 'workwise-python-runtime.json'),
      'utf8'
    )) as { wheel: { sha256: string }; lockSha256: string; sitePackages: string }
    const lock = await readFile(join(materialized, 'requirements.lock'), 'utf8')
    validatePythonDependencyLock(lock, item.source.digest.value)
    expect(metadata.wheel.sha256).toBe(item.source.digest.value)
    expect(metadata.lockSha256).toBe(createHash('sha256').update(lock).digest('hex'))
    await inspectPackageDirectory(materialized, packageInstallLimitsFor(item))
    await assertNoLinks(materialized)

    const moved = join(root, 'relocated-time-mcp')
    await rename(materialized, moved)
    const launched = await execFileAsync(runtime.pythonPath, [
      '-I',
      join(moved, 'workwise-python-launcher.py'),
      join(moved, ...metadata.sitePackages.split('/')),
      item.source.packageName,
      'mcp-server-time',
      '--help'
    ], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })
    expect(`${launched.stdout}\n${launched.stderr}`).toMatch(/usage|time|timezone/i)
  }, 45 * 60_000)
})
