/** Presentation only: never change persisted audit messages or gate decisions. */
export type SurveyDiagnosticText = {
  message?: string
  suggestion?: string
  suggestedAction?: string
  localized?: { en: { message: string; suggestedAction?: string } }
}

const legacyActions: Record<string, string> = {
  '继续完成基准、控制点、观测角色、拓扑、闭合与精度校验；任一条件不满足都会阻断平差。': 'Validate datum, control points, observation roles, topology, closure and precision; any failed condition blocks adjustment.',
  '检查原始记录、显式映射和解析诊断；修正后通过重新检测/导入流程复核。': 'Inspect raw records, explicit mappings and parser diagnostics; correct the input and repeat detection/import.',
  '字段映射需要确认。': 'Field mapping requires confirmation.',
  '确认字段映射、单位和基准后重新导入。': 'Confirm field mapping, units and datum, then reimport.',
  '内容签名、记录结构和单位声明均已通过预检。': 'Content signatures, record structure and declared units passed preflight.'
}

/** Exact legacy compatibility; unknown text remains visible rather than losing evidence. */
export function surveyLegacyDiagnosticText(text: string, language: string): string {
  if (!language.toLowerCase().startsWith('en')) return text
  if (Object.prototype.hasOwnProperty.call(legacyActions, text)) return legacyActions[text]!
  const encoding = /^文本编码 (utf-8|utf-16le|utf-16be|gb18030)$/.exec(text)
  if (encoding) return `Text encoding: ${encoding[1]}`
  const detected = /^识别为 (.+)，置信度 (\d+)%$/.exec(text)
  if (detected) return `Detected ${detected[1]!.replace('COSA(科傻)', 'COSA')}; confidence ${detected[2]}%`
  return text
}

export function surveyDiagnosticText(item: SurveyDiagnosticText, language: string, field: 'message' | 'action' = 'message'): string {
  const original = field === 'message' ? item.message ?? '' : item.suggestedAction ?? item.suggestion ?? ''
  const english = field === 'message' ? item.localized?.en.message : item.localized?.en.suggestedAction
  return language.toLowerCase().startsWith('en') && english ? english : surveyLegacyDiagnosticText(original, language)
}
