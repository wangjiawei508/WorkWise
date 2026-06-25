import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import {
  DEFAULT_AGNES_BASE_URL,
  DEFAULT_AGNES_IMAGE_MODEL,
  DEFAULT_AGNES_PROVIDER_ID,
  type AppSettingsV1,
  getModelProviderProfile
} from '../../shared/app-settings'
import {
  AGNES_IMAGE_DIRECTORY,
  isAgnesImageSize,
  type AgnesImageGenerationPayload,
  type AgnesImageGenerationResult
} from '../../shared/agnes-image'
import { upstreamOpenAiImagesGenerationsUrl } from '../../shared/openai-compat-url'
import {
  normalizePathSeparators,
  resolveOpenTargetPath,
  resolveTargetPathWithinWorkspace
} from './workspace-paths'

const AGNES_IMAGE_TIMEOUT_MS = 120_000
const AGNES_IMAGE_DOWNLOAD_TIMEOUT_MS = 120_000
const MAX_AGNES_IMAGE_PROMPT_CHARS = 8_000

type AgnesImageRequest = {
  url: string
  apiKey: string
  model: string
  prompt: string
  size: string
}

type AgnesImageData = {
  url?: string
  b64_json?: string
  revised_prompt?: string
}

type DownloadedImage = {
  bytes: Buffer
  mimeType: string
}

const IMAGE_EXTENSION_BY_MIME = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
])

export function buildAgnesImageRequest(
  settings: AppSettingsV1,
  payload: AgnesImageGenerationPayload
): AgnesImageRequest {
  const provider = getModelProviderProfile(
    settings,
    payload.providerId?.trim() || DEFAULT_AGNES_PROVIDER_ID
  )
  const apiKey = provider.apiKey.trim()
  if (!apiKey) {
    throw new Error('Agnes AI API Key is missing. Add it in Settings > Agents > Model Provider.')
  }
  const prompt = payload.prompt.trim()
  if (!prompt) throw new Error('Image prompt is required.')
  if (prompt.length > MAX_AGNES_IMAGE_PROMPT_CHARS) {
    throw new Error(`Image prompt is too long. Keep it under ${MAX_AGNES_IMAGE_PROMPT_CHARS} characters.`)
  }
  const baseUrl = provider.baseUrl.trim() || DEFAULT_AGNES_BASE_URL
  const model = payload.model?.trim() || DEFAULT_AGNES_IMAGE_MODEL
  const size = isAgnesImageSize(payload.size) ? payload.size : '1536x1024'
  return {
    url: upstreamOpenAiImagesGenerationsUrl(baseUrl),
    apiKey,
    model,
    prompt,
    size
  }
}

export async function generateAgnesImage(
  settings: AppSettingsV1,
  payload: AgnesImageGenerationPayload
): Promise<AgnesImageGenerationResult> {
  try {
    const request = buildAgnesImageRequest(settings, payload)
    const response = await fetch(request.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        size: request.size,
        n: 1,
        response_format: 'url',
        extra_body: {
          response_format: 'url'
        }
      }),
      signal: AbortSignal.timeout(AGNES_IMAGE_TIMEOUT_MS)
    })
    const text = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        message: `Agnes image request failed (${response.status}): ${text.slice(0, 500)}`
      }
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      return { ok: false, message: 'Agnes image request returned a non-JSON body.' }
    }
    const imageData = firstAgnesImageData(parsed)
    if (!imageData) {
      return { ok: false, message: 'Agnes image response did not include data[0].url or data[0].b64_json.' }
    }

    const image = await imageBytesFromAgnesData(imageData)
    const saved = await saveGeneratedWorkspaceImage(payload, image)
    return {
      ok: true,
      path: saved.path,
      markdownPath: saved.markdownPath,
      mimeType: image.mimeType,
      size: image.bytes.length,
      model: request.model,
      prompt: request.prompt,
      createdAt: saved.createdAt,
      ...(imageData.revised_prompt ? { revisedPrompt: imageData.revised_prompt } : {})
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

function firstAgnesImageData(parsed: unknown): AgnesImageData | null {
  if (!parsed || typeof parsed !== 'object') return null
  const data = (parsed as { data?: unknown }).data
  if (!Array.isArray(data)) return null
  const first = data[0]
  if (!first || typeof first !== 'object') return null
  const url = typeof (first as { url?: unknown }).url === 'string'
    ? (first as { url: string }).url.trim()
    : ''
  const b64 = typeof (first as { b64_json?: unknown }).b64_json === 'string'
    ? (first as { b64_json: string }).b64_json.trim()
    : ''
  const revisedPrompt = typeof (first as { revised_prompt?: unknown }).revised_prompt === 'string'
    ? (first as { revised_prompt: string }).revised_prompt.trim()
    : ''
  if (!url && !b64) return null
  return {
    ...(url ? { url } : {}),
    ...(b64 ? { b64_json: b64 } : {}),
    ...(revisedPrompt ? { revised_prompt: revisedPrompt } : {})
  }
}

async function imageBytesFromAgnesData(data: AgnesImageData): Promise<DownloadedImage> {
  if (data.b64_json) {
    return {
      bytes: Buffer.from(data.b64_json, 'base64'),
      mimeType: 'image/png'
    }
  }
  if (!data.url) throw new Error('Agnes image response did not include an image URL.')
  if (data.url.startsWith('data:')) return imageBytesFromDataUrl(data.url)

  const response = await fetch(data.url, {
    method: 'GET',
    headers: { Accept: 'image/*,*/*;q=0.8' },
    signal: AbortSignal.timeout(AGNES_IMAGE_DOWNLOAD_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`Generated image download failed (${response.status}).`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) throw new Error('Generated image download returned an empty file.')
  return {
    bytes,
    mimeType: normalizeImageMimeType(response.headers.get('content-type'))
  }
}

function imageBytesFromDataUrl(url: string): DownloadedImage {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(url)
  if (!match) throw new Error('Agnes returned an invalid data URL.')
  const mimeType = normalizeImageMimeType(match[1] || 'image/png')
  const encoded = match[3] ?? ''
  const bytes = match[2]
    ? Buffer.from(encoded, 'base64')
    : Buffer.from(decodeURIComponent(encoded), 'utf8')
  if (!bytes.length) throw new Error('Agnes returned an empty data URL image.')
  return { bytes, mimeType }
}

function normalizeImageMimeType(raw: string | null): string {
  const mimeType = raw?.split(';')[0]?.trim().toLowerCase() ?? ''
  return IMAGE_EXTENSION_BY_MIME.has(mimeType) ? mimeType : 'image/png'
}

async function saveGeneratedWorkspaceImage(
  payload: AgnesImageGenerationPayload,
  image: DownloadedImage
): Promise<{ path: string; markdownPath: string; createdAt: string }> {
  const currentFilePath = await resolveOpenTargetPath(payload.currentFilePath, payload.workspaceRoot, {
    allowBasenameFallback: false
  })
  const imageDirectory = payload.imageDirectory?.trim() || AGNES_IMAGE_DIRECTORY
  const imageDir = await resolveTargetPathWithinWorkspace(imageDirectory, payload.workspaceRoot)
  await mkdir(imageDir, { recursive: true })

  const targetPath = await resolveTargetPathWithinWorkspace(
    join(imageDir, buildGeneratedImageName(image.mimeType)),
    payload.workspaceRoot
  )
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, image.bytes)

  return {
    path: targetPath,
    markdownPath: normalizePathSeparators(relative(dirname(currentFilePath), targetPath)),
    createdAt: new Date().toISOString()
  }
}

function buildGeneratedImageName(mimeType: string, now = new Date()): string {
  const iso = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
  const extension = IMAGE_EXTENSION_BY_MIME.get(mimeType) ?? '.png'
  const safeExtension = /^\.[a-z0-9]+$/i.test(extension) ? extension : '.png'
  return `agnes-image-${iso}-${randomUUID().slice(0, 8)}${safeExtension}`
}
