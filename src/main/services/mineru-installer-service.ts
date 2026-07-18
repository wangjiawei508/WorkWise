import { createHash } from 'node:crypto'
import { get as httpsGet } from 'node:https'
import { access, mkdir, rm, stat, statfs } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir, totalmem } from 'node:os'
import { atomicWriteFile, runSerialized } from './durable-file'
import { safeSpawn } from './safe-spawn'

export const MINERU_VERSION = '3.4.4'
export const MINERU_WHEEL = {
  url: 'https://files.pythonhosted.org/packages/ec/d1/fd23b40d7bbdeaa04a6070ffeb21caff91c2c5a2c5fde22c7ce804f08dd8/mineru-3.4.4-py3-none-any.whl',
  sha256: 'd4d678539782a7683d998e2914a52d96b5720676ce65658b29666b1f4d9dfd13'
} as const

const MIN_MEMORY_BYTES = 16 * 1024 ** 3
const MIN_DISK_BYTES = 20 * 1024 ** 3
const MAX_WHEEL_BYTES = 20 * 1024 ** 2

type PythonCommand = { command: string; args: string[]; version: string }

export type MineruInstallPreflight = {
  ok: boolean
  memoryBytes: number
  freeDiskBytes: number
  python?: PythonCommand
  errors: string[]
}

type InstallerOptions = {
  toolsRoot?: string
  platform?: NodeJS.Platform
  memoryBytes?: number
  freeDiskBytes?: number
  commandRunner?: (command: string, args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>
  downloader?: (url: string) => Promise<Buffer>
}

const MINERU_ADAPTER = String.raw`#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

def main():
    started = time.time()
    request = json.loads(sys.stdin.read())
    workspace = Path(request["workspaceRoot"]).resolve()
    source = Path(request["inputPath"]).resolve()
    output = Path(request["outputDirectory"]).resolve()
    if workspace not in source.parents or workspace not in output.parents:
        raise ValueError("path escapes workspace")
    output.mkdir(parents=True, exist_ok=True)
    executable = Path(sys.executable).parent / ("mineru.exe" if os.name == "nt" else "mineru")
    completed = subprocess.run(
        [str(executable), "-p", str(source), "-o", str(output), "-b", "pipeline"],
        cwd=str(workspace), capture_output=True, text=True, timeout=7200, check=False
    )
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout or "MinerU failed")[-2000:])
    markdown_files = sorted(output.rglob("*.md"), key=lambda path: path.stat().st_size, reverse=True)
    if not markdown_files:
        raise RuntimeError("MinerU did not produce Markdown")
    markdown_path = markdown_files[0]
    text = markdown_path.read_text(encoding="utf-8", errors="replace")
    headings = []
    for line in text.splitlines():
        match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if match:
            headings.append({"level": len(match.group(1)), "text": match.group(2).strip()})
    response = {
        "ok": True,
        "engine": "mineru-local",
        "engineVersion": "mineru-${MINERU_VERSION}",
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "markdownPath": markdown_path.relative_to(workspace).as_posix(),
        "headings": headings,
        "tables": [], "media": [], "references": [], "warnings": [],
        "durationMs": round((time.time() - started) * 1000)
    }
    (output / "result.json").write_text(json.dumps(response, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(response, ensure_ascii=False))

try:
    main()
except Exception as error:
    print(json.dumps({"ok": False, "code": "document_parse_failed", "message": str(error)[:2000]}, ensure_ascii=False))
    sys.exit(1)
`

export function validateMineruResources(input: {
  platform: NodeJS.Platform
  memoryBytes: number
  freeDiskBytes: number
  pythonVersion?: string
}): string[] {
  const errors: string[] = []
  if (input.memoryBytes < MIN_MEMORY_BYTES) errors.push('MinerU requires at least 16 GB of memory.')
  if (input.freeDiskBytes < MIN_DISK_BYTES) errors.push('MinerU requires at least 20 GB of free disk space.')
  if (!input.pythonVersion) {
    errors.push('Python 3.10–3.13 is required.')
  } else {
    const match = /Python\s+(\d+)\.(\d+)/i.exec(input.pythonVersion)
    const major = Number(match?.[1])
    const minor = Number(match?.[2])
    const supported = major === 3 && minor >= 10 && minor <= (input.platform === 'win32' ? 12 : 13)
    if (!supported) errors.push(input.platform === 'win32' ? 'Windows requires Python 3.10–3.12.' : 'Python 3.10–3.13 is required.')
  }
  return errors
}

export class MineruInstallerService {
  private readonly toolsRoot: string
  private readonly platform: NodeJS.Platform
  private readonly options: InstallerOptions

  constructor(options: InstallerOptions = {}) {
    this.toolsRoot = options.toolsRoot ?? join(homedir(), '.workwise', 'tools')
    this.platform = options.platform ?? process.platform
    this.options = options
  }

  versionRoot(): string {
    return join(this.toolsRoot, 'mineru', 'versions', MINERU_VERSION)
  }

  pythonExecutable(): string {
    return this.platform === 'win32'
      ? join(this.versionRoot(), 'Scripts', 'python.exe')
      : join(this.versionRoot(), 'bin', 'python')
  }

  adapterPath(): string {
    return join(this.toolsRoot, 'mineru', 'workwise-mineru-adapter.py')
  }

  async isInstalled(): Promise<boolean> {
    try {
      return (await stat(this.pythonExecutable())).isFile() && (await stat(this.adapterPath())).isFile()
    } catch {
      return false
    }
  }

  async preflight(): Promise<MineruInstallPreflight> {
    await mkdir(this.toolsRoot, { recursive: true })
    const freeDiskBytes = this.options.freeDiskBytes ?? Number((await statfs(this.toolsRoot)).bavail) * Number((await statfs(this.toolsRoot)).bsize)
    const memoryBytes = this.options.memoryBytes ?? totalmem()
    const python = await this.findPython()
    const errors = validateMineruResources({ platform: this.platform, memoryBytes, freeDiskBytes, pythonVersion: python?.version })
    return { ok: errors.length === 0, memoryBytes, freeDiskBytes, python, errors }
  }

  async install(): Promise<void> {
    await runSerialized('tool:mineru-install', async () => {
      if (await this.isInstalled()) return
      const preflight = await this.preflight()
      if (!preflight.ok || !preflight.python) throw new Error(preflight.errors.join(' '))
      const mineruRoot = join(this.toolsRoot, 'mineru')
      const versionRoot = this.versionRoot()
      const wheelPath = join(mineruRoot, 'downloads', `mineru-${MINERU_VERSION}-py3-none-any.whl`)
      await mkdir(dirname(wheelPath), { recursive: true })
      const wheel = await (this.options.downloader ?? downloadPinnedFile)(MINERU_WHEEL.url)
      const digest = createHash('sha256').update(wheel).digest('hex')
      if (digest !== MINERU_WHEEL.sha256) throw new Error('MinerU package SHA-256 verification failed.')
      await atomicWriteFile(wheelPath, wheel)
      await rm(versionRoot, { recursive: true, force: true })
      try {
        const python = preflight.python
        await this.run(python.command, [...python.args, '-m', 'venv', versionRoot], this.toolsRoot)
        const venvPython = this.pythonExecutable()
        await this.run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', `${wheelPath}[all]`], this.toolsRoot)
        await this.run(venvPython, ['-c', `import importlib.metadata; assert importlib.metadata.version('mineru') == '${MINERU_VERSION}'`], this.toolsRoot)
        await atomicWriteFile(this.adapterPath(), MINERU_ADAPTER)
        await atomicWriteFile(join(mineruRoot, 'manifest.json'), JSON.stringify({
          schema: 'workwise.document-engine', version: 1, engine: 'mineru-local',
          engineVersion: MINERU_VERSION, packageSha256: MINERU_WHEEL.sha256,
          installedAt: new Date().toISOString(), localOnly: true
        }, null, 2))
      } catch (error) {
        await rm(versionRoot, { recursive: true, force: true }).catch(() => undefined)
        throw error
      }
    })
  }

  private async findPython(): Promise<PythonCommand | undefined> {
    const candidates = this.platform === 'win32'
      ? [{ command: 'py', args: ['-3.12'] }, { command: 'python', args: [] }]
      : ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3'].map((command) => ({ command, args: [] }))
    for (const candidate of candidates) {
      try {
        const result = await this.capture(candidate.command, [...candidate.args, '--version'], this.toolsRoot)
        const version = `${result.stdout}\n${result.stderr}`.trim()
        if (result.code === 0 && validateMineruResources({ platform: this.platform, memoryBytes: MIN_MEMORY_BYTES, freeDiskBytes: MIN_DISK_BYTES, pythonVersion: version }).length === 0) {
          return { ...candidate, version }
        }
      } catch {
        // Try the next supported interpreter without modifying the system.
      }
    }
    return undefined
  }

  private async run(command: string, args: string[], cwd: string): Promise<void> {
    const result = await this.capture(command, args, cwd)
    if (result.code !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).slice(-4_000))
  }

  private capture(command: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    if (this.options.commandRunner) return this.options.commandRunner(command, args, cwd)
    return captureCommand(command, args, cwd)
  }
}

async function captureCommand(command: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = await safeSpawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', PIP_NO_INPUT: '1' }
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let outputBytes = 0
  const collect = (target: Buffer[]) => (chunk: Buffer): void => {
    outputBytes += chunk.byteLength
    if (outputBytes <= 2 * 1024 * 1024) target.push(chunk)
    else child.kill('SIGTERM')
  }
  child.stdout?.on('data', collect(stdout))
  child.stderr?.on('data', collect(stderr))
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (value) => resolve(value ?? 1))
  })
  return { code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }
}

function downloadPinnedFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'files.pythonhosted.org') {
      reject(new Error('Unapproved MinerU package host.'))
      return
    }
    const request = httpsGet(parsed, { headers: { 'Accept-Encoding': 'identity' }, timeout: 15_000 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`MinerU package download failed (${response.statusCode ?? 'unknown'}).`))
        return
      }
      const chunks: Buffer[] = []
      let bytes = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength
        if (bytes > MAX_WHEEL_BYTES) request.destroy(new Error('MinerU package exceeds the download limit.'))
        else chunks.push(chunk)
      })
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('MinerU package download timed out.')))
    request.on('error', reject)
  })
}
