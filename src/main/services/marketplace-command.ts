import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/**
 * GUI-launched Electron processes do not inherit the user's interactive shell
 * profile. Keep marketplace downloads usable when npm/git live in Homebrew,
 * Volta, NVM, or another common user-managed tool directory.
 */
export function resolveMarketplaceCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  const trimmed = command.trim()
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) return trimmed

  const pathEntries = marketplacePathEntries(env, home)
  const suffixes = process.platform === 'win32'
    ? ['', ...(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')]
    : ['']
  const candidates = [...new Set(pathEntries)].flatMap((directory) =>
    suffixes.map((suffix) => join(directory, `${trimmed}${suffix}`))
  )
  return candidates.find((candidate) => {
    try {
      accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
      return true
    } catch {
      return false
    }
  }) ?? trimmed
}

export function marketplaceCommandEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): NodeJS.ProcessEnv {
  const path = marketplacePathEntries(env, home).join(delimiter)
  return {
    ...env,
    PATH: path,
    ...(process.platform === 'win32' && env.Path !== undefined ? { Path: path } : {})
  }
}

function marketplacePathEntries(env: NodeJS.ProcessEnv, home: string): string[] {
  return [
    env.PATH ?? env.Path ?? '',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    join(home, '.local', 'bin'),
    join(home, '.local', 'node', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, '.volta', 'bin'),
    join(home, '.asdf', 'shims'),
    join(home, '.bun', 'bin'),
    join(home, '.nvm', 'current', 'bin')
  ]
    .flatMap((value) => value.split(delimiter))
    .map((value) => value.trim())
    .filter(Boolean)
}
