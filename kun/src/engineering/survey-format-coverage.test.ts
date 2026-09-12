import { describe, expect, it } from 'vitest'
import { SurveyFormatRegistry } from './survey-format-registry.js'

const registry = new SurveyFormatRegistry()

function bytes(value: string | number[]): Buffer {
  return Array.isArray(value) ? Buffer.from(value) : Buffer.from(value)
}

/**
 * These are deliberately minimal synthetic probes. They verify the registry's
 * bounded detection and safe disposition policy only; they are not vendor
 * interoperability or adjustment-readiness evidence.
 */
const gnssFixtures: Array<{
  name: string
  value: string | number[]
  format: string
  disposition: 'gnss-processing-required' | 'converter-required'
}> = [
  { name: 'station.24o', value: '     3.04           O                   RINEX VERSION / TYPE\n                                                            END OF HEADER\n', format: 'rinex-observation', disposition: 'gnss-processing-required' },
  { name: 'station.24n', value: '     3.04           N                   RINEX VERSION / TYPE\n                                                            END OF HEADER\n', format: 'rinex-navigation', disposition: 'gnss-processing-required' },
  { name: 'station.24m', value: '     3.04           M                   RINEX VERSION / TYPE\n                                                            END OF HEADER\n', format: 'rinex-meteorological', disposition: 'gnss-processing-required' },
  { name: 'station.24c', value: '     3.04           C                   RINEX VERSION / TYPE\n                                                            END OF HEADER\n', format: 'rinex-clock', disposition: 'gnss-processing-required' },
  { name: 'station.24d', value: '     3.1            COMPACT RINEX FORMAT                    CRINEX VERS   / TYPE\n                                                            END OF HEADER\n', format: 'hatanaka-rinex', disposition: 'converter-required' },
  { name: 'solution.snx', value: '%=SNX 2.02 TEST\n+SOLUTION/ESTIMATE\n-SOLUTION/ESTIMATE\n', format: 'sinex', disposition: 'gnss-processing-required' },
  { name: 'receiver.nmea', value: '$GPGGA,120000.00,3110.0000,N,12130.0000,E,1,08,1.0,10.0,M,0.0,M,,*00\n', format: 'nmea-0183', disposition: 'gnss-processing-required' },
  { name: 'stream.rtcm2', value: [0x66, 0, 0, 0, 0], format: 'rtcm2', disposition: 'gnss-processing-required' },
  { name: 'stream.rtcm3', value: [0xd3, 0, 0, 0, 0, 0], format: 'rtcm3', disposition: 'gnss-processing-required' },
  { name: 'orbit.sp3', value: '#cP2024 01 01 00 00 00.00000000      1 ORBIT IGU\n##      1 0.00000000 900.00000000 0.00000000 0.00000000\n', format: 'sp3', disposition: 'gnss-processing-required' },
  { name: 'iono.ion', value: '     1.0            IONOSPHERE MAPS     GPS                 IONEX VERSION / TYPE\n', format: 'ionex', disposition: 'gnss-processing-required' },
  { name: 'antenna.atx', value: '     1.4            M                                       ANTEX VERSION / SYST\n', format: 'antex', disposition: 'gnss-processing-required' },
  { name: 'receiver.ubx', value: [0xb5, 0x62, 0x01, 0x07, 0x00, 0x00, 0x00, 0x00], format: 'ublox-ubx', disposition: 'gnss-processing-required' },
  { name: 'receiver.nov', value: [0xaa, 0x44, 0x12, 0x00], format: 'novatel-oem', disposition: 'gnss-processing-required' },
  { name: 'receiver.sbf', value: [0x24, 0x40, 0x00, 0x00, 0x15, 0x00, 0x08, 0x00], format: 'septentrio-sbf', disposition: 'gnss-processing-required' },
  { name: 'receiver.bnx', value: [0xe2, 0x00, 0x00, 0x00], format: 'binex', disposition: 'gnss-processing-required' },
  { name: 'receiver.jps', value: 'synthetic receiver stream', format: 'javad-jps', disposition: 'gnss-processing-required' },
  { name: 'receiver.tps', value: 'synthetic receiver stream', format: 'topcon-tps', disposition: 'gnss-processing-required' },
  { name: 'receiver.sth', value: 'synthetic receiver stream', format: 'south-sth', disposition: 'gnss-processing-required' },
  { name: 'receiver.zhd', value: 'synthetic receiver stream', format: 'hitarget-zhd', disposition: 'gnss-processing-required' },
  { name: 'receiver.hcn', value: 'synthetic receiver stream', format: 'chcnav-hcn', disposition: 'gnss-processing-required' },
  { name: 'receiver.cnb', value: 'synthetic receiver stream', format: 'comnav-cnb', disposition: 'gnss-processing-required' },
  { name: 'receiver.t00', value: [0, 1, 2], format: 'trimble-t00', disposition: 'converter-required' },
  { name: 'receiver.t01', value: [0, 1, 2], format: 'trimble-t01', disposition: 'converter-required' },
  { name: 'receiver.t02', value: [0, 1, 2], format: 'trimble-t02', disposition: 'converter-required' },
  { name: 'receiver.t04', value: [0, 1, 2], format: 'trimble-t04', disposition: 'converter-required' },
  { name: 'receiver.job', value: [0, 1, 2], format: 'trimble-job', disposition: 'converter-required' },
  { name: 'receiver.dbx', value: [0, 1, 2], format: 'leica-dbx', disposition: 'converter-required' },
  { name: 'receiver.mdb', value: [0, 1, 2], format: 'leica-mdb', disposition: 'converter-required' },
  { name: 'receiver.survey', value: 'synthetic Survey Pro database placeholder', format: 'spectra-survey-pro', disposition: 'converter-required' }
]

describe('professional survey format safety coverage', () => {
  it.each(gnssFixtures)('recognizes $format from synthetic $name and preserves its safe disposition', async (fixture) => {
    const result = await registry.ingest({ name: fixture.name, bytes: bytes(fixture.value), networkType: 'gnss' })
    expect(result.sourceFile.detection.format).toBe(fixture.format)
    expect(result.sourceFile.disposition).toBe(fixture.disposition)
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.observations).toHaveLength(0)
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({
      code: fixture.disposition === 'converter-required' ? 'converter_required' : 'gnss_processing_required',
      severity: 'blocking'
    }))
  })

  it.each([
    ['control.gts', 'TOPCON GTS-7 field data\n', 'topcon-gts7'],
    ['control.fc5', 'TOPCON FC-5 field data\n', 'topcon-fc5'],
    ['control.raw', 'CO,Nikon RAW data format V2.00\n', 'nikon-raw']
  ] as const)('keeps unverified field-controller dialect %s archive-only', async (name, value, format) => {
    const result = await registry.ingest({ name, bytes: Buffer.from(value), networkType: 'plane-control' })
    expect(result.sourceFile.detection.format).toBe(format)
    expect(result.sourceFile.disposition).toBe('archive-only')
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.observations).toHaveLength(0)
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing_geometry', severity: 'blocking' }))
  })
})
