import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import JSZip from '../kun/node_modules/jszip/lib/index.js'
import { getDocument } from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs'

const { values } = parseArgs({ options: {
  input: { type: 'string' }, type: { type: 'string' }, mapping: { type: 'string' }, 'known-points': { type: 'string' },
  reference: { type: 'string' }, 'reference-encoding': { type: 'string', default: 'gb18030' },
  'packaged-app': { type: 'string' }, 'numerical-evidence': { type: 'string' }
} })
if (!values.input || !['leveling', 'plane-control'].includes(values.type)) {
  throw new Error('usage: --input <local file> --type leveling|plane-control [--mapping <json>] [--known-points <id,height[,x,y] text>] [--reference <COSA .ou1/.ou2>] [--packaged-app <macOS app, run with its Electron executable>]')
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const packagedApp = values['packaged-app'] ? resolve(values['packaged-app']) : undefined
if (packagedApp && (process.platform !== 'darwin' || dirname(process.execPath) !== join(packagedApp, 'Contents', 'MacOS'))) {
  throw new Error('Packaged verification must run with the selected app executable and ELECTRON_RUN_AS_NODE=1')
}
const runtimeRoot = packagedApp
  ? join(packagedApp, 'Contents', 'Resources', 'app.asar.unpacked', 'kun')
  : fileURLToPath(new URL('../kun', import.meta.url))
const runtimeModule = (name) => pathToFileURL(join(runtimeRoot, 'dist', 'engineering', `${name}.js`)).href
const [{ EngineeringService }, { SurveyService }, { parseCosaOu1Heights }, { parseCosaOu2Coordinates, compareCosaPlaneCoordinates, compareCosaPlaneCoordinatePrecision }] = await Promise.all([
  import(runtimeModule('engineering-service')), import(runtimeModule('survey-service')), import(runtimeModule('survey-cosa-ou1')), import(runtimeModule('survey-cosa-ou2'))
])
// Electron exposes ASAR contents through fs; hash the archive bytes with its original disk API.
const diskReadFile = packagedApp ? createRequire(import.meta.url)('original-fs').promises.readFile : readFile
const packageEvidence = packagedApp ? {
  asarSha256: hash(await diskReadFile(join(packagedApp, 'Contents', 'Resources', 'app.asar'))),
  runtimeModules: await Promise.all(['engineering-service', 'survey-service', 'survey-adjustment-core', 'survey-cosa-ou1', 'survey-cosa-ou2'].map(async (name) => ({
    name, sha256: hash(await readFile(join(runtimeRoot, 'dist', 'engineering', `${name}.js`)))
  }))),
  electron: process.versions.electron, nodeAbi: process.versions.modules
} : undefined
const bytes = await readFile(values.input)
const mappingBytes = values.mapping ? await readFile(values.mapping) : undefined
const knownPointBytes = values['known-points'] ? await readFile(values['known-points']) : undefined
const parseKnownPoints = (text) => text
  .replace(/^\uFEFF/, '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'))
  .map((line, index) => {
    const fields = line.split(/[;,\s]+/).filter(Boolean)
    if (fields.length < 2) throw new Error(`known-points line ${index + 1} must contain id and height`)
    const [id, height, x, y] = fields
    const point = { id, height: Number(height) }
    if (!Number.isFinite(point.height)) throw new Error(`known-points line ${index + 1} has an invalid height`)
    if (x !== undefined) { point.x = Number(x); if (!Number.isFinite(point.x)) throw new Error(`known-points line ${index + 1} has an invalid x`) }
    if (y !== undefined) { point.y = Number(y); if (!Number.isFinite(point.y)) throw new Error(`known-points line ${index + 1} has an invalid y`) }
    return point
  })
const knownPoints = knownPointBytes ? parseKnownPoints(new TextDecoder('utf-8').decode(knownPointBytes)) : undefined
const root = await mkdtemp(join(tmpdir(), 'workwise-survey-delivery-check-'))
const workspace = join(root, 'workspace')
let engineering
const survey = new SurveyService({ rootDir: join(root, 'runtime'), getProject: (id) => engineering.getProject(id) })
engineering = new EngineeringService({
  rootDir: join(root, 'runtime'),
  getAdjustmentEvidence: (projectId, ids) => ids.flatMap((id) => {
    const stored = survey.getAdjustmentForNewUse(id)
    return stored?.run.projectId === projectId && stored.result ? [{ run: stored.run, result: stored.result }] : []
  }),
  getDeformations: () => [],
  getSurveySources: (projectId, ids) => ids.flatMap((id) => {
    const network = survey.getNetwork(id)
    return network?.projectId === projectId && network.sourceFile ? [{
      networkId: id, sourceFile: network.sourceFile,
      observations: network.observations.map(({ id, type, sourceRecordId }) => ({ id, type, sourceRecordId })),
      points: [...network.knownPoints, ...network.unknownPoints].map(({ id }) => ({ id })),
      rawSourceIntegrity: survey.getRawSourceIntegrity(id), sourceEligibility: survey.getSourceEligibility(id)
    }] : []
  })
})
try {
  const project = engineering.createProject({ name: 'Local survey verification', workspace, expectedRevision: 0, idempotencyKey: 'local-delivery-project' })
  const network = await survey.importNetwork({
    projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'local-delivery-import',
    name: basename(values.input), networkType: values.type, dataBase64: bytes.toString('base64'),
    ...(mappingBytes ? { cosaIn1Mapping: JSON.parse(mappingBytes.toString('utf8')) } : {}),
    ...(knownPoints ? { knownPoints } : {})
  })
  const checked = survey.validateNetwork(network.id, { expectedRevision: network.revision, idempotencyKey: 'local-delivery-validate' })
  const adjusted = survey.createAdjustment({ networkId: network.id, expectedRevision: checked.revision, idempotencyKey: 'local-delivery-adjust' })
  if (process.env.WORKWISE_DEBUG_DELIVERY === '1') {
    console.error(JSON.stringify({
      diagnostic: 'delivery-preconditions',
      source: { qualityStatus: checked.qualityStatus, findingCodes: checked.findings.map((item) => item.code) },
      adjustment: { status: adjusted.run.status, validation: adjusted.result.validation, precisionPassed: adjusted.result.precision.passed, findingCodes: adjusted.result.qualityFindings.map((item) => item.code) }
    }))
  }
  // Do not print assertion payloads: they may contain confidential observations.
  assert(checked.qualityStatus === 'validated', 'source validation blocked delivery')
  assert(adjusted.run.status === 'completed' && adjusted.result.validation === 'valid' && adjusted.result.precision.passed, 'adjustment quality blocked delivery')
  const integrity = survey.getRawSourceIntegrity(network.id)
  const eligibility = survey.getSourceEligibility(network.id)
  assert(integrity.status === 'verified', 'source integrity blocked delivery')
  assert(eligibility.eligible, 'source eligibility blocked delivery')
  assert(network.sourceFile, 'parser-derived source metadata is required')
  const sourceFile = network.sourceFile
  const usableAnchors = sourceFile.records.filter((record) => record.rawLength > 0)
  const anchorIds = new Set(usableAnchors.map((record) => record.id))
  const anchoredObservations = network.observations.filter((observation) => observation.sourceRecordId && anchorIds.has(observation.sourceRecordId))
  assert(anchoredObservations.length === network.observations.length, 'an observation is missing its raw-record anchor')
  const manifest = await engineering.finalize({ projectId: project.id, expectedRevision: project.revision, idempotencyKey: 'local-delivery-finalize', adjustmentIds: [adjusted.run.id], acknowledgeWarnings: true })
  assert(manifest.inputDatasets.length === 0 && manifest.analyses.length === 0 && manifest.charts.length === 0, 'survey report must not fabricate monitoring data')
  assert(manifest.surveySources[0]?.source.sha256 === hash(bytes), 'source hash mismatch')
  assert(manifest.reviewStatus === 'draft', 'verification cannot approve a production report')
  const files = new Map()
  for (const output of manifest.outputs) {
    const content = await readFile(join(workspace, output.path))
    assert(content.byteLength === output.sizeBytes && hash(content) === output.sha256, 'artifact hash mismatch')
    files.set(basename(output.path), content)
  }
  const docx = await JSZip.loadAsync(files.get('report.docx'))
  const documentXml = await docx.file('word/document.xml').async('text')
  const workbook = await JSZip.loadAsync(files.get('evidence.xlsx'))
  const workbookXml = await workbook.file('xl/workbook.xml').async('text')
  assert(!workbookXml.includes('normalized_data') && !workbookXml.includes('analysis_results'), 'unexpected monitoring sheets')
  const worksheets = (await Promise.all(Object.keys(workbook.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).map((name) => workbook.file(name).async('text')))).join('\n')
  const pdf = await getDocument({ data: Uint8Array.from(files.get('report.pdf')), useSystemFonts: false, isEvalSupported: false }).promise
  let pdfText = ''
  const pdfPageCount = pdf.numPages
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      pdfText += (await page.getTextContent()).items.map((item) => 'str' in item ? item.str : '').join('')
    }
  } finally { await pdf.destroy() }
  const compact = (value) => value.replace(/\s/g, '')
  const compactPdf = compact(pdfText)
  const xmlEscape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  for (const point of adjusted.result.points) {
    assert(documentXml.includes(xmlEscape(`点位 ${point.id}:`)) && compactPdf.includes(compact(`点位 ${point.id}:`)), 'point missing from document')
    for (const [key, label] of [['x', 'X'], ['y', 'Y'], ['height', 'H']]) {
      if (point[key] === undefined) continue
      assert(compactPdf.includes(`${label}=${point[key]}m`) && worksheets.includes(String(point[key])), 'adjusted coordinate missing from evidence')
    }
  }
  for (const [key, value] of Object.entries(adjusted.result.closure)) {
    assert(worksheets.includes(xmlEscape(key)) && worksheets.includes(String(value)), 'closure missing from workbook')
  }
  assert(compactPdf.includes('审查记录：') && documentXml.includes('审查记录：'), 'report end was truncated')
  assert(documentXml.includes(hash(bytes)) && worksheets.includes(hash(bytes)), 'source hash missing from evidence')
  const manifestPath = join(workspace, dirname(manifest.outputs[0].path), 'manifest.json')
  const persistedBytes = await readFile(manifestPath)
  const persisted = JSON.parse(persistedBytes.toString('utf8'))
  assert(JSON.stringify(persisted) === JSON.stringify(manifest), 'persisted manifest differs')
  let referenceComparison
  if (values.reference) {
    const referenceBytes = await readFile(values.reference)
    const referenceText = new TextDecoder(values['reference-encoding']).decode(referenceBytes)
    if (values.type === 'leveling') {
      const reference = parseCosaOu1Heights(referenceText)
      const adjustedPoints = new Map(adjusted.result.points.map((point) => [point.id, point]))
      const comparable = reference.points.filter((point) => adjustedPoints.has(point.id))
      const differences = comparable.map((point) => ({
        difference: Math.abs((adjustedPoints.get(point.id)?.height ?? Number.NaN) - point.height),
        publishedTolerance: point.printedResolutionMetres / 2 + 1e-9,
        precisionTolerance: point.standardErrorMm === undefined ? point.printedResolutionMetres / 2 + 1e-9 : point.standardErrorMm / 1000
      }))
      const strictMismatches = differences.filter((item) => !Number.isFinite(item.difference) || item.difference > item.publishedTolerance).length
      const precisionMismatches = differences.filter((item) => !Number.isFinite(item.difference) || item.difference > Math.max(item.publishedTolerance, item.precisionTolerance)).length
      if (process.env.WORKWISE_DEBUG_DELIVERY === '1') console.error(JSON.stringify({ diagnostic: 'ou1-height-comparison', referenceState: reference.state, referencePoints: reference.points.length, adjustedPoints: adjustedPoints.size, compared: differences.length, strictMismatches, precisionMismatches, maxDifference: differences.length ? Math.max(...differences.map((item) => item.difference)) : null, maxPublishedTolerance: differences.length ? Math.max(...differences.map((item) => item.publishedTolerance)) : null, maxPrecisionTolerance: differences.length ? Math.max(...differences.map((item) => item.precisionTolerance)) : null }))
      // A field leveling source may retain internal turning points that are
      // intentionally omitted from the vendor's published OU1 point table.
      // Require every published reference point to be present, while allowing
      // those extra auditable derived points in the WorkWise result.
      assert(reference.state === 'valid' && comparable.length === reference.points.length && precisionMismatches === 0, 'reference heights exceeded the published/standard-error precision envelope')
      referenceComparison = {
        kind: 'leveling-reference-adjusted-heights', sourceSha256: hash(referenceBytes), comparedPoints: differences.length, strictPublishedRoundingMismatches: strictMismatches, precisionEnvelopeMismatches: precisionMismatches,
        adjustedPointCount: adjusted.result.points.length,
        extraAdjustedPoints: adjusted.result.points.length - differences.length,
        maximumHeightDifferenceMetres: Math.max(...differences.map((item) => item.difference)),
        maximumPublishedRoundingToleranceMetres: Math.max(...differences.map((item) => item.publishedTolerance)),
        maximumStandardErrorToleranceMetres: Math.max(...differences.map((item) => item.precisionTolerance)),
        toleranceRule: 'published-rounding-is-reported-strictly; acceptance-uses-max(half-published-resolution, reference-standard-error)', passed: true
      }
    } else {
      const reference = parseCosaOu2Coordinates(referenceText)
      const strictCoordinateComparison = compareCosaPlaneCoordinates(adjusted.result, reference)
      const precisionEnvelopeComparison = compareCosaPlaneCoordinatePrecision(adjusted.result, reference)
      if (process.env.WORKWISE_DEBUG_DELIVERY === '1') {
        console.error(JSON.stringify({
          diagnostic: 'ou2-coordinate-comparison', referenceState: reference.state, referenceReason: reference.reason,
          strictPublishedRounding: strictCoordinateComparison, combinedPrecisionEnvelope: precisionEnvelopeComparison
        }))
      }
      assert(precisionEnvelopeComparison.status === 'matched', 'reference coordinates exceeded the combined point-precision envelope')
      referenceComparison = {
        kind: 'cosa-ou2-fixed-adjusted-coordinates', sourceSha256: hash(referenceBytes),
        strictPublishedRounding: strictCoordinateComparison,
        strictToleranceRule: 'half-published-X-and-Y-resolution-per-axis-plus-floating-point-slack',
        combinedPrecisionEnvelope: precisionEnvelopeComparison,
        precisionToleranceRule: 'planar-difference-at-most-one-combined-standard-deviation; fixed-points-remain-within-published-rounding',
        passed: true
      }
    }
  }
  const result = adjusted.result
  const standardizedResiduals = result.observations.flatMap((observation) => observation.standardizedResidual === undefined ? [] : [observation.standardizedResidual])
  const standardizedResidualLimitSigma = 3
  const maximumStandardizedResidualSigma = standardizedResiduals.length ? Math.max(...standardizedResiduals) : 0
  const exceededStandardizedResiduals = standardizedResiduals.filter((value) => value > standardizedResidualLimitSigma).length
  assert(exceededStandardizedResiduals === 0, 'standardized residual precision gate failed')
  if (values['numerical-evidence']) {
    // Explicit local-only output for an independent numerical checker. Never
    // print coordinates or replace an existing file implicitly.
    await writeFile(resolve(values['numerical-evidence']), JSON.stringify({
      schemaVersion: 1,
      sourceSha256: hash(bytes),
      knownPointsSha256: knownPointBytes ? hash(knownPointBytes) : null,
      packageAsarSha256: packageEvidence?.asarSha256 ?? null,
      parserId: sourceFile.parserId, parserVersion: sourceFile.parserVersion,
      observations: network.observations.map(({ from, to, value, routeLength }) => ({ from, to, value, routeLength })),
      points: result.points.map(({ id, height, standardError }) => ({ id, height, standardError })),
      closure: result.closure,
      degreesOfFreedom: result.degreesOfFreedom
    }), { flag: 'wx', mode: 0o600 })
  }
  const diagnosticCounts = Object.fromEntries(['info', 'warning', 'blocking'].map((severity) => [severity, sourceFile.diagnostics.filter((item) => item.severity === severity).length]))
  console.log(JSON.stringify({
    scope: packagedApp ? 'packaged-runtime-not-gui-acceptance' : 'isolated-runtime-not-packaged-gui-acceptance',
    ...(packageEvidence ? { package: packageEvidence } : {}),
      source: { sha256: hash(bytes), bytes: bytes.length, format: sourceFile.detection.format, mappingSha256: mappingBytes ? hash(mappingBytes) : undefined, knownPointsSha256: knownPointBytes ? hash(knownPointBytes) : undefined, knownPointCount: knownPoints?.length ?? 0 },
    preflight: {
      formatId: sourceFile.formatId, vendor: sourceFile.vendor, formatVersion: sourceFile.formatVersion,
      detectionMethod: sourceFile.detectionMethod, detectionConfidence: sourceFile.detectionConfidence,
      extensionClaimed: sourceFile.extensionClaimed, extensionContentConflict: sourceFile.extensionContentConflict,
      matchedSignatures: sourceFile.detection.matchedSignatures, requiresManualConfirmation: sourceFile.requiresManualConfirmation,
      disposition: sourceFile.disposition, dispositionReason: sourceFile.dispositionReason,
      parserId: sourceFile.parserId, parserVersion: sourceFile.parserVersion, parserSourceHash: sourceFile.parserSourceHash,
      canonicalUnits: { linear: sourceFile.linearUnitCanonical, angular: sourceFile.angularUnitCanonical },
      declaredDatum: sourceFile.datumDeclared, declaredHeightSystem: sourceFile.heightSystemDeclared,
      summary: sourceFile.summary,
      diagnostics: { total: sourceFile.diagnostics.length, ...diagnosticCounts, codes: [...new Set(sourceFile.diagnostics.map((item) => item.code))].sort() },
      rawRecordAnchors: { total: sourceFile.records.length, usable: usableAnchors.length, linkedObservations: anchoredObservations.length },
      originalPreserved: sourceFile.originalPreserved,
      eligibility: { eligible: eligibility.eligible, blockingFindingCodes: eligibility.findings.map((item) => item.code).sort() }
    },
    status: adjusted.run.status, validation: result.validation,
    integrity: { status: integrity.status, ledgerEntryCount: integrity.ledgerEntryCount },
    algorithm: result.algorithmVersion, observations: result.observationCount, points: result.points.length,
    degreesOfFreedom: result.degreesOfFreedom, iterations: result.solverDiagnostics?.iterations,
    precision: {
      ...result.precision,
      standardizedResidualGate: { actualMaximumSigma: maximumStandardizedResidualSigma, limitSigma: standardizedResidualLimitSigma, exceededCount: exceededStandardizedResiduals, comparator: '<=', passed: exceededStandardizedResiduals === 0 },
      maxPointStdDevGate: { actualMetres: result.precision.maxPointStdDev, configuredLimitMetres: null, status: 'reported-no-project-limit-configured' }
    },
    closure: {
      independentCycles: Object.keys(result.closure).filter((key) => key.startsWith('leveling-cycle:')).length,
      maximumHeightClosureMetres: result.closure.heightDifference, horizontalResidualNormMetres: result.closure.horizontal,
      angularResidualNormRadians: result.closure.angular,
      configuredHeightClosureLimitMetres: network.instrumentParameters.closureTolerance ?? null
    },
    delivery: {
      pdfPageCount, verifiedPointCount: result.points.length,
      outputs: manifest.outputs.map(({ path, ...output }) => ({ name: basename(path), ...output })),
      manifest: {
        sha256: hash(persistedBytes), bytes: persistedBytes.length, sourceCount: manifest.surveySources.length,
        sourceHashes: manifest.surveySources.map((item) => item.source.sha256), adjustmentCount: manifest.adjustments.length,
        adjustmentInputHashes: manifest.adjustments.map((item) => item.inputHash), outputCount: manifest.outputs.length,
        valid: manifest.validation.valid, runtimeVersion: manifest.runtimeVersion
      },
      reviewStatus: manifest.reviewStatus
    },
    ...(referenceComparison ? { referenceComparison } : {})
  }, null, 2))
} catch (error) {
  // Messages, parser findings and assert payloads may include field records.
  console.error(JSON.stringify({ status: 'failed', errorType: error instanceof Error ? error.name : 'unknown', detail: process.env.WORKWISE_DEBUG_DELIVERY === '1' && error instanceof Error ? error.message : 'verification failed; source data was not logged' }))
  process.exitCode = 1
} finally {
  await survey?.flush?.()
  await engineering?.flush?.()
  survey.close()
  engineering.close()
  await rm(root, { recursive: true, force: true })
}
