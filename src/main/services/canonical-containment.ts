import { lstat, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, parse, relative, resolve } from 'node:path'

export class UnsafePathError extends Error {
  readonly code = 'unsafe_path'

  constructor(message = 'Path must stay within the selected workspace and must not cross unsafe links.') {
    super(message)
    this.name = 'UnsafePathError'
  }
}

export type ContainedPathOptions = {
  root: string
  target: string
  mustExist?: boolean
  allowRoot?: boolean
  expect?: 'file' | 'directory' | 'any'
  rejectFinalLink?: boolean
}

function normalizedForComparison(value: string): string {
  const normalized = resolve(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function isCanonicalPathContained(root: string, target: string): boolean {
  const normalizedRoot = normalizedForComparison(root)
  const normalizedTarget = normalizedForComparison(target)
  const rel = relative(normalizedRoot, normalizedTarget)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function assertSafePathInput(value: string): void {
  if (!value.trim()) throw new UnsafePathError('Path is required.')
  if (value.includes('\0')) throw new UnsafePathError('Path contains a NUL byte.')
  if (/^(?:\\\\[?.]\\|\\\\|\/\/)/.test(value)) {
    throw new UnsafePathError('UNC and device paths are not allowed.')
  }
  if (/^[a-zA-Z]:(?![\\/])/.test(value)) {
    throw new UnsafePathError('Drive-relative paths are not allowed.')
  }
  const root = parse(value).root
  if (/^[a-zA-Z]:[\\/]$/.test(root) && process.platform !== 'win32') {
    throw new UnsafePathError('Foreign drive paths are not allowed.')
  }
}

async function existingAncestor(target: string): Promise<string> {
  let current = target
  while (true) {
    try {
      await lstat(current)
      return current
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(current)
      if (parent === current) throw new UnsafePathError('No existing parent for path.')
      current = parent
    }
  }
}

async function canonicalCandidate(rootReal: string, candidate: string): Promise<string> {
  const ancestor = await existingAncestor(candidate)
  const ancestorReal = await realpath(ancestor)
  if (!isCanonicalPathContained(rootReal, ancestorReal)) throw new UnsafePathError()
  const tail = relative(ancestor, candidate)
  const canonical = resolve(ancestorReal, tail)
  if (!isCanonicalPathContained(rootReal, canonical)) throw new UnsafePathError()
  return canonical
}

export async function canonicalizeContainmentRoot(root: string): Promise<string> {
  assertSafePathInput(root)
  const rootReal = await realpath(resolve(root))
  const info = await stat(rootReal)
  if (!info.isDirectory()) throw new UnsafePathError('Workspace root is not a directory.')
  return rootReal
}

export async function resolveContainedPath(options: ContainedPathOptions): Promise<string> {
  assertSafePathInput(options.root)
  assertSafePathInput(options.target)

  const rootInput = resolve(options.root)
  const rootReal = await canonicalizeContainmentRoot(rootInput)
  const rawTarget = isAbsolute(options.target)
    ? resolve(options.target)
    : resolve(rootReal, options.target)
  const candidate = isCanonicalPathContained(rootInput, rawTarget)
    ? resolve(rootReal, relative(rootInput, rawTarget))
    : rawTarget

  if (!isCanonicalPathContained(rootReal, candidate)) throw new UnsafePathError()
  const canonical = await canonicalCandidate(rootReal, candidate)
  if (!options.allowRoot && normalizedForComparison(canonical) === normalizedForComparison(rootReal)) {
    throw new UnsafePathError('Operation on the workspace root is not allowed.')
  }

  let info
  try {
    const linkInfo = await lstat(candidate)
    if (options.rejectFinalLink && linkInfo.isSymbolicLink()) {
      throw new UnsafePathError('Symbolic links and junctions are not valid mutation targets.')
    }
    info = await stat(canonical)
  } catch (error) {
    if (error instanceof UnsafePathError) throw error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || options.mustExist) throw error
  }

  if (info && options.expect === 'file' && !info.isFile()) {
    throw new UnsafePathError('Target is not a regular file.')
  }
  if (info && options.expect === 'directory' && !info.isDirectory()) {
    throw new UnsafePathError('Target is not a directory.')
  }
  return canonical
}

/** Re-run immediately before rename/remove to detect a swapped parent link. */
export async function recheckContainedParent(root: string, target: string): Promise<void> {
  const rootReal = await canonicalizeContainmentRoot(root)
  const parentReal = await realpath(dirname(target))
  if (!isCanonicalPathContained(rootReal, parentReal)) throw new UnsafePathError()
}
