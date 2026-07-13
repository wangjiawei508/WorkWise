import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { normalizePathSeparators, resolveTargetPathWithinWorkspace } from './workspace-paths'
import {
  resolveKunImageGenerationSettings,
  type AppSettingsV1,
  type KunImageGenerationSettingsV1
} from '../../shared/app-settings'
import {
  WRITE_INFOGRAPHIC_MAX_TEXT_CHARS,
  type WriteInfographicRequest,
  type WriteInfographicResult
} from '../../shared/write-infographic'
import {
  mapImageSize,
  createImageGenClient,
  type ImageGenClient
} from '../../../kun/src/adapters/tool/image-gen-tool-provider.js'

// Matches WORKSPACE_IMAGE_DIR in workspace-files.ts so infographics land in
// the same workspace-level folder as pasted images.
const INFOGRAPHIC_IMAGE_DIR = 'img'
// Portrait reads best for infographics; mapImageSize('3:4', '1K') → 768x1024.
const INFOGRAPHIC_ASPECT_RATIO = '3:4'
const INFOGRAPHIC_SIZE_TIER = '1K'

const INFOGRAPHIC_PROMPT_PREFIX = [
  'Create a clean, modern infographic that visually summarizes the following content.',
  'Use a clear visual hierarchy: a short headline, grouped sections with icons or simple charts, and readable labels.',
  'Keep the text in the infographic in the same language as the source content. Flat design, light background.',
  'Source content:'
].join(' ')

export function isWriteInfographicConfigured(
  imageGeneration: Pick<KunImageGenerationSettingsV1, 'enabled' | 'baseUrl' | 'apiKey' | 'model'>
): boolean {
  return (
    imageGeneration.enabled &&
    Boolean(imageGeneration.baseUrl.trim()) &&
    Boolean(imageGeneration.apiKey.trim()) &&
    Boolean(imageGeneration.model.trim())
  )
}

export function buildWriteInfographicPrompt(text: string): string {
  const clipped = text.trim().slice(0, WRITE_INFOGRAPHIC_MAX_TEXT_CHARS)
  return `${INFOGRAPHIC_PROMPT_PREFIX}\n\n${clipped}`
}

export async function requestWriteInfographic(
  settings: AppSettingsV1,
  request: WriteInfographicRequest,
  options: { client?: ImageGenClient } = {}
): Promise<WriteInfographicResult> {
  const imageGeneration = resolveKunImageGenerationSettings(settings)
  if (!isWriteInfographicConfigured(imageGeneration)) {
    return { ok: false, message: 'image generation provider is not configured' }
  }

  const text = request.text.trim()
  if (!text) return { ok: false, message: 'selection text is empty' }

  const workspaceRoot = resolve(request.workspaceRoot)
  const filePath = resolve(request.filePath)
  const relativeToRoot = relative(workspaceRoot, filePath)
  if (!relativeToRoot || relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
    return { ok: false, message: 'document must be inside the write workspace' }
  }

  const client = options.client ?? createImageGenClient(imageGeneration)
  // An explicit defaultSize wins: users set it when their provider only
  // accepts fixed sizes (e.g. gpt-image's 1024x1536). Otherwise use a
  // portrait size that suits infographics.
  const size = imageGeneration.defaultSize.trim() ||
    mapImageSize(INFOGRAPHIC_ASPECT_RATIO, INFOGRAPHIC_SIZE_TIER, undefined)

  let image: { data: Buffer; mimeType: string }
  try {
    image = await client.generate({
      prompt: buildWriteInfographicPrompt(text),
      model: imageGeneration.model.trim(),
      ...(size && size !== 'auto' ? { size } : {}),
      timeoutMs: imageGeneration.timeoutMs,
      signal: AbortSignal.timeout(imageGeneration.timeoutMs)
    })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  const ext = image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType === 'image/webp' ? 'webp' : 'png'
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const fileName = `infographic-${stamp}-${randomBytes(2).toString('hex')}.${ext}`
  let absolutePath: string
  let markdownPath: string
  try {
    const imageDir = await resolveTargetPathWithinWorkspace(INFOGRAPHIC_IMAGE_DIR, workspaceRoot)
    await mkdir(imageDir, { recursive: true })
    absolutePath = join(imageDir, fileName)
    await writeFile(absolutePath, image.data)
    // imageDir is canonicalized (symlinks resolved), so derive the document
    // directory from the same canonical root to keep the relative link clean.
    const documentDir = join(dirname(imageDir), dirname(relativeToRoot))
    markdownPath = normalizePathSeparators(relative(documentDir, absolutePath))
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  return {
    ok: true,
    relativePath: markdownPath,
    absolutePath,
    fileName
  }
}
