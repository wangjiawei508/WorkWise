import surveyServiceEnglish from '../../locales/en/survey-service.json'
import engineeringEnglish from '../../locales/en/engineering-diagnostics.json'
const serviceEnglish = { ...surveyServiceEnglish, ...engineeringEnglish }

/** Presentation only: never change persisted audit messages or gate decisions. */
export type SurveyDiagnosticText = {
  message?: string
  suggestion?: string
  suggestedAction?: string
  localized?: { en: { message: string; suggestedAction?: string } }
}

const legacyActions: Record<string, string> = {
  ...serviceEnglish,
  '角度': 'angular ',
  '线性': 'linear ',
  '继续完成基准、控制点、观测角色、拓扑、闭合与精度校验；任一条件不满足都会阻断平差。': 'Validate datum, control points, observation roles, topology, closure and precision; any failed condition blocks adjustment.',
  '检查原始记录、显式映射和解析诊断；修正后通过重新检测/导入流程复核。': 'Inspect raw records, explicit mappings and parser diagnostics; correct the input and repeat detection/import.',
  '字段映射需要确认。': 'Field mapping requires confirmation.',
  '确认字段映射、单位和基准后重新导入。': 'Confirm field mapping, units and datum, then reimport.',
  '内容签名、记录结构和单位声明均已通过预检。': 'Content signatures, record structure and declared units passed preflight.'
}

const serviceTemplates = Object.entries(serviceEnglish).filter(([source]) => /\{\d+\}/.test(source)).map(([source, english]) => ({
  literals: source.split(/\{\d+\}/),
  parameters: [...source.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1])),
  english
}))

// Scan literal boundaries without a backtracking regex over untrusted IDs.
// Ambiguous or unknown input remains verbatim rather than losing evidence.
function translatedServiceTemplate(text: string, depth = 0): string | undefined {
  if (depth > 3 || text.length > 16384) return undefined
  if (Object.prototype.hasOwnProperty.call(legacyActions, text)) return legacyActions[text]
  for (const { literals, parameters, english } of serviceTemplates) {
    if (!text.startsWith(literals[0]!)) continue
    let cursor = literals[0]!.length
    const values: Record<number, string> = {}
    let matched = true
    for (let index = 0; index < parameters.length; index++) {
      const suffix = literals[index + 1]!
      const last = index === parameters.length - 1
      const end = last ? text.length - suffix.length : suffix ? text.indexOf(suffix, cursor) : cursor
      if (end < cursor || text.slice(end, end + suffix.length) !== suffix) { matched = false; break }
      const value = text.slice(cursor, end)
      values[parameters[index]!] = translatedServiceTemplate(value, depth + 1) ?? value
      cursor = end + suffix.length
    }
    if (matched && cursor === text.length) return english.replace(/\{(\d+)\}/g, (_, id: string) => values[Number(id)] ?? '')
  }
  return undefined
}

/** Exact legacy compatibility; unknown text remains visible rather than losing evidence. */
export function surveyLegacyDiagnosticText(text: string, language: string): string {
  if (!language.toLowerCase().startsWith('en')) return text
  const serviceText = translatedServiceTemplate(text)
  if (serviceText !== undefined) return serviceText
  const encoding = /^文本编码 (utf-8|utf-16le|utf-16be|gb18030)$/.exec(text)
  if (encoding) return `Text encoding: ${encoding[1]}`
  const detected = /^识别为 (.+)，置信度 (\d+)%$/.exec(text)
  if (detected) return `Detected ${detected[1]!.replace('COSA(科傻)', 'COSA')}; confidence ${detected[2]}%`
  return text
}

/** Decode the existing Runtime error envelope without hiding its stable code. */
export function surveyRuntimeErrorText(text: string, language: string): string {
  let message = text
  try {
    const body = JSON.parse(text) as { error?: string | { code?: string; message?: string }; message?: string }
    if (typeof body.error === 'string') message = body.message ? `${body.error}: ${surveyLegacyDiagnosticText(body.message, language)}` : body.error
    else if (body.error && typeof body.error.message === 'string') message = `${body.error.code ? `${body.error.code}: ` : ''}${surveyLegacyDiagnosticText(body.error.message, language)}`
    else if (typeof body.message === 'string') message = body.message
  } catch { /* Plain-text Runtime errors are supported by older versions. */ }
  return surveyLegacyDiagnosticText(message, language)
}

export function surveyDiagnosticText(item: SurveyDiagnosticText, language: string, field: 'message' | 'action' = 'message'): string {
  const original = field === 'message' ? item.message ?? '' : item.suggestedAction ?? item.suggestion ?? ''
  const english = field === 'message' ? item.localized?.en.message : item.localized?.en.suggestedAction
  return language.toLowerCase().startsWith('en') && english ? english : surveyLegacyDiagnosticText(original, language)
}
