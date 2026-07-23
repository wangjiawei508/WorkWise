import type { DesignPage } from '@shared/design-document'
import { pageToSvgString } from '@shared/design-svg-serializer'

const MAX_PNG_DIMENSION = 8_192
const MAX_PNG_PIXELS = 40_000_000

export function designExportFileStem(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 96)
  return normalized || 'design'
}

export function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function designPageToSvg(
  page: DesignPage,
  assetDataUrls?: Readonly<Record<string, string>>
): string {
  assertValidCanvas(page)
  assertPageAssetsAvailable(page, assetDataUrls)
  return pageToSvgString(page, { assetDataUrls })
}

export async function designPageToPngBase64(
  page: DesignPage,
  assetDataUrls?: Readonly<Record<string, string>>
): Promise<string> {
  if (
    page.width > MAX_PNG_DIMENSION ||
    page.height > MAX_PNG_DIMENSION ||
    page.width * page.height > MAX_PNG_PIXELS
  ) {
    throw new Error('Canvas is too large to export as PNG.')
  }

  const svg = designPageToSvg(page, assetDataUrls)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await loadSvgImage(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = page.width
    canvas.height = page.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('PNG canvas is unavailable.')
    context.drawImage(image, 0, 0, page.width, page.height)
    const dataUrl = canvas.toDataURL('image/png')
    const separator = dataUrl.indexOf(',')
    if (separator < 0) throw new Error('PNG encoding failed.')
    return dataUrl.slice(separator + 1)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function assertValidCanvas(page: DesignPage): void {
  if (
    !Number.isFinite(page.width) ||
    !Number.isFinite(page.height) ||
    !Number.isInteger(page.width) ||
    !Number.isInteger(page.height) ||
    page.width <= 0 ||
    page.height <= 0
  ) {
    throw new Error('Canvas dimensions must be positive finite integers.')
  }
}

function assertPageAssetsAvailable(
  page: DesignPage,
  assetDataUrls?: Readonly<Record<string, string>>
): void {
  for (const element of page.elements) {
    if (element.type !== 'image' || element.hidden) continue
    const dataUrl = element.imageAssetId ? assetDataUrls?.[element.imageAssetId] : undefined
    if (
      !dataUrl ||
      dataUrl.length > 18 * 1024 * 1024 ||
      !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(dataUrl)
    ) {
      throw new Error('A Design image asset is missing or invalid. Re-import the image before exporting.')
    }
  }
}

function loadSvgImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('SVG could not be rendered as PNG.'))
    image.src = source
  })
}
