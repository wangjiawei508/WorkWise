// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SurveyAdjustmentPanel } from './SurveyAdjustmentPanel'
import i18n from '../../i18n'

let container: HTMLDivElement
let root: Root
let runtimeRequest: ReturnType<typeof vi.fn>
let validationResponse: unknown

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function runtimeResponse(body: unknown): { ok: true; status: 200; body: string } {
  return { ok: true, status: 200, body: JSON.stringify(body) }
}

const network = {
  id: 'network-restored-001',
  revision: 2,
  networkType: 'leveling',
  coordinateSystem: '工程独立坐标系',
  verticalDatum: '1985 国家高程基准',
  knownPoints: [{ id: 'BM-01', pointClass: 'known', height: 100, known: true }],
  unknownPoints: [{ id: 'P-01', pointClass: 'unknown', height: 100.2, known: false }],
  observations: [{ id: 'obs-1', type: 'height-difference', from: 'BM-01', to: 'P-01', value: 0.2, unit: 'm', sigma: 0.002 }],
  rawSourceIntegrity: { status: 'verified', ledgerEntryCount: 2, errors: [] },
  sourceEligibility: { eligible: true, findings: [] },
  sourceFile: {
    name: 'level.gsi',
    size: 512,
    sha256: 'a'.repeat(64),
    originalPreserved: true,
    formatId: 'leica-gsi8',
    vendor: 'Leica/Hexagon',
    formatVersion: '8',
    detectionMethod: 'content-signature',
    detectionConfidence: 0.98,
    extensionClaimed: '.gsi',
    extensionContentConflict: false,
    requiresManualConfirmation: false,
    detection: { format: 'leica-gsi8', vendor: 'Leica/Hexagon', version: '8', method: 'content-signature', confidence: 0.98, extension: '.gsi', matchedSignatures: ['GSI word index/sign/value'], extensionConflict: false },
    disposition: 'adjustment-ready',
    dispositionReason: '内容签名、记录结构和单位声明均已通过预检。',
    parserId: 'survey-format-registry',
    parserVersion: 'workwise-survey-formats-1',
    parserSourceHash: 'p'.repeat(64),
    linearUnitRaw: 'GSI 米制末位 1 mm',
    angularUnitRaw: 'gon',
    linearUnitCanonical: 'm',
    angularUnitCanonical: 'rad',
    datumDeclared: 'CGCS2000',
    heightSystemDeclared: '1985 国家高程基准',
    recordCount: 1,
    summary: { pointCount: 2, stationCount: 1, observationCount: 1, recordCount: 1, skippedRecordCount: 0 },
    diagnostics: [
      { code: 'format_detected', severity: 'info', message: '识别为 Leica GSI-8' },
      { code: 'mapping_required', severity: 'warning', message: '字段映射需要确认。', suggestedAction: '确认字段映射、单位和基准后重新导入。' }
    ],
    records: [{ id: 'record-1', sourceRecord: 1, rawOffset: 137, rawLength: 29, rawLineNo: 1, line: 1, recordType: 'GSI', section: 'network.observations', rawSnippet: '{"id":"obs-1","value":0.2}' }],
    rawRecordAnchors: [{ id: 'record-1', sourceRecord: 1, rawOffset: 137, rawLength: 29, rawLineNo: 1, line: 1, recordType: 'GSI', section: 'network.observations', rawSnippet: '{"id":"obs-1","value":0.2}' }]
  },
  qualityStatus: 'validated',
  findings: []
}

const archiveOnlyNetwork = {
  ...network,
  id: 'network-archive-only-002',
  revision: 1,
  sourceEligibility: {
    eligible: false,
    findings: [{ code: 'converter_required', severity: 'blocking', message: '需要受审计的本地转换器。', suggestion: '安装并授权受审计的本地转换器后重新导入。' }]
  },
  sourceFile: {
    ...network.sourceFile,
    name: 'misnamed.dat',
    size: 256,
    sha256: 'b'.repeat(64),
    formatId: 'trimble-t02',
    vendor: 'Trimble',
    formatVersion: 'T02',
    detectionMethod: 'content-signature',
    detectionConfidence: 0.99,
    extensionClaimed: '.dat',
    extensionContentConflict: true,
    requiresManualConfirmation: true,
    detection: { format: 'trimble-t02', vendor: 'Trimble', version: 'T02', method: 'content-signature', confidence: 0.99, extension: '.dat', matchedSignatures: ['Trimble T02 binary signature'], extensionConflict: true },
    disposition: 'converter-required',
    dispositionReason: 'converter-required: 未安装经审计的本地转换器。',
    parserId: 'trimble-container-probe',
    parserVersion: 'workwise-survey-formats-1',
    parserSourceHash: 'q'.repeat(64),
    converterId: 'fixture-trimble-converter',
    converterVersion: '1.0.0',
    converterBinaryHash: 'c'.repeat(64),
    converter: { id: 'fixture-trimble-converter', version: '1.0.0', license: 'fixture-only', executableHash: 'c'.repeat(64), inputHash: 'b'.repeat(64), networkAccess: 'none', arguments: ['--input', '{input}', '--output', '{output}'], status: 'blocked' },
    recordCount: 2,
    summary: { pointCount: 0, stationCount: 0, observationCount: 0, recordCount: 2, skippedRecordCount: 2 },
    diagnostics: [{ code: 'converter_required', severity: 'blocking', message: '需要受审计的本地转换器。', suggestedAction: '安装并授权受审计的本地转换器后重新导入。' }],
    rawRecordAnchors: []
  },
  qualityStatus: 'blocked',
  findings: [{ code: 'source_not_adjustment_ready', severity: 'blocking', message: '源文件仅可转换后重导。' }]
}

const legacyNetwork = {
  ...network,
  id: 'network-legacy-003',
  revision: 1,
  rawSourceIntegrity: { status: 'legacy-unverified', ledgerEntryCount: 0, errors: ['原始资料未由当前导入链路验证'] },
  sourceEligibility: {
    eligible: false,
    findings: [{ code: 'source_not_adjustment_ready', severity: 'blocking', message: '旧版来源未通过当前运行时资格核验。', suggestion: '从保留的原始文件重新导入。' }]
  },
  sourceFile: {
    name: 'legacy.gsi',
    size: 128,
    sha256: 'd'.repeat(64),
    originalPreserved: true,
    detection: { format: 'leica-gsi8', vendor: 'Leica/Hexagon', confidence: 0.9, extension: '.gsi', matchedSignatures: ['legacy signature'], extensionConflict: false },
    disposition: 'archive-only',
    parserId: 'legacy-parser',
    parserVersion: 'legacy-1',
    datumDeclared: null,
    heightSystemDeclared: null,
    recordCount: 1,
    diagnostics: [],
    rawRecordAnchors: []
  },
  qualityStatus: 'blocked',
  findings: []
}

const pendingEligibilityNetwork = {
  ...network,
  id: 'network-pending-eligibility-004',
  revision: 1,
  sourceEligibility: undefined,
  sourceFile: {
    ...network.sourceFile,
    name: 'pending-eligibility.gsi'
  }
}

const historicalIneligibleNetwork = {
  ...network,
  id: 'network-historical-ineligible-004',
  revision: 3,
  rawSourceIntegrity: { status: 'failed' as const, ledgerEntryCount: 2, errors: ['保留的原始文件内容与导入账本不一致'] },
  sourceEligibility: {
    eligible: false,
    findings: [{ code: 'raw_source_integrity_failed', severity: 'blocking', message: '原始资料完整性校验失败。', suggestion: '恢复保留原件或重新导入。' }]
  },
  sourceFile: { ...network.sourceFile, name: 'historical-source-revoked.gsi' },
  qualityStatus: 'blocked'
}

const adjustment = {
  observationEpoch: '2026-08-22T00:00:00.000Z',
  networkType: 'leveling',
  coordinateSystem: network.coordinateSystem,
  verticalDatum: network.verticalDatum,
  rawSourceIntegrity: { status: 'verified' as const, ledgerEntryCount: 2, errors: [] },
  sourceEligibility: { eligible: true, findings: [] },
  run: {
    id: 'adjustment-restored-001',
    networkId: network.id,
    status: 'completed',
    revision: 1,
    createdAt: '2026-08-22T00:01:00.000Z'
  },
  result: {
    id: 'result-restored-001',
    validation: 'valid',
    strategyId: 'leveling',
    algorithmVersion: 'survey-wls-v1',
    observationCount: 1,
    unknownCount: 1,
    redundancy: 1,
    degreesOfFreedom: 1,
    linearUnit: 'm',
    angularUnit: 'rad',
    unitWeightStdDev: 0.0004472136,
    unitWeightStdDevUnit: 'dimensionless',
    varianceFactor: 0.0000002,
    varianceFactorUnit: 'dimensionless',
    varianceFactorEstimated: true,
    closure: { heightDifference: 0.0001 },
    closureUnits: { heightDifference: 'm' },
    precision: { maxPointStdDev: 0.0005, passed: true },
    qualityFindings: [],
    covariance: [[0.00000025]],
    points: [{ id: 'P-01', height: 100.2001, correctionHeight: 0.0001, standardError: 0.0005 }],
    observations: [
      { observationId: 'obs-1', residual: 0.0001, unit: 'm', standardizedResidual: 0.2, standardizedResidualUnit: 'sigma', sourceRecordId: 'record-1' },
      { observationId: 'obs-without-source', residual: 0.0002, unit: 'm', standardizedResidual: 0.4, standardizedResidualUnit: 'sigma' }
    ]
  }
}

const historicalIneligibleAdjustment = {
  ...adjustment,
  rawSourceIntegrity: { status: 'failed' as const, ledgerEntryCount: 2, errors: ['保留的原始文件内容与导入账本不一致'] },
  sourceEligibility: {
    eligible: false,
    findings: [{ code: 'raw_source_integrity_failed', severity: 'blocking', message: '原始资料完整性校验失败。', suggestion: '恢复保留原件或重新导入。' }]
  },
  run: { ...adjustment.run, id: 'adjustment-historical-ineligible-004', networkId: historicalIneligibleNetwork.id },
  result: { ...adjustment.result, id: 'result-historical-ineligible-004' }
}

const outOfRangeAnchor = { id: 'record-1', sourceRecord: 1, rawOffset: 500, rawLength: 20, rawLineNo: 1, line: 1, recordType: 'GSI', section: 'network.observations', rawSnippet: '{"id":"obs-1","value":0.2}' }
const outOfRangeNetwork = {
  ...network,
  id: 'network-out-of-range-anchor-005',
  sourceFile: {
    ...network.sourceFile,
    name: 'out-of-range-anchor.gsi',
    records: [outOfRangeAnchor],
    rawRecordAnchors: [outOfRangeAnchor]
  }
}

const wholeFileAnchor = { id: 'record-1', sourceRecord: 1, rawOffset: 0, rawLength: 512, rawLineNo: 1, line: 1, recordType: 'GSI', section: 'network.observations', rawSnippet: '{"id":"obs-1","value":0.2}' }
const secondRawRecordAnchor = { id: 'record-2', sourceRecord: 2, rawOffset: 137, rawLength: 29, rawLineNo: 2, line: 2, recordType: 'GSI', section: 'network.observations', rawSnippet: '{"id":"obs-2","value":0.3}' }
const wholeFileAnchorNetwork = {
  ...network,
  id: 'network-whole-file-anchor-006',
  sourceFile: {
    ...network.sourceFile,
    name: 'whole-file-anchor.gsi',
    recordCount: 2,
    summary: { ...network.sourceFile.summary, recordCount: 2 },
    records: [wholeFileAnchor, secondRawRecordAnchor],
    rawRecordAnchors: [wholeFileAnchor, secondRawRecordAnchor]
  }
}

const outOfRangeAdjustment = {
  ...adjustment,
  run: { ...adjustment.run, id: 'adjustment-out-of-range-005', networkId: outOfRangeNetwork.id },
  result: {
    ...adjustment.result,
    id: 'result-out-of-range-005',
    observations: [{ observationId: 'obs-1', residual: 0.0001, unit: 'm', standardizedResidual: 0.2, standardizedResidualUnit: 'sigma', sourceRecordId: 'record-1' }]
  }
}

const wholeFileAnchorAdjustment = {
  ...adjustment,
  run: { ...adjustment.run, id: 'adjustment-whole-file-006', networkId: wholeFileAnchorNetwork.id },
  result: {
    ...adjustment.result,
    id: 'result-whole-file-006',
    observations: [{ observationId: 'obs-1', residual: 0.0001, unit: 'm', standardizedResidual: 0.2, standardizedResidualUnit: 'sigma', sourceRecordId: 'record-1' }]
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('zh')
  validationResponse = undefined
  runtimeRequest = vi.fn(async (path: string, method?: string) => {
    if (path === '/v1/engineering/survey/networks?projectId=project-restored-001' && method === 'GET') {
      return runtimeResponse({ networks: [network, archiveOnlyNetwork, legacyNetwork, pendingEligibilityNetwork, historicalIneligibleNetwork, outOfRangeNetwork, wholeFileAnchorNetwork] })
    }
    if (path === '/v1/engineering/adjustments?projectId=project-restored-001' && method === 'GET') {
      return runtimeResponse({ adjustments: [adjustment, historicalIneligibleAdjustment, outOfRangeAdjustment, wholeFileAnchorAdjustment] })
    }
    if (path === `/v1/engineering/survey/networks/${network.id}/validate` && method === 'POST') {
      return runtimeResponse({ network: validationResponse ?? network })
    }
    if (path === '/v1/engineering/adjustments' && method === 'POST') {
      return runtimeResponse(adjustment)
    }
    throw new Error(`Unexpected Runtime request: ${method} ${path}`)
  })
  Object.defineProperty(window, 'workwise', {
    configurable: true,
    value: {
      runtimeRequest
    }
  })

  container = globalThis.document.createElement('div')
  globalThis.document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(SurveyAdjustmentPanel, {
      project: { id: 'project-restored-001', revision: 1 },
      runtimeReady: true
    }))
  })
  await settle()
  await settle()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(window, 'workwise')
  vi.restoreAllMocks()
})

describe('SurveyAdjustmentPanel persisted state restoration', () => {
  it('requires separate mappings for each IN1 attachment and imports the batch only after confirmation', async () => {
    const files = [new File(['K1,10\nK2,11\nK1,P1,0.5,0.1\nP1,K2,0.5,0.1'], 'first.in1'), new File(['second file'], 'second.in1'), new File(['plane file'], 'plane.in2')]
    const removePending = vi.fn()
    const baseRequest = runtimeRequest.getMockImplementation() as (path: string, method: string, body?: string) => Promise<unknown>
    runtimeRequest.mockImplementation(async (path: string, method: string, body?: string) => {
      if (path === '/v1/engineering/survey/networks/import') {
        const input = JSON.parse(body!)
        return runtimeResponse({ network: { ...network, id: `imported-${input.name}`, sourceFile: { ...network.sourceFile, name: input.name } } })
      }
      if (path === '/v1/engineering/survey/source-groups/cosa/inspect') return runtimeResponse({ inspection: { groups: [], diagnostics: [] } })
      return baseRequest(path, method, body)
    })
    await act(async () => root.render(createElement(SurveyAdjustmentPanel, { project: { id: 'project-restored-001', revision: 1 }, runtimeReady: true, pendingFiles: files, onRemovePendingFile: removePending })))
    const imports = (): Record<string, unknown>[] => runtimeRequest.mock.calls.filter(([path]) => path === '/v1/engineering/survey/networks/import').map(([, , body]) => JSON.parse(body as string))
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes('导入预检'))!
    await act(async () => button.click())
    expect(imports()).toHaveLength(0)
    expect(container.querySelector('form')?.textContent).toContain('first.in1')
    for (const count of ['2', '3']) {
      await act(async () => {
        const input = container.querySelector<HTMLInputElement>('form input[type=number]')!
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, count)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
      if (count === '2') {
        expect(imports()).toHaveLength(0)
        expect(container.querySelector('form')?.textContent).toContain('second.in1')
      }
    }
    await vi.waitFor(() => expect(imports()).toHaveLength(3))
    await settle()
    expect(imports()[0]).toMatchObject({ name: 'first.in1', cosaIn1Mapping: { knownPointRecordCount: 2, heightUnit: 'm', routeLengthUnit: 'km' } })
    expect(imports()[1]).toMatchObject({ name: 'second.in1', cosaIn1Mapping: { knownPointRecordCount: 3 } })
    expect(imports()[2]).not.toHaveProperty('cosaIn1Mapping')
    expect(removePending).toHaveBeenCalledTimes(3)
    expect(container.querySelector('form')).toBeNull()
  })

  it('follows the global language switch without resetting selection or opening a blocked gate', async () => {
    const selector = container.querySelector<HTMLSelectElement>('[aria-label="已有测量网络"]')
    expect(selector?.value).toBe(network.id)

    await act(async () => { await i18n.changeLanguage('en') })
    await settle()
    expect(container.querySelector('h3')?.textContent).toContain('Survey and adjustment console')
    expect(selector?.value).toBe(network.id)

    await act(async () => {
      if (selector) {
        selector.value = archiveOnlyNetwork.id
        selector.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await settle()
    const adjustButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Run adjustment'))
    expect(adjustButton?.disabled).toBe(true)
    expect(container.textContent).toContain('Original retained only')
  })

  it('advertises P0 COSA and South chooser extensions, while showing only implemented execution semantics', async () => {
    const networkTab = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('网形与基准'))
    await act(async () => networkTab?.click())
    const input = container.querySelector<HTMLInputElement>('[aria-label="选择专业测量文件"]')
    expect(input?.accept).toContain('.in1')
    expect(input?.accept).toContain('.in2')
    expect(input?.accept).toContain('.net')
    expect(input?.accept).toContain('.ou1')
    expect(input?.accept).toContain('.ou2')
    expect(input?.accept).toContain('.xyo')
    expect(input?.accept).toContain('.clo')
    expect(input?.accept).toContain('.gco')
    expect(input?.accept).toContain('.txt')
    expect(container.querySelector('#survey-adjustment-method')?.textContent).toContain('平差方法 / 权模型')
    expect(container.querySelector('#survey-adjustment-method')?.textContent).toContain('加权最小二乘')
    expect(container.querySelector('#survey-constraint-mode')?.textContent).toContain('固定已知点')
    expect(container.querySelector('[aria-label="当前 Runtime 约束"]')?.textContent).toContain('固定已知点')
    expect(container.querySelector('[aria-label="当前 Runtime 执行方式"]')?.textContent).toContain('加权最小二乘')

    const adjustButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('运行平差'))
    await act(async () => adjustButton?.click())
    await settle()

    const adjustmentCall = runtimeRequest.mock.calls.find(([path, method]) => path === '/v1/engineering/adjustments' && method === 'POST')
    expect(adjustmentCall).toBeDefined()
    const requestBody = JSON.parse(String(adjustmentCall?.[2])) as Record<string, unknown>
    expect(requestBody).not.toHaveProperty('method')
    expect(requestBody).not.toHaveProperty('constraint')
  })

  it('does not label a validation replay as passed after current source eligibility is revoked', async () => {
    validationResponse = {
      ...network,
      sourceEligibility: {
        eligible: false,
        findings: [{ code: 'raw_source_integrity_failed', severity: 'blocking', message: '原始资料完整性校验失败。' }]
      }
    }
    const networkTab = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('网形与基准'))
    await act(async () => networkTab?.click())
    const validateButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('质量校核'))
    await act(async () => validateButton?.click())
    await settle()

    expect(container.textContent).toContain('当前来源资格已失效；结果仅可审计查看，不能运行平差。')
    expect(container.textContent).not.toContain('质量校核通过，可以运行平差。')
  })

  it('restores the latest network and its deterministic result after remount', () => {
    const selector = container.querySelector<HTMLSelectElement>('[aria-label="已有测量网络"]')
    expect(selector).not.toBeNull()
    expect(selector?.value).toBe(network.id)
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain('平差结果')
    expect(container.textContent).toContain('观测 / 未知数')
    expect(container.textContent).toContain('1 / 1')
    expect(container.textContent).toContain('2e-7')
    expect(container.textContent).toContain('adjustment-restored-001')
    expect(container.textContent).toContain('点位成果与复核摘要')
    expect(container.textContent).toContain('Leica GSI-8')
    expect(container.textContent).toContain('可进入校核与平差')
  })

  it('shows professional source preflight, diagnostics, hashes, filters, and raw anchors', async () => {
    const networkTab = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('网形与基准'))
    expect(networkTab).toBeDefined()
    await act(async () => networkTab?.click())

    expect(container.querySelector('[aria-label="专业测量来源预检"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="来源合同明细"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="按来源格式筛选"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="按平差就绪状态筛选"]')).not.toBeNull()
    expect(container.textContent).toContain('survey-format-registry')
    expect(container.textContent).toContain('a'.repeat(64))
    expect(container.textContent).toContain('声明扩展名')
    expect(container.textContent).toContain('内容探测格式')
    expect(container.textContent).toContain('GSI 米制末位 1 mm → m')
    expect(container.textContent).toContain('gon → rad')
    expect(container.textContent).toContain('CGCS2000 / 1985 国家高程基准')
    expect(container.textContent).toContain('内容签名、记录结构和单位声明均已通过预检。')
    expect(container.textContent).toContain('p'.repeat(64))
    expect(container.textContent).toContain('2 / 1')
    expect(container.textContent).toContain('1 / 1 / 0')
    expect(container.textContent).toContain('未使用转换器')
    expect(container.textContent).toContain('识别为 Leica GSI-8')
    expect(container.textContent).toContain('下一步：确认字段映射、单位和基准后重新导入。')
    expect(container.textContent).toContain('原始资料身份已验证')

    const recordsButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('查看 1'))
    await act(async () => recordsButton?.click())
    expect(container.textContent).toContain('GSI')
    expect(container.textContent).toContain('行 1')
    expect(container.textContent).not.toContain('{"id":"obs-1","value":0.2}')

    const input = container.querySelector<HTMLInputElement>('[aria-label="选择专业测量文件"]')
    expect(input?.accept).toContain('.gsi')
    expect(input?.accept).toContain('.suc')
    expect(input?.accept).toContain('.t02')
    expect(input?.accept).toContain('.ubx')
    expect(input?.accept).toContain('.sbf')
    expect(input?.accept).toContain('.gts')
    expect(input?.accept).toContain('.survey')
    expect(input?.accept).toContain('.sth')
    expect(input?.accept).toContain('.zhd')
    expect(input?.accept).toContain('.19o')
    expect(input?.accept).toContain('.rtcm3')
  })

  it('links a residual to its exact raw-source anchor and keeps missing source IDs explicit', async () => {
    expect(container.textContent).toContain('原始记录')
    expect(container.textContent).toContain('record-1')
    expect(container.textContent).toContain('未关联原始记录')

    const locateButton = container.querySelector<HTMLButtonElement>('[aria-label="定位 obs-1 的原始记录 record-1"]')
    expect(locateButton).not.toBeNull()
    await act(async () => locateButton?.click())

    const locator = container.querySelector('[aria-label="残差原始记录定位"]')
    expect(locator).not.toBeNull()
    expect(locator?.textContent).toContain('原始记录定位')
    expect(locator?.textContent).toContain('record-1')
    expect(locator?.textContent).toContain('network.observations')
    expect(locator?.textContent).toContain('字节偏移')
    expect(locator?.textContent).toContain('137')
    expect(locator?.textContent).toContain('字节长度')
    expect(locator?.textContent).toContain('29')
    expect(locator?.textContent).toContain('{"id":"obs-1","value":0.2}')
  })

  it('does not present out-of-range or multi-record whole-file anchors as precise raw evidence', async () => {
    const selector = container.querySelector<HTMLSelectElement>('[aria-label="已有测量网络"]')
    expect(selector).not.toBeNull()

    await act(async () => {
      if (!selector) return
      selector.value = outOfRangeNetwork.id
      selector.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const firstLocateButton = container.querySelector<HTMLButtonElement>('[aria-label="定位 obs-1 的原始记录 record-1"]')
    await act(async () => firstLocateButton?.click())
    let locator = container.querySelector('[aria-label="残差原始记录定位"]')
    expect(locator?.textContent).toContain('原始记录不可定位')
    expect(locator?.textContent).toContain('超出保留源文件边界')
    expect(locator?.textContent).not.toContain('字节偏移')

    await act(async () => {
      if (!selector) return
      selector.value = wholeFileAnchorNetwork.id
      selector.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const secondLocateButton = container.querySelector<HTMLButtonElement>('[aria-label="定位 obs-1 的原始记录 record-1"]')
    await act(async () => secondLocateButton?.click())
    locator = container.querySelector('[aria-label="残差原始记录定位"]')
    expect(locator?.textContent).toContain('原始记录不可定位')
    expect(locator?.textContent).toContain('覆盖整份源文件')
    expect(locator?.textContent).not.toContain('字节长度')
  })

  it('keeps converter-required sources locked across network and observation validation entries', async () => {
    const selector = container.querySelector<HTMLSelectElement>('[aria-label="已有测量网络"]')
    expect(selector).not.toBeNull()
    await act(async () => {
      if (!selector) return
      selector.value = archiveOnlyNetwork.id
      selector.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.textContent).toContain('声明扩展名')
    expect(container.textContent).toContain('.dat')
    expect(container.textContent).toContain('Trimble T02')
    expect(container.textContent).toContain('与内容冲突')
    expect(container.textContent).toContain('需要人工确认')
    expect(container.textContent).toContain('converter-required: 未安装经审计的本地转换器。')
    expect(container.textContent).toContain('下一步：安装并授权受审计的本地转换器后重新导入。')
    expect(container.textContent).toContain('fixture-trimble-converter 1.0.0')
    expect(container.textContent).toContain('c'.repeat(64))

    const validateButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('质量校核'))
    const adjustButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('运行平差'))
    expect(validateButton?.disabled).toBe(true)
    expect(adjustButton?.disabled).toBe(true)

    const observationsTab = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('观测表'))
    await act(async () => observationsTab?.click())
    const revalidateButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('重新校核'))
    expect(revalidateButton?.disabled).toBe(true)
    expect(revalidateButton?.title).toContain('未安装经审计的本地转换器')
  })

  it('fails closed while source eligibility is absent, even when the source disposition is adjustment-ready', async () => {
    const selector = container.querySelector<HTMLSelectElement>('[aria-label="已有测量网络"]')
    expect(selector).not.toBeNull()
    await act(async () => {
      if (!selector) return
      selector.value = pendingEligibilityNetwork.id
      selector.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.textContent).toContain('正在核验来源资格 / 请重新加载。')
    const validateButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('质量校核'))
    const adjustButton = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('运行平差'))
    expect(validateButton?.disabled).toBe(true)
    expect(adjustButton?.disabled).toBe(true)
  })

  it('keeps a source-revoked historical adjustment readable but excludes it from new period calculations', async () => {
    const selector = container.querySelector<HTMLSelectElement>('[aria-label="已有测量网络"]')
    expect(selector).not.toBeNull()
    await act(async () => {
      if (!selector) return
      selector.value = historicalIneligibleNetwork.id
      selector.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const auditOnlyNotice = container.querySelector('[aria-label="历史平差结果不可用于新计算"]')
    expect(auditOnlyNotice?.textContent).toContain('原始资料完整性校验失败')
    expect(auditOnlyNotice?.textContent).toContain('不可用于期次比较、派生计算或正式成果')
    expect(container.textContent).toContain('仅历史审计')

    const deformationTab = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('期次变形'))
    await act(async () => deformationTab?.click())
    const referenceSelector = container.querySelector<HTMLSelectElement>('[aria-label="参考平差期次"]')
    expect(referenceSelector).not.toBeNull()
    expect([...referenceSelector!.options].map((option) => option.value)).not.toContain(historicalIneligibleAdjustment.run.id)
  })

  it('renders missing legacy provenance as explicit unknown values', async () => {
    const selector = container.querySelector<HTMLSelectElement>('[aria-label="已有测量网络"]')
    expect(selector).not.toBeNull()
    await act(async () => {
      if (!selector) return
      selector.value = legacyNetwork.id
      selector.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.textContent).toContain('旧记录未提供')
    expect(container.textContent).toContain('未声明')
    expect(container.textContent).toContain('原始资料未验证')
  })
})
