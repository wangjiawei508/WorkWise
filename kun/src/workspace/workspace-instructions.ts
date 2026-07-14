import { lstat, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const INSTRUCTION_NAMES = ['AGENTS.md', 'CLAUDE.md', 'WORKWISE.md'] as const
const MAX_INSTRUCTION_FILE_BYTES = 64 * 1024
const MAX_INSTRUCTION_TOTAL_BYTES = 256 * 1024

export type WorkspaceInstruction = {
  path: string
  content: string
}

export async function loadWorkspaceInstructions(
  workspaceRoot: string,
  currentPath = workspaceRoot
): Promise<WorkspaceInstruction[]> {
  if (!workspaceRoot.trim()) return []
  const root = await realpath(resolve(workspaceRoot))
  const current = await realpath(resolve(currentPath))
  assertContained(root, current)
  const currentInfo = await lstat(current)
  let cursor = currentInfo.isDirectory() ? current : dirname(current)
  const directories: string[] = []
  while (true) {
    directories.push(cursor)
    if (cursor === root) break
    const parent = dirname(cursor)
    assertContained(root, parent)
    if (parent === cursor) break
    cursor = parent
  }
  directories.reverse()

  const instructions: WorkspaceInstruction[] = []
  let totalBytes = 0
  for (const directory of directories) {
    for (const name of INSTRUCTION_NAMES) {
      const path = join(directory, name)
      try {
        const info = await lstat(path)
        if (!info.isFile() || info.isSymbolicLink()) continue
        if (info.size > MAX_INSTRUCTION_FILE_BYTES) continue
        const canonical = await realpath(path)
        assertContained(root, canonical)
        const content = await readFile(canonical, 'utf8')
        const bytes = Buffer.byteLength(content, 'utf8')
        if (bytes > MAX_INSTRUCTION_FILE_BYTES || totalBytes + bytes > MAX_INSTRUCTION_TOTAL_BYTES) continue
        totalBytes += bytes
        instructions.push({ path: canonical, content })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') continue
      }
    }
  }
  return instructions
}

function assertContained(root: string, target: string): void {
  const rel = relative(root, target)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('workspace instruction path escapes the workspace')
  }
}

export function formatWorkspaceInstructions(instructions: WorkspaceInstruction[]): string[] {
  return instructions.map((instruction) => [
    `Workspace instructions (${instruction.path}):`,
    instruction.content
  ].join('\n'))
}
