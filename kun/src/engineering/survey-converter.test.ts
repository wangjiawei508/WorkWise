import { createHash } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { SurveyConverterManifestV1 } from '../contracts/survey.js'
import { MacOsSandboxedSurveyConverterExecutor, SurveyConverterRegistry, type SandboxedSurveyConverterExecutor } from './survey-converter.js'
import { SurveyFormatRegistry } from './survey-format-registry.js'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function fixtureManifest(): Promise<{ manifest: SurveyConverterManifestV1; output: Buffer }> {
  const directory = await mkdtemp(join(tmpdir(), 'workwise-converter-fixture-'))
  directories.push(directory)
  const executablePath = join(directory, 'audited-converter')
  const executable = Buffer.from('synthetic audited converter fixture')
  await writeFile(executablePath, executable)
  await chmod(executablePath, 0o755)
  return {
    manifest: {
      schemaVersion: 1,
      id: 'fixture-trimble-rinex',
      version: '1.0.0-test',
      origin: 'user-supplied',
      auditReference: 'synthetic:test-only',
      executablePath,
      executableHash: createHash('sha256').update(executable).digest('hex'),
      inputFormats: ['trimble-t02'],
      outputFormat: 'rinex-observation',
      outputExtension: '.obs',
      arguments: ['--input', '{input}', '--output', '{output}'],
      timeoutMs: 5_000,
      maxOutputBytes: 1024 * 1024,
      networkAccess: 'none'
    },
    output: Buffer.from('     3.04           O                   RINEX VERSION / TYPE\n                                                            END OF HEADER\n')
  }
}

async function adjustmentReadyOpenOutput(format: 'workwise-json' | 'delimited-text' | 'xlsx'): Promise<Buffer> {
  if (format === 'workwise-json') return Buffer.from(JSON.stringify({
    format: 'workwise-survey-network',
    formatVersion: 1,
    network: {
      networkType: 'leveling', unit: 'm',
      knownPoints: [{ id: 'BM', pointClass: 'known', known: true, height: 10 }],
      unknownPoints: [{ id: 'P', pointClass: 'unknown', known: false, height: 10.1 }],
      observations: [{ id: 'dh', type: 'height-difference', from: 'BM', to: 'P', value: 0.1, unit: 'm', sigma: 0.001, sigmaUnit: 'm' }]
    }
  }))
  if (format === 'delimited-text') return Buffer.from('type,from,to,value,unit\nheight-difference,BM,P1,0.1,m\n')
  const workbook = new JSZip()
  workbook.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  workbook.file('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>')
  workbook.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>')
  return await workbook.generateAsync({ type: 'nodebuffer' })
}

describe('SurveyConverterRegistry', () => {
  it('uses a valid user-supplied converter output as the active source while retaining both source identities', async () => {
    const { manifest, output } = await fixtureManifest()
    const executor: SandboxedSurveyConverterExecutor = {
      networkIsolation: 'verified-none',
      async execute(request) {
        await writeFile(request.outputPath, output)
        return { exitCode: 0, stdout: '', stderr: '' }
      }
    }
    const converters = new SurveyConverterRegistry([manifest], executor)
    const registry = new SurveyFormatRegistry(converters)
    const original = Buffer.from([0, 1, 2, 3, 4, 5])
    const result = await registry.ingest({ name: 'receiver.t02', bytes: original, networkType: 'gnss' })

    expect(result.sourceFile).toMatchObject({
      detection: { format: 'rinex-observation' },
      sha256: createHash('sha256').update(output).digest('hex'),
      disposition: 'gnss-processing-required',
      converter: {
        id: 'fixture-trimble-rinex', origin: 'user-supplied', status: 'passed', networkAccess: 'none',
        inputHash: createHash('sha256').update(original).digest('hex'),
        outputHash: createHash('sha256').update(output).digest('hex')
      },
      conversionInput: {
        formatId: 'trimble-t02', sha256: createHash('sha256').update(original).digest('hex'), originalPreserved: true
      }
    })
    expect(result.sourceFile.originalPreserved).toBe(true)
    expect(result.originalSourceFile).toMatchObject({
      formatId: 'trimble-t02', sha256: createHash('sha256').update(original).digest('hex'), disposition: 'converter-required'
    })
    expect(result.originalBytes).toEqual(original)
    expect(result.effectiveBytes).toEqual(output)
    expect(result.sourceFile.rawRecordAnchors).toHaveLength(2)
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({
      code: 'format_detected', severity: 'info',
      message: expect.stringContaining('无网络沙箱')
    }))
  })

  it.each([
    ['workwise-json', '.json'],
    ['delimited-text', '.csv'],
    ['xlsx', '.xlsx']
  ] as const)('applies normal parser and admission gates to converted %s output', async (outputFormat, outputExtension) => {
    const { manifest } = await fixtureManifest()
    const output = await adjustmentReadyOpenOutput(outputFormat)
    const executor: SandboxedSurveyConverterExecutor = {
      networkIsolation: 'verified-none',
      async execute(request) {
        await writeFile(request.outputPath, output)
        return { exitCode: 0, stdout: '', stderr: '' }
      }
    }
    const converters = new SurveyConverterRegistry([{
      ...manifest,
      id: `fixture-open-output-${outputFormat}`,
      outputFormat,
      outputExtension
    }], executor)
    const registry = new SurveyFormatRegistry(converters)
    const original = Buffer.from([0, 1, 2, 3, 4, 5])
    const result = await registry.ingest({ name: 'receiver.t02', bytes: original, networkType: 'gnss' })

    expect(result.sourceFile).toMatchObject({
      formatId: outputFormat,
      sha256: createHash('sha256').update(output).digest('hex'),
      converter: { id: `fixture-open-output-${outputFormat}`, origin: 'user-supplied', status: 'passed', outputHash: createHash('sha256').update(output).digest('hex') },
      conversionInput: { formatId: 'trimble-t02', sha256: createHash('sha256').update(original).digest('hex') }
    })
    expect(result.originalSourceFile).toMatchObject({ formatId: 'trimble-t02', sha256: createHash('sha256').update(original).digest('hex') })
    expect(result.effectiveBytes).toEqual(output)
    if (outputFormat === 'workwise-json') {
      expect(result.sourceFile.disposition).toBe('adjustment-ready')
      expect(result.sourceFile.diagnostics.some((item) => item.severity === 'blocking')).toBe(false)
    } else {
      expect(result.sourceFile).toMatchObject({ disposition: 'archive-only', requiresManualConfirmation: true })
      expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({ code: 'mapping_required', severity: 'blocking' }))
    }
  })

  it('retains and blocks the opaque original when converter output does not match its declared format', async () => {
    const { manifest } = await fixtureManifest()
    const output = await adjustmentReadyOpenOutput('workwise-json')
    const executor: SandboxedSurveyConverterExecutor = {
      networkIsolation: 'verified-none',
      async execute(request) {
        await writeFile(request.outputPath, Buffer.from('     3.04           O                   RINEX VERSION / TYPE\n                                                            END OF HEADER\n'))
        return { exitCode: 0, stdout: '', stderr: '' }
      }
    }
    const registry = new SurveyFormatRegistry(new SurveyConverterRegistry([{
      ...manifest, id: 'fixture-mismatched-output', outputFormat: 'workwise-json', outputExtension: '.json'
    }], executor))
    const original = Buffer.from([0, 1, 2, 3, 4, 5])
    const result = await registry.ingest({ name: 'receiver.t02', bytes: original, networkType: 'gnss' })

    expect(result.sourceFile).toMatchObject({
      formatId: 'trimble-t02', sha256: createHash('sha256').update(original).digest('hex'), disposition: 'converter-required',
      converter: { id: 'fixture-mismatched-output', status: 'blocked' }
    })
    expect(result.effectiveBytes).toEqual(original)
    expect(result.originalSourceFile).toBeUndefined()
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({
      code: 'converter_required', severity: 'blocking', message: expect.stringContaining('声明输出 workwise-json')
    }))
    void output
  })

  it('requires license and redistribution approval only for a WorkWise-bundled converter', async () => {
    const { manifest } = await fixtureManifest()
    const incompleteBundled = { ...manifest, origin: 'workwise-bundled' } as unknown as SurveyConverterManifestV1
    expect(() => new SurveyConverterRegistry([incompleteBundled])).toThrow(/license|redistributionApproved/i)
  })

  it('blocks a changed executable before invoking the converter', async () => {
    const { manifest } = await fixtureManifest()
    let called = false
    const executor: SandboxedSurveyConverterExecutor = {
      networkIsolation: 'verified-none',
      async execute() {
        called = true
        return { exitCode: 0, stdout: '', stderr: '' }
      }
    }
    const converters = new SurveyConverterRegistry([{ ...manifest, executableHash: '0'.repeat(64) }], executor)
    const result = await converters.convert('trimble-t02', 'receiver.t02', Buffer.from('source'))
    expect(called).toBe(false)
    expect(result).toMatchObject({ ok: false, provenance: { status: 'blocked' }, diagnostic: { code: 'converter_required', severity: 'blocking' } })
  })

  it('returns no adapter for unapproved formats instead of executing a fallback', async () => {
    const converters = new SurveyConverterRegistry()
    await expect(converters.convert('leica-dbx', 'job.dbx', Buffer.from([0, 1]))).resolves.toBeNull()
  })

  it.each([
    ['trimble-t01', 'job.t01'],
    ['trimble-t02', 'job.t02'],
    ['trimble-t04', 'job.t04'],
    ['trimble-job', 'job.job'],
    ['leica-dbx', 'job.dbx'],
    ['leica-mdb', 'job.mdb'],
    ['spectra-survey-pro', 'job.survey']
  ] as const)('keeps %s intact and converter-required when no audited adapter is registered', async (format, name) => {
    const registry = new SurveyFormatRegistry()
    const source = Buffer.from([0, 1, 2, 3, 4])
    const result = await registry.ingest({ name, bytes: source, networkType: 'gnss' })

    expect(result.sourceFile).toMatchObject({
      formatId: format,
      disposition: 'converter-required',
      originalPreserved: true,
    })
    expect(result.effectiveBytes).toEqual(source)
    expect(result.observations).toEqual([])
    expect(result.sourceFile.diagnostics).toContainEqual(expect.objectContaining({
      code: 'converter_required', severity: 'blocking'
    }))
  })

  it.skipIf(process.platform !== 'darwin' || process.env.WORKWISE_TEST_MACOS_SURVEY_SANDBOX !== '1')('executes an audited local adapter inside the macOS no-network sandbox', async () => {
    const executablePath = '/bin/cp'
    const executableHash = createHash('sha256').update(await readFile(executablePath)).digest('hex')
    const manifest: SurveyConverterManifestV1 = {
      schemaVersion: 1,
      id: 'macos-sandbox-copy-fixture',
      version: 'system-test',
      origin: 'workwise-bundled',
      license: 'system-test-only',
      redistributionApproved: true,
      auditReference: 'synthetic:test-only',
      executablePath,
      executableHash,
      inputFormats: ['trimble-t02'],
      outputFormat: 'unknown',
      outputExtension: '.bin',
      arguments: ['{input}', '{output}'],
      timeoutMs: 5_000,
      maxOutputBytes: 1024,
      networkAccess: 'none'
    }
    const source = Buffer.from('sandboxed converter integration')
    const result = await new SurveyConverterRegistry([manifest], new MacOsSandboxedSurveyConverterExecutor()).convert('trimble-t02', 'receiver.t02', source)
    expect(result, result?.diagnostic.message).toMatchObject({ ok: true, provenance: { executableHash, networkAccess: 'none', status: 'passed' } })
    expect(result?.outputBytes).toEqual(source)
  })
})
