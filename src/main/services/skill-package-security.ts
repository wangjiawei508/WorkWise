import { lstat, readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

export const SKILL_PACKAGE_LIMITS = Object.freeze({
  maxFiles: 512,
  maxTotalBytes: 8 * 1024 * 1024,
  maxFileBytes: 1024 * 1024,
  maxDepth: 16
})

// WorkWise only reads metadata from already-installed Codex plugin Skills. Some
// trusted template plugins intentionally include reference documents larger than
// the network-install limit, so discovery gets a separate bounded profile. The
// stricter SKILL_PACKAGE_LIMITS remain mandatory for every install/update path.
export const TRUSTED_SKILL_DISCOVERY_LIMITS = Object.freeze({
  maxFiles: 2_048,
  maxTotalBytes: 64 * 1024 * 1024,
  maxFileBytes: 16 * 1024 * 1024,
  maxDepth: 16
})

export type SkillPackageLimits = {
  maxFiles: number
  maxTotalBytes: number
  maxFileBytes: number
  maxDepth: number
}

export type SkillPackageValidation = {
  files: number
  totalBytes: number
}

function unsafe(message: string): never {
  throw new Error(`Unsafe Skill package: ${message}`)
}

export async function validateSkillPackage(
  root: string,
  limits: SkillPackageLimits = SKILL_PACKAGE_LIMITS
): Promise<SkillPackageValidation> {
  const rootPath = resolve(root)
  const rootInfo = await lstat(rootPath)
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) unsafe('root must be a real directory.')

  let files = 0
  let totalBytes = 0
  const collisionKeys = new Set<string>()
  const stack: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }]

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.depth > limits.maxDepth) {
      unsafe(`directory depth exceeds ${limits.maxDepth}.`)
    }
    const entries = await readdir(current.path, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git') unsafe('Git repositories and submodules are not allowed.')
      const absolute = resolve(current.path, entry.name)
      const rel = relative(rootPath, absolute)
      if (!rel || rel.startsWith('..') || rel.split(sep).includes('..')) unsafe('path escapes package root.')
      const collisionKey = rel.replaceAll('\\', '/').normalize('NFC').toLowerCase()
      if (collisionKeys.has(collisionKey)) unsafe(`path collision at ${rel}.`)
      collisionKeys.add(collisionKey)

      const info = await lstat(absolute)
      if (info.isSymbolicLink()) unsafe(`links and junctions are not allowed: ${rel}.`)
      if (info.isDirectory()) {
        stack.push({ path: absolute, depth: current.depth + 1 })
        continue
      }
      if (!info.isFile()) unsafe(`special file is not allowed: ${rel}.`)
      files += 1
      totalBytes += info.size
      if (files > limits.maxFiles) unsafe(`file count exceeds ${limits.maxFiles}.`)
      if (info.size > limits.maxFileBytes) unsafe(`file exceeds ${formatBytes(limits.maxFileBytes)}: ${rel}.`)
      if (totalBytes > limits.maxTotalBytes) unsafe(`package exceeds ${formatBytes(limits.maxTotalBytes)}.`)
    }
  }

  if (files === 0) unsafe('package is empty.')
  return { files, totalBytes }
}

function formatBytes(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MiB`
  if (bytes % 1024 === 0) return `${bytes / 1024} KiB`
  return `${bytes} bytes`
}
