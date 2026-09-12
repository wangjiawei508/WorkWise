import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'

const root = new URL('../../../docs/references/third-party/gnss-rtklib/', import.meta.url)
const registry = new SurveyFormatRegistry()

describe('RTKLIB pinned public GNSS research fixtures', () => {
  it.each([
    ['07590920.05o', 'rinex-observation'],
    ['07590920.05n', 'rinex-navigation'],
    ['igl15253.sp3', 'sp3'],
    ['testglo.rtcm2', 'rtcm2'],
    ['testglo.rtcm3', 'rtcm3'],
    ['ubx_20080526.ubx', 'ublox-ubx'],
    ['oemv_200911218.gps', 'novatel-oem'],
    ['javad_20110115.jps', 'javad-jps']
  ])('inspects %s as %s without claiming a baseline adjustment', async (file, format) => {
    const result = await registry.ingest({ name: file, bytes: await readFile(new URL(file, root)), networkType: 'gnss' })
    expect(result.sourceFile.detection.format).toBe(format)
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.sourceFile.disposition).toBe('gnss-processing-required')
    expect(result.observations).toHaveLength(0)
  })
})
