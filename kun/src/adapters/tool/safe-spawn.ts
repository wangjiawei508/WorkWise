import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, resolve } from 'node:path'

async function usableDirectory(path: string | undefined): Promise<string | null> {
  if (!path) return null
  try {
    const info = await stat(path)
    return info.isDirectory() ? resolve(path) : null
  } catch {
    return null
  }
}

async function resolveExecutable(command: string, env: NodeJS.ProcessEnv): Promise<string> {
  const candidates: string[] = []
  if (isAbsolute(command)) {
    candidates.push(command)
  } else {
    const extensions = process.platform === 'win32'
      ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
      : ['']
    for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
      for (const extension of extensions) candidates.push(join(directory, `${command}${extension}`))
    }
  }
  for (const candidate of candidates) {
    try {
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
      const info = await stat(candidate)
      if (info.isFile()) return candidate
    } catch {
      // Continue through PATH candidates.
    }
  }
  throw Object.assign(new Error(`executable is unavailable: ${command}`), { code: 'ENOENT' })
}

export async function safeSpawn(
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio & { workspace?: string }
): Promise<ChildProcessWithoutNullStreams> {
  const env = options.env ?? process.env
  const executable = await resolveExecutable(command, env)
  const cwd =
    (await usableDirectory(typeof options.cwd === 'string' ? options.cwd : undefined)) ??
    (await usableDirectory(options.workspace)) ??
    homedir()
  const child = spawn(executable, [...args], {
    ...options,
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  await new Promise<void>((resolveStarted, reject) => {
    const onSpawn = (): void => {
      child.off('error', onError)
      resolveStarted()
    }
    const onError = (error: Error): void => {
      child.off('spawn', onSpawn)
      reject(error)
    }
    child.once('spawn', onSpawn)
    child.once('error', onError)
  })
  return child
}
