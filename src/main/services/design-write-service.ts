import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import type { DesignWriteAssetPayload, DesignWriteAssetResult } from '../../shared/design-write'
import { recheckContainedParent } from './canonical-containment'
import { atomicWriteFile } from './durable-file'
import {
  expandHomePath,
  normalizePathSeparators,
  resolveOpenTargetPath,
  resolveTargetPathWithinWorkspace
} from './workspace-paths'

const DESIGN_IMAGE_DIRECTORY = 'img'
const MAX_DESIGN_PNG_BYTES = 12 * 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export async function saveDesignAssetToWrite(
  payload: DesignWriteAssetPayload
): Promise<DesignWriteAssetResult> {
  try {
    const workspaceRoot = resolve(expandHomePath(payload.workspaceRoot))
    const currentFilePath = await resolveOpenTargetPath(
      payload.currentFilePath,
      workspaceRoot,
      { allowBasenameFallback: false }
    )
    const data = Buffer.from(payload.dataBase64, 'base64')
    if (data.length === 0 || data.length > MAX_DESIGN_PNG_BYTES) {
      return { ok: false, message: 'Design PNG is empty or exceeds the 12 MiB limit.' }
    }
    if (data.length < PNG_SIGNATURE.length || !data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      return { ok: false, message: 'Design output is not a valid PNG image.' }
    }

    const imageDir = await resolveTargetPathWithinWorkspace(DESIGN_IMAGE_DIRECTORY, workspaceRoot)
    await mkdir(imageDir, { recursive: true })
    const safeStem = designImageStem(payload.fileName)
    const targetPath = await resolveTargetPathWithinWorkspace(
      join(imageDir, `${safeStem}-${randomUUID().slice(0, 8)}.png`),
      workspaceRoot
    )
    await recheckContainedParent(workspaceRoot, targetPath)
    await atomicWriteFile(targetPath, data, {
      beforeReplace: () => recheckContainedParent(workspaceRoot, targetPath)
    })

    return {
      ok: true,
      path: targetPath,
      markdownPath: normalizePathSeparators(relative(dirname(currentFilePath), targetPath)),
      createdAt: new Date().toISOString()
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

function designImageStem(fileName: string): string {
  const stem = basename(fileName, '.png')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 96)
  return stem || 'design'
}
