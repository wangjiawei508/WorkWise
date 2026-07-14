import { lstat, readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

export const SKILL_PACKAGE_LIMITS = Object.freeze({
  maxFiles: 512,
  maxTotalBytes: 8 * 1024 * 1024,
  maxFileBytes: 1024 * 1024,
  maxDepth: 16
})

export type SkillPackageValidation = {
  files: number
  totalBytes: number
}

function unsafe(message: string): never {
  throw new Error(`Unsafe Skill package: ${message}`)
}

export async function validateSkillPackage(root: string): Promise<SkillPackageValidation> {
  const rootPath = resolve(root)
  const rootInfo = await lstat(rootPath)
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) unsafe('root must be a real directory.')

  let files = 0
  let totalBytes = 0
  const collisionKeys = new Set<string>()
  const stack: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }]

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.depth > SKILL_PACKAGE_LIMITS.maxDepth) {
      unsafe(`directory depth exceeds ${SKILL_PACKAGE_LIMITS.maxDepth}.`)
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
      if (files > SKILL_PACKAGE_LIMITS.maxFiles) unsafe(`file count exceeds ${SKILL_PACKAGE_LIMITS.maxFiles}.`)
      if (info.size > SKILL_PACKAGE_LIMITS.maxFileBytes) unsafe(`file exceeds 1 MiB: ${rel}.`)
      if (totalBytes > SKILL_PACKAGE_LIMITS.maxTotalBytes) unsafe('package exceeds 8 MiB.')
    }
  }

  if (files === 0) unsafe('package is empty.')
  return { files, totalBytes }
}
