import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { SurveyService } from './survey-service.js'

describe('SurveyService', () => {
  it('imports, validates and adjusts a weighted leveling network with traceable results', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({
      projectId: 'project-1', expectedRevision: 0, idempotencyKey: 'survey-import-level-1', networkType: 'leveling',
      network: {
        projectId: 'project-1', networkType: 'leveling', knownPoints: [{ id: 'BM1', pointClass: 'known', height: 100, known: true }],
        unknownPoints: [{ id: 'P1', pointClass: 'unknown', height: 100.2, known: false }],
        observations: [{ id: 'o1', type: 'height-difference', from: 'BM1', to: 'P1', value: 0.2, unit: 'm', sigma: 0.002 }],
        instrumentParameters: {}
      }
    })
    expect(network.id).toMatch(/^network_/)
    const checked = service.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'survey-validate-level-1' })
    expect(checked.qualityStatus).toBe('validated')
    const adjustment = service.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'survey-adjust-level-1' })
    expect(adjustment.run.status).toBe('completed')
    expect(adjustment.result.validation).toBe('valid')
    expect(adjustment.result.points.find((point) => point.id === 'P1')?.height).toBeCloseTo(100.2, 5)
    expect(adjustment.result.inputHash).toBe(adjustment.run.inputHash)
    service.close()
  })

  it('blocks a disconnected network and preserves idempotent imports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-'))
    const service = new SurveyService({ rootDir: root })
    const body = {
      projectId: 'project-2', expectedRevision: 0, idempotencyKey: 'survey-import-disconnected', networkType: 'leveling' as const,
      network: {
        projectId: 'project-2', networkType: 'leveling' as const, knownPoints: [{ id: 'BM1', pointClass: 'known' as const, height: 1, known: true }],
        unknownPoints: [{ id: 'P2', pointClass: 'unknown' as const, height: 2, known: false }],
        observations: [{ id: 'o2', type: 'height-difference' as const, from: 'P2', to: 'P2', value: 0, unit: 'm' }], instrumentParameters: {}
      }
    }
    const first = await service.importNetwork(body); const second = await service.importNetwork(body)
    expect(second.id).toBe(first.id)
    const checked = service.validateNetwork(first.id, { expectedRevision: first.revision, idempotencyKey: 'survey-validate-disconnected' })
    expect(checked.qualityStatus).toBe('blocked')
    expect(checked.findings.some((item) => item.code === 'disconnected_network')).toBe(true)
    service.close()
  })

  it('does not fabricate GNSS adjustment without covariance and fixed datum', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-'))
    const service = new SurveyService({ rootDir: root })
    const network = await service.importNetwork({ projectId: 'project-3', expectedRevision: 0, idempotencyKey: 'survey-import-gnss-1', network: {
      projectId: 'project-3', networkType: 'gnss', knownPoints: [], unknownPoints: [{ id: 'P1' }], observations: [{ id: 'g1', type: 'gnss-baseline', from: 'P1', to: 'P1', value: 0, unit: 'm' }]
    } })
    const adjustment = service.createAdjustment({ networkId: network.id, expectedRevision: network.revision, idempotencyKey: 'survey-adjust-gnss-1' })
    expect(adjustment.run.status).toBe('needs_attention')
    expect(adjustment.result.qualityFindings.some((item) => item.code === 'missing_covariance')).toBe(true)
    service.close()
  })

  it('imports a multi-sheet XLSX survey network with worksheet provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-survey-xlsx-'))
    const service = new SurveyService({ rootDir: root })
    const workbook = new JSZip()
    const sheet = (point: string) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>type</t></is></c><c r="B1" t="inlineStr"><is><t>from</t></is></c><c r="C1" t="inlineStr"><is><t>to</t></is></c><c r="D1" t="inlineStr"><is><t>value</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>height-difference</t></is></c><c r="B2" t="inlineStr"><is><t>BM</t></is></c><c r="C2" t="inlineStr"><is><t>${point}</t></is></c><c r="D2" t="inlineStr"><is><t>1</t></is></c></row></sheetData></worksheet>`
    workbook.file('xl/worksheets/sheet1.xml', sheet('P1')); workbook.file('xl/worksheets/sheet2.xml', sheet('P2'))
    const network = await service.importNetwork({ projectId: 'project-xlsx', expectedRevision: 0, idempotencyKey: 'survey-import-xlsx-1', name: 'survey.xlsx', dataBase64: (await workbook.generateAsync({ type: 'nodebuffer' })).toString('base64'), networkType: 'leveling' })
    expect(network.observations).toHaveLength(2)
    expect(network.observations[0]?.sourceLocator).toContain('sheet1.xml')
    service.close()
  })
})
