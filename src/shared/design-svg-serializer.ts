import { formatSvgColor, type DesignDocumentV1, type DesignElement, type DesignPage } from './design-document'

const MAX_SVG_PATH_DATA_CHARS = 100_000
const SAFE_SVG_PATH_DATA = /^[0-9MmLlHhVvCcSsQqTtAaZzEe+.,\s-]+$/
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/
const MAX_IMAGE_DATA_URL_CHARS = 18 * 1024 * 1024

export type DesignSvgSerializationOptions = {
  assetDataUrls?: Readonly<Record<string, string>>
}

/**
 * Design 文档 → SVG 字符串序列化。
 *
 * 用于导出 PPTX：每页元素渲染为一个 <svg viewBox="0 0 W H"> 字符串，
 * 传给 PPT Master 的 svg_to_pptx.py 转换。
 *
 * 约束（✅ svg_quality_checker.py 已核实）：
 * - 全 inline 属性，无 class/style
 * - 颜色带 #（formatSvgColor）
 * - 无 rgba（用 opacity 属性）
 * - viewBox 原点 0 0
 * - 整数像素坐标
 */

/** 单个元素 → SVG 节点字符串（不含外层 <svg>） */
export function elementToSvgString(
  element: DesignElement,
  options?: DesignSvgSerializationOptions
): string {
  if (element.hidden) return ''

  const fill = formatSvgColor(element.fill) ?? 'none'
  const stroke = formatSvgColor(element.stroke)
  const strokeWidth = element.strokeWidth
  const opacity = element.opacity
  const transform = element.rotation !== 0
    ? `rotate(${element.rotation} ${element.x + element.w / 2} ${element.y + element.h / 2})`
    : ''

  const styleParts: string[] = []
  if (stroke !== undefined) styleParts.push(`stroke="${stroke}"`)
  if (strokeWidth !== undefined) styleParts.push(`stroke-width="${strokeWidth}"`)
  if (element.strokeLinecap !== undefined) {
    styleParts.push(`stroke-linecap="${element.strokeLinecap}"`)
  }
  if (element.strokeLinejoin !== undefined) {
    styleParts.push(`stroke-linejoin="${element.strokeLinejoin}"`)
  }
  if (opacity !== undefined) styleParts.push(`opacity="${opacity}"`)
  const styleStr = styleParts.join(' ')

  switch (element.type) {
    case 'rect':
      return `<rect x="${element.x}" y="${element.y}" width="${element.w}" height="${element.h}" fill="${fill}" ${styleStr} ${transform ? `transform="${transform}"` : ''} />`

    case 'ellipse':
      return `<ellipse cx="${element.x + element.w / 2}" cy="${element.y + element.h / 2}" rx="${element.w / 2}" ry="${element.h / 2}" fill="${fill}" ${styleStr} ${transform ? `transform="${transform}"` : ''} />`

    case 'line':
      return `<line x1="${element.x}" y1="${element.y}" x2="${element.x + element.w}" y2="${element.y + element.h}" fill="none" ${styleStr} ${transform ? `transform="${transform}"` : ''} />`

    case 'path':
      return `<path d="${escapeXmlAttribute(safePathData(element.pathData, fallbackPathData(element)))}" fill="${fill}" ${styleStr} ${transform ? `transform="${transform}"` : ''} />`

    case 'text': {
      const escaped = escapeXml(element.text ?? '')
      const fontSize = element.fontSize ?? 24
      const fontFamily = element.fontFamily ?? "system-ui, 'Microsoft YaHei', sans-serif"
      const fontWeight = element.fontWeight ?? 'normal'
      const textAnchor = element.textAlign === 'center' ? 'middle' : element.textAlign === 'right' ? 'end' : 'start'
      const textX = element.textAlign === 'center' ? element.x + element.w / 2 : element.textAlign === 'right' ? element.x + element.w : element.x
      return `<text x="${textX}" y="${element.y + fontSize}" font-family="${escapeXmlAttribute(fontFamily)}" font-size="${fontSize}" font-weight="${escapeXmlAttribute(fontWeight)}" text-anchor="${textAnchor}" fill="${fill}" ${styleStr} ${transform ? `transform="${transform}"` : ''}>${escaped}</text>`
    }

    case 'image':
      {
        const dataUrl = element.imageAssetId
          ? options?.assetDataUrls?.[element.imageAssetId]
          : undefined
        if (
          dataUrl &&
          dataUrl.length <= MAX_IMAGE_DATA_URL_CHARS &&
          SAFE_IMAGE_DATA_URL.test(dataUrl)
        ) {
          return `<image href="${escapeXmlAttribute(dataUrl)}" x="${element.x}" y="${element.y}" width="${element.w}" height="${element.h}" preserveAspectRatio="xMidYMid meet" ${opacity !== undefined ? `opacity="${opacity}"` : ''} ${transform ? `transform="${transform}"` : ''} />`
        }
      }
      return `<rect x="${element.x}" y="${element.y}" width="${element.w}" height="${element.h}" fill="#F3F4F6" stroke="#CBD5E1" stroke-width="1" ${transform ? `transform="${transform}"` : ''} />`

    case 'preset':
      if (
        (element.presetPaths?.length ?? 0) > 0 ||
        (element.pathData && safePathData(element.pathData, '') !== '')
      ) {
        const localTransform = `translate(${element.x} ${element.y}) scale(${element.w / 200} ${element.h / 150})`
        const presetPaths = element.presetPaths?.length
          ? element.presetPaths
          : [{ d: element.pathData ?? '', fill: element.fill }]
        const paths = presetPaths
          .map((presetPath) => {
            const d = safePathData(presetPath.d, '')
            if (!d) return ''
            const pathFill = presetPath.fill === null
              ? 'none'
              : formatSvgColor(presetPath.fill) ?? fill
            const pathStroke = presetPath.stroke === null
              ? 'none'
              : formatSvgColor(presetPath.stroke) ?? stroke
            const attributes = [
              `d="${escapeXmlAttribute(d)}"`,
              `fill="${pathFill}"`,
              ...(pathStroke !== undefined ? [`stroke="${pathStroke}"`] : []),
              ...(presetPath.strokeWidth !== undefined ? [`stroke-width="${presetPath.strokeWidth}"`] : []),
              ...(presetPath.opacity !== undefined ? [`opacity="${presetPath.opacity}"`] : [])
            ]
            return `<path ${attributes.join(' ')} />`
          })
          .filter(Boolean)
          .join('')
        if (paths) {
          const presetGroup = `<g id="${escapeXmlAttribute(element.id)}" data-pptx-authoring="preset" data-pptx-object="shape" data-pptx-prst="${escapeXmlAttribute(element.presetName ?? 'rect')}" data-pptx-frame="${element.x} ${element.y} ${element.w} ${element.h}" transform="${localTransform}">${paths}</g>`
          return transform ? `<g transform="${transform}">${presetGroup}</g>` : presetGroup
        }
      }
      return `<rect x="${element.x}" y="${element.y}" width="${element.w}" height="${element.h}" rx="8" ry="8" fill="${fill}" ${styleStr} ${transform ? `transform="${transform}"` : ''} />`

    case 'group':
      // group 导出为透明（子元素单独导出）
      return ''

    default:
      return ''
  }
}

/** 单页 → 完整 SVG 文档字符串 */
export function pageToSvgString(
  page: DesignPage,
  options?: DesignSvgSerializationOptions
): string {
  const bg = formatSvgColor(page.background) ?? '#FFFFFF'
  const sortedElements = [...page.elements]
    .filter((e) => !e.hidden)
    .sort((a, b) => a.zIndex - b.zIndex)

  const body = sortedElements.map((el) => `  ${elementToSvgString(el, options)}`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.width} ${page.height}">
  <rect width="${page.width}" height="${page.height}" fill="${bg}" />
${body}
</svg>`
}

/** 整个文档 → 每页一个 SVG 字符串（按页面顺序） */
export function documentToSvgStrings(
  doc: DesignDocumentV1,
  options?: DesignSvgSerializationOptions
): string[] {
  return doc.pages.map((page) => pageToSvgString(page, options))
}

/** XML 特殊字符转义 */
function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function escapeXmlAttribute(text: string): string {
  return escapeXml(text.replaceAll('\u0000', ''))
}

function fallbackPathData(element: DesignElement): string {
  return `M${element.x},${element.y} L${element.x + element.w},${element.y} L${element.x + element.w},${element.y + element.h} L${element.x},${element.y + element.h} Z`
}

function safePathData(pathData: string | undefined, fallback: string): string {
  if (
    typeof pathData !== 'string' ||
    pathData.length === 0 ||
    pathData.length > MAX_SVG_PATH_DATA_CHARS ||
    !SAFE_SVG_PATH_DATA.test(pathData)
  ) {
    return fallback
  }
  return pathData
}
