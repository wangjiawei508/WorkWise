import { describe, expect, it } from 'vitest'
import { surveyDiagnosticText, surveyLegacyDiagnosticText, surveyRuntimeErrorText } from './survey-diagnostic-text'

describe('Survey diagnostic presentation compatibility', () => {
  it('selects English explanations and recovery without mutating original evidence', () => {
    const diagnostic = Object.freeze({ message: '原始诊断记录', suggestedAction: '原始恢复操作', localized: { en: { message: 'Record 19 has duplicate WI83 fields.', suggestedAction: 'Re-export record 19 with one WI83 final-height field.' } } })
    expect(surveyDiagnosticText(diagnostic, 'en-US')).toBe('Record 19 has duplicate WI83 fields.')
    expect(surveyDiagnosticText(diagnostic, 'en', 'action')).toContain('record 19')
    expect(surveyDiagnosticText(diagnostic, 'zh-CN')).toBe('原始诊断记录')
    expect(diagnostic.message).toBe('原始诊断记录')
  })
  it('translates historical strategy diagnostics while retaining identifiers, units and tolerances', () => {
    expect(surveyLegacyDiagnosticText('观测 angle-07 的中误差单位 arcmin 没有已确认的换算定义，不能进入平差。', 'en')).toBe('Observation angle-07 has no confirmed conversion for standard-error unit arcmin; adjustment is blocked.')
    expect(surveyLegacyDiagnosticText('水准闭合差 0.000127 超过限差 0.0001', 'en')).toBe('Leveling closure 0.000127 exceeds tolerance 0.0001.')
    expect(surveyLegacyDiagnosticText('平面控制网在 30 次迭代后未收敛', 'en')).toBe('The plane control network did not converge after 30 iterations.')
    expect(surveyLegacyDiagnosticText('平面观测 obs-7 的点 桥墩甲 缺少 X/Y 坐标', 'en')).toBe('Point 桥墩甲 in planar observation obs-7 has no X/Y coordinates.')
    expect(surveyLegacyDiagnosticText('来源准入证据无效：持久化记录哈希不匹配。', 'en')).toBe('Source admission evidence is invalid: The persisted record hash does not match.')
    expect(surveyLegacyDiagnosticText('原始资料完整性校验失败：自定义错误内容', 'en')).toContain('自定义错误内容')
  })
  it('preserves stable Runtime error codes and leaves unknown envelopes untouched', () => {
    expect(surveyRuntimeErrorText(JSON.stringify({ error: { code: 'survey_invalid', message: '网络没有观测记录' } }), 'en')).toBe('survey_invalid: The network has no observation records.')
    expect(surveyRuntimeErrorText(JSON.stringify({ error: 'survey_invalid', message: '网络没有观测记录' }), 'en')).toBe('survey_invalid: The network has no observation records.')
    expect(surveyRuntimeErrorText('{"unknown":"原始内容"}', 'en')).toBe('{"unknown":"原始内容"}')
    expect(surveyLegacyDiagnosticText('网络没有观测记录', 'zh')).toBe('网络没有观测记录')
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
