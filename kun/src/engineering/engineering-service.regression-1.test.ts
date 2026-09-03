import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { EngineeringService } from './engineering-service.js'

// Regression: ISSUE-002 — real multi-sheet XLSX files decoded Chinese headers as entities and treated notes sheets as observations.
// Found by /qa on 2026-09-04
// Report: .gstack/qa-reports/qa-report-workwise-candidate-2026-09-04.md
describe('EngineeringService XLSX regression', () => {
  it('imports observation sheets with numeric XML entities and ignores a metadata worksheet', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-engineering-xlsx-regression-'))
    const service = new EngineeringService({ rootDir: join(root, 'runtime') })
    const project = service.createProject({
      name: '真实 Excel 回归',
      workspace: join(root, 'workspace'),
      thresholds: { default: 10 },
      expectedRevision: 0,
      idempotencyKey: 'create-xlsx-regression-001'
    })
    const workbook = new JSZip()
    workbook.file('xl/worksheets/sheet1.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c t="inlineStr" r="A1"><is><t>&#30417;&#27979;&#39033;</t></is></c><c t="inlineStr" r="B1"><is><t>&#27979;&#28857;</t></is></c><c t="inlineStr" r="C1"><is><t>&#26102;&#38388;</t></is></c><c t="inlineStr" r="D1"><is><t>&#25968;&#20540;</t></is></c></row>
      <row r="2"><c t="inlineStr" r="A2"><is><t>&#27785;&#38477;</t></is></c><c t="inlineStr" r="B2"><is><t>JC01</t></is></c><c t="inlineStr" r="C2"><is><t>2026-08-28 08:00:00</t></is></c><c t="n" r="D2"><v>-1.2</v></c></row>
      <row r="3"><c t="inlineStr" r="A3"><is><t>&#27785;&#38477;</t></is></c><c t="inlineStr" r="B3"><is><t>JC01</t></is></c><c t="inlineStr" r="C3"><is><t>2026-08-29 08:00:00</t></is></c><c t="n" r="D3"><v>-1.6</v></c></row>
    </sheetData></worksheet>`)
    workbook.file('xl/worksheets/sheet2.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>&#23383;&#27573;</t></is></c><c r="B1" t="inlineStr"><is><t>&#20869;&#23481;</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>&#25968;&#25454;&#24615;&#36136;</t></is></c><c r="B2" t="inlineStr"><is><t>&#33073;&#25935;&#39564;&#25910;&#25968;&#25454;</t></is></c></row>
    </sheetData></worksheet>`)

    const dataset = await service.importDataset({
      projectId: project.id,
      expectedRevision: project.revision,
      idempotencyKey: 'import-xlsx-regression-001',
      name: 'monitoring.xlsx',
      dataBase64: (await workbook.generateAsync({ type: 'nodebuffer' })).toString('base64')
    })

    expect(dataset.fieldMapping).toMatchObject({ monitoringItem: '监测项', point: '测点', timestamp: '时间', value: '数值' })
    expect(dataset.rowCount).toBe(2)
    expect(dataset.observationCount).toBe(2)
    expect(dataset.findings.filter((finding) => finding.severity === 'blocking')).toEqual([])
    service.close()
  })
})
