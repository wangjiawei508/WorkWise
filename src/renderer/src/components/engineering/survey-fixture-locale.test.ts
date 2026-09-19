import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { SurveyFormatRegistry } from '../../../../../kun/src/engineering/survey-format-registry'
import { surveyDiagnosticText, surveyLegacyDiagnosticText } from './survey-diagnostic-text'

it('renders all shipped source-file fixture diagnostics in English without rewriting raw evidence', async () => {
  const root = fileURLToPath(new URL('../../../../../kun/src/engineering/fixtures/survey-formats/', import.meta.url))
  const registry = new SurveyFormatRegistry()
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile() && !/\.(md|json)$/.test(entry.name))
  expect(files.length).toBeGreaterThanOrEqual(40)
  for (const entry of files) {
    const name = join(entry.parentPath, entry.name)
    const result = await registry.ingest({ name: basename(name), bytes: await readFile(name) })
    const source = result.sourceFile
    const original = JSON.stringify(source)
    for (const diagnostic of source.diagnostics) {
      for (const field of ['message', 'action'] as const) {
        expect(surveyDiagnosticText(diagnostic, 'en', field), `${entry.name}: ${diagnostic.code} ${field}`).not.toMatch(/\p{Script=Han}/u)
      }
      expect(surveyDiagnosticText(diagnostic, 'zh')).toBe(diagnostic.message)
    }
    expect(source.dispositionReasonEn ?? surveyLegacyDiagnosticText(source.dispositionReason ?? '', 'en'), `${entry.name}: disposition`).not.toMatch(/\p{Script=Han}/u)
    expect(JSON.stringify(source)).toBe(original)
  }
})

it('preserves opaque identifiers that happen to match a system diagnostic', () => {
  const point = 'XML 点记录缺少点号'
  expect(surveyLegacyDiagnosticText(`${point} 记录缺少测站 OP/目标 FP 或两者相同，未生成观测`, 'en')).toContain(point)
  expect(surveyLegacyDiagnosticText('COSA .in2 解析失败（invalid-direction）：第 6 行、第 6 列应为 a COSA D.MMSSs direction with minute and second fields below 60', 'en')).toContain('line 6, column 6')
  expect(surveyLegacyDiagnosticText('工程自定义诊断：请保留', 'en')).toBe('工程自定义诊断：请保留')
})
