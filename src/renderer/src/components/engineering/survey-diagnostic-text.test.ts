import { describe, expect, it } from 'vitest'
import { surveyDiagnosticText, surveyLegacyDiagnosticText } from './survey-diagnostic-text'

describe('Survey diagnostic presentation compatibility', () => {
  it('selects English explanations and recovery without mutating original evidence', () => {
    const diagnostic = Object.freeze({ message: '原始诊断记录', suggestedAction: '原始恢复操作', localized: { en: { message: 'Record 19 has duplicate WI83 fields.', suggestedAction: 'Re-export record 19 with one WI83 final-height field.' } } })
    expect(surveyDiagnosticText(diagnostic, 'en-US')).toBe('Record 19 has duplicate WI83 fields.')
    expect(surveyDiagnosticText(diagnostic, 'en', 'action')).toContain('record 19')
    expect(surveyDiagnosticText(diagnostic, 'zh-CN')).toBe('原始诊断记录')
    expect(diagnostic.message).toBe('原始诊断记录')
  })
  it('keeps a specific legacy failure when no translation is available', () => {
    expect(surveyDiagnosticText({ message: 'WI83 第 19 行无效', suggestion: '检查第 19 行' }, 'en')).toBe('WI83 第 19 行无效')
    expect(surveyDiagnosticText({ message: 'failure', suggestion: '检查第 19 行', localized: { en: { message: 'failure' } } }, 'en', 'action')).toBe('检查第 19 行')
  })
  it('translates only recognized legacy templates and preserves numeric details', () => {
    expect(surveyLegacyDiagnosticText('识别为 COSA(科傻) / cosa-in2，置信度 98%', 'en')).toBe('Detected COSA / cosa-in2; confidence 98%')
    expect(surveyLegacyDiagnosticText('文本编码 gb18030', 'en')).toBe('Text encoding: gb18030')
    expect(surveyLegacyDiagnosticText('文本编码 项目自定义', 'en')).toBe('文本编码 项目自定义')
    expect(surveyLegacyDiagnosticText('constructor', 'en')).toBe('constructor')
  })
})
