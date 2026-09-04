// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SurveyAdjustmentPanel } from './SurveyAdjustmentPanel'

let container: HTMLDivElement
let root: Root

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
  qualityStatus: 'validated',
  findings: []
}

const adjustment = {
  observationEpoch: '2026-08-22T00:00:00.000Z',
  networkType: 'leveling',
  coordinateSystem: network.coordinateSystem,
  verticalDatum: network.verticalDatum,
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
    observations: [{ observationId: 'obs-1', residual: 0.0001, unit: 'm', standardizedResidual: 0.2, standardizedResidualUnit: 'sigma' }]
  }
}

beforeEach(async () => {
  Object.defineProperty(window, 'workwise', {
    configurable: true,
    value: {
      runtimeRequest: vi.fn(async (path: string, method?: string) => {
        if (path === '/v1/engineering/survey/networks?projectId=project-restored-001' && method === 'GET') {
          return runtimeResponse({ networks: [network] })
        }
        if (path === '/v1/engineering/adjustments?projectId=project-restored-001' && method === 'GET') {
          return runtimeResponse({ adjustments: [adjustment] })
        }
        throw new Error(`Unexpected Runtime request: ${method} ${path}`)
      })
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
  })
})
