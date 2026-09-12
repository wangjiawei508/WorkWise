/**
 * Isolated canonical-unit primitives for survey importers.
 *
 * This module intentionally knows nothing about source-file contracts,
 * registries, UI, or execution. An importer supplies a declared unit and
 * receives a canonical metre or radian value before the numeric kernel sees
 * it. It must preserve its original value and unit outside this module.
 */

declare const metresBrand: unique symbol
declare const radiansBrand: unique symbol

/** A linear value normalized to the canonical metre. */
export type Metres = number & { readonly [metresBrand]: 'metres' }

/** An angular value normalized to the canonical radian. */
export type Radians = number & { readonly [radiansBrand]: 'radians' }

export const METRES_PER_FOOT = 0.3048

export const LENGTH_UNITS = ['m', 'mm', '0.1mm', '0.01mm', 'ft'] as const
export type LengthUnit = (typeof LENGTH_UNITS)[number]

export const ANGLE_UNITS = ['degree-decimal', 'compact-dms', 'gon', 'mil'] as const
export type AngleUnit = (typeof ANGLE_UNITS)[number]

/**
 * A mil is not globally unambiguous: Chinese artillery and NATO systems use
 * different full-circle divisors. Importers must declare which one was used;
 * this module never chooses a hidden default.
 */
export const MILS_PER_TURN = [6000, 6400] as const
export type MilsPerTurn = (typeof MILS_PER_TURN)[number]

export type AngleInput =
  | Readonly<{ unit: 'degree-decimal'; value: number }>
  | Readonly<{ unit: 'compact-dms'; value: number }>
  | Readonly<{ unit: 'gon'; value: number }>
  | Readonly<{ unit: 'mil'; value: number; milsPerTurn: MilsPerTurn }>

/**
 * Numeric compact-DMS is encoded as DDDMMSS.s, with a sign applying to the
 * complete angle. For example, 12°34′59.9995″ is `123459.9995`.
 */
export type CompactDmsComponents = Readonly<{
  sign: -1 | 1
  degrees: number
  minutes: number
  seconds: number
}>

function asMetres(value: number): Metres {
  return value as Metres
}

function asRadians(value: number): Radians {
  return value as Radians
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be a finite number`)
}

function unsupportedUnit(unit: string): never {
  throw new RangeError(`unsupported survey unit: ${unit}`)
}

/** Render a finite non-negative Number without an exponent for DMS field parsing. */
function plainDecimal(value: number): string {
  const text = value.toString()
  if (!/[eE]/.test(text)) return text
  const [coefficient, exponentText] = text.toLowerCase().split('e')
  const exponent = Number(exponentText)
  const [integer = '0', fraction = ''] = coefficient!.split('.')
  const digits = `${integer}${fraction}`
  const decimalIndex = integer.length + exponent
  if (decimalIndex <= 0) return `0.${'0'.repeat(-decimalIndex)}${digits}`
  if (decimalIndex >= digits.length) return `${digits}${'0'.repeat(decimalIndex - digits.length)}`
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`
}

/** Convert a declared linear value to its canonical metre value. */
export function toMetres(value: number, unit: LengthUnit): Metres {
  requireFinite(value, 'length')
  switch (unit) {
    case 'm': return asMetres(value)
    case 'mm': return asMetres(value / 1_000)
    case '0.1mm': return asMetres(value / 10_000)
    case '0.01mm': return asMetres(value / 100_000)
    case 'ft': return asMetres(value * METRES_PER_FOOT)
    default: return unsupportedUnit(unit)
  }
}

/**
 * Split and validate a compact DMS number without rounding or carrying.
 *
 * `59.9995` seconds remains a valid second field. `60` seconds and
 * `60` minutes are invalid source encodings rather than values to normalize:
 * silently carrying them would lose the raw-format validation evidence.
 */
export function parseCompactDms(value: number): CompactDmsComponents {
  requireFinite(value, 'compact DMS')
  const sign: -1 | 1 = value < 0 ? -1 : 1
  const absolute = Math.abs(value)
  if (absolute > Number.MAX_SAFE_INTEGER) throw new RangeError('compact DMS exceeds the safe numeric range')

  // Splitting the number's shortest round-trippable decimal representation
  // prevents cancellation from changing e.g. 59.9995″ into 59.999500000005″.
  const [integerText, fractionText = ''] = plainDecimal(absolute).split('.')
  const integer = Number(integerText)
  const degrees = Math.trunc(integer / 10_000)
  const minuteAndSecondInteger = integer - degrees * 10_000
  const minutes = Math.trunc(minuteAndSecondInteger / 100)
  const seconds = (minuteAndSecondInteger - minutes * 100) + (fractionText ? Number(`0.${fractionText}`) : 0)

  if (!Number.isSafeInteger(degrees)) throw new RangeError('compact DMS degree field is not a safe integer')
  if (minutes < 0 || minutes >= 60) throw new RangeError(`compact DMS minutes must be in [0, 60), received ${minutes}`)
  if (seconds < 0 || seconds >= 60) throw new RangeError(`compact DMS seconds must be in [0, 60), received ${seconds}`)

  return Object.freeze({ sign, degrees, minutes, seconds })
}

/** Convert a compact DDDMMSS.s angle to canonical radians. */
export function compactDmsToRadians(value: number): Radians {
  const dms = parseCompactDms(value)
  const decimalDegrees = dms.degrees + dms.minutes / 60 + dms.seconds / 3_600
  return asRadians(dms.sign * decimalDegrees * Math.PI / 180)
}

export type CosaDmsInput = string | number

/**
 * Convert a numeric COSA field to a complete degree-dot-MMSS lexeme.
 *
 * A Number cannot retain trailing zeroes, so its fractional field is padded
 * only up to the required `MMSS` width. Source text must use the string
 * overload so its original lexical representation is validated unchanged.
 */
function cosaDmsLexeme(input: CosaDmsInput): string {
  if (typeof input === 'string') return input
  requireFinite(input, 'COSA DMS')
  const sign = input < 0 ? '-' : ''
  const [degrees, fraction = ''] = plainDecimal(Math.abs(input)).split('.')
  return `${sign}${degrees}.${fraction.padEnd(4, '0')}`
}

/**
 * Parse COSA `.in2` degree-dot-MMSS notation exactly as source text.
 *
 * The format is `D.MMSSs…`: the first two fractional digits are minutes,
 * the next two are whole seconds, and remaining digits are fractional
 * seconds. Thus `115.59005` is 115°59′00.5″ and `12.5959995` is
 * 12°59′59.995″. Minute/second fields are validated before conversion and
 * are never rounded or carried.
 */
export function parseCosaDms(input: CosaDmsInput): CompactDmsComponents {
  const lexeme = cosaDmsLexeme(input)
  const match = /^([+-]?)(\d+)\.(\d{2})(\d{2})(\d*)$/.exec(lexeme)
  if (!match) throw new RangeError(`invalid COSA DMS notation: ${lexeme}`)

  const [, signText, degreesText, minutesText, secondsText, fractionalSecondsText] = match
  const degrees = Number(degreesText)
  const minutes = Number(minutesText)
  const wholeSeconds = Number(secondsText)
  if (!Number.isSafeInteger(degrees)) throw new RangeError('COSA DMS degree field is not a safe integer')
  if (minutes >= 60) throw new RangeError(`COSA DMS minutes must be in [0, 60), received ${minutes}`)
  if (wholeSeconds >= 60) throw new RangeError(`COSA DMS seconds must be in [0, 60), received ${wholeSeconds}`)

  const fractionalSeconds = fractionalSecondsText ? Number(`0.${fractionalSecondsText}`) : 0
  const seconds = wholeSeconds + fractionalSeconds
  if (seconds >= 60) throw new RangeError(`COSA DMS seconds must be in [0, 60), received ${seconds}`)
  return Object.freeze({ sign: signText === '-' ? -1 : 1, degrees, minutes, seconds })
}

/** Convert strict COSA `.in2` degree-dot-MMSS input to canonical radians. */
export function cosaDmsToRadians(input: CosaDmsInput): Radians {
  const dms = parseCosaDms(input)
  const decimalDegrees = dms.degrees + dms.minutes / 60 + dms.seconds / 3_600
  return asRadians(dms.sign * decimalDegrees * Math.PI / 180)
}

/**
 * Convert a declared angular value to its canonical radian value.
 *
 * Mil inputs deliberately require `milsPerTurn`; callers cannot silently
 * reinterpret a 6000-mil source as a 6400-mil source or vice versa.
 */
export function toRadians(input: AngleInput): Radians {
  requireFinite(input.value, 'angle')
  switch (input.unit) {
    case 'degree-decimal': return asRadians(input.value * Math.PI / 180)
    case 'compact-dms': return compactDmsToRadians(input.value)
    case 'gon': return asRadians(input.value * Math.PI / 200)
    case 'mil': {
      if (!MILS_PER_TURN.includes(input.milsPerTurn)) throw new RangeError(`unsupported mil convention: ${input.milsPerTurn}`)
      return asRadians(input.value * 2 * Math.PI / input.milsPerTurn)
    }
    default: return unsupportedUnit((input as { unit: string }).unit)
  }
}

/**
 * Names are intentionally explicit rather than accepting arbitrary strings.
 * They cover the correction types planned for the adjustment workflow and
 * give the later source-file contract a stable bitmap vocabulary.
 */
export const SURVEY_CORRECTION_NAMES = [
  'meteorological',
  'prism',
  'additive-constant',
  'slope-to-horizontal',
  'direction-centering',
  'projection-surface',
  'second-difference',
  'eccentricity'
] as const

export type SurveyCorrectionName = (typeof SURVEY_CORRECTION_NAMES)[number]

const CORRECTION_BITS: Readonly<Record<SurveyCorrectionName, number>> = Object.freeze({
  meteorological: 1 << 0,
  prism: 1 << 1,
  'additive-constant': 1 << 2,
  'slope-to-horizontal': 1 << 3,
  'direction-centering': 1 << 4,
  'projection-surface': 1 << 5,
  'second-difference': 1 << 6,
  eccentricity: 1 << 7
})

const ALL_CORRECTION_BITS = SURVEY_CORRECTION_NAMES.reduce((bitmap, correction) => bitmap | CORRECTION_BITS[correction], 0)
const correctionStateBrand = Symbol('CorrectionState')

/**
 * A sealed correction bitmap. It can only be created by this module, and its
 * canonical `applied` list is derived from the bitmap rather than caller data.
 */
export type CorrectionState = Readonly<{
  bitmap: number
  applied: readonly SurveyCorrectionName[]
}> & Readonly<{ [correctionStateBrand]: true }>

export class CorrectionAlreadyAppliedError extends Error {
  readonly correction: SurveyCorrectionName

  constructor(correction: SurveyCorrectionName) {
    super(`correction already applied: ${correction}`)
    this.name = 'CorrectionAlreadyAppliedError'
    this.correction = correction
  }
}

function correctionBit(correction: SurveyCorrectionName): number {
  const bit = CORRECTION_BITS[correction]
  if (bit === undefined) throw new RangeError(`unknown survey correction: ${String(correction)}`)
  return bit
}

function makeCorrectionState(bitmap: number): CorrectionState {
  const applied = Object.freeze(SURVEY_CORRECTION_NAMES.filter((correction) => (bitmap & correctionBit(correction)) !== 0))
  return Object.freeze({ bitmap, applied, [correctionStateBrand]: true as const })
}

function assertCorrectionState(state: CorrectionState): void {
  if (typeof state !== 'object' || state === null || state[correctionStateBrand] !== true) throw new TypeError('invalid CorrectionState')
  if (!Object.isFrozen(state) || !Object.isFrozen(state.applied)) throw new TypeError('CorrectionState must be immutable')
  if (!Number.isSafeInteger(state.bitmap) || state.bitmap < 0 || (state.bitmap & ~ALL_CORRECTION_BITS) !== 0) throw new RangeError('CorrectionState bitmap contains unknown bits')
  const expected = SURVEY_CORRECTION_NAMES.filter((correction) => (state.bitmap & correctionBit(correction)) !== 0)
  if (state.applied.length !== expected.length || state.applied.some((correction, index) => correction !== expected[index])) throw new TypeError('CorrectionState applied corrections do not match its bitmap')
}

/** The immutable state before any observation correction has been applied. */
export const EMPTY_CORRECTION_STATE: CorrectionState = makeCorrectionState(0)

/** Construct an immutable state, rejecting duplicate named corrections. */
export function createCorrectionState(applied: readonly SurveyCorrectionName[] = []): CorrectionState {
  let bitmap = 0
  for (const correction of applied) {
    const bit = correctionBit(correction)
    if ((bitmap & bit) !== 0) throw new CorrectionAlreadyAppliedError(correction)
    bitmap |= bit
  }
  return makeCorrectionState(bitmap)
}

/** Return whether an explicitly named correction is already recorded. */
export function hasAppliedCorrection(state: CorrectionState, correction: SurveyCorrectionName): boolean {
  assertCorrectionState(state)
  return (state.bitmap & correctionBit(correction)) !== 0
}

/** Return the state bitmap after one new correction, or reject a duplicate. */
export function applyCorrection(state: CorrectionState, correction: SurveyCorrectionName): CorrectionState {
  assertCorrectionState(state)
  const bit = correctionBit(correction)
  if ((state.bitmap & bit) !== 0) throw new CorrectionAlreadyAppliedError(correction)
  return makeCorrectionState(state.bitmap | bit)
}

/** Expose the validated bitmap for persistence in a future source-file contract. */
export function correctionStateBitmap(state: CorrectionState): number {
  assertCorrectionState(state)
  return state.bitmap
}
