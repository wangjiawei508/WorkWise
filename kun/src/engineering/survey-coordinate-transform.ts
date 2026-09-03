import { weightedLeastSquares, type LinearAdjustmentResult, type WeightedEquation } from './survey-adjustment-core.js'

export type Similarity2dParameters = { tx: number; ty: number; scale: number; rotation: number }
export type Helmert7Parameters = { tx: number; ty: number; tz: number; scale: number; rx: number; ry: number; rz: number }
export type HeightPlaneParameters = { offset: number; slopeX: number; slopeY: number }

export type Similarity2dControl = { sourceX: number; sourceY: number; targetX: number; targetY: number; sigma: number }
export type Helmert7Control = { sourceX: number; sourceY: number; sourceZ: number; targetX: number; targetY: number; targetZ: number; sigma: number }
export type HeightControl = { x: number; y: number; sourceHeight: number; targetHeight: number; sigma: number }

export type FittedTransform<T> = { parameters: T; adjustment: LinearAdjustmentResult }

export function fitSimilarity2d(controls: Similarity2dControl[]): FittedTransform<Similarity2dParameters> | null {
  const rows: WeightedEquation[] = []
  for (const control of controls) {
    const weight = 1 / (control.sigma * control.sigma)
    rows.push({ coefficients: [1, 0, control.sourceX, -control.sourceY], misclosure: control.targetX, weight })
    rows.push({ coefficients: [0, 1, control.sourceY, control.sourceX], misclosure: control.targetY, weight })
  }
  const adjustment = weightedLeastSquares(rows)
  if (!adjustment) return null
  const [tx, ty, a, b] = adjustment.corrections
  return { parameters: { tx: tx!, ty: ty!, scale: Math.hypot(a!, b!), rotation: Math.atan2(b!, a!) }, adjustment }
}

export function applySimilarity2d(x: number, y: number, parameters: Similarity2dParameters): { x: number; y: number } {
  const cosine = Math.cos(parameters.rotation)
  const sine = Math.sin(parameters.rotation)
  return {
    x: parameters.tx + parameters.scale * (cosine * x - sine * y),
    y: parameters.ty + parameters.scale * (sine * x + cosine * y)
  }
}

/** Linearised position-vector Helmert model with rotations in radians. */
export function fitHelmert7(controls: Helmert7Control[]): FittedTransform<Helmert7Parameters> | null {
  const rows: WeightedEquation[] = []
  for (const control of controls) {
    const weight = 1 / (control.sigma * control.sigma)
    const { sourceX: x, sourceY: y, sourceZ: z } = control
    rows.push({ coefficients: [1, 0, 0, x, 0, z, -y], misclosure: control.targetX - x, weight })
    rows.push({ coefficients: [0, 1, 0, y, -z, 0, x], misclosure: control.targetY - y, weight })
    rows.push({ coefficients: [0, 0, 1, z, y, -x, 0], misclosure: control.targetZ - z, weight })
  }
  const adjustment = weightedLeastSquares(rows)
  if (!adjustment) return null
  const [tx, ty, tz, scaleDelta, rx, ry, rz] = adjustment.corrections
  return { parameters: { tx: tx!, ty: ty!, tz: tz!, scale: 1 + scaleDelta!, rx: rx!, ry: ry!, rz: rz! }, adjustment }
}

export function applyHelmert7(x: number, y: number, z: number, parameters: Helmert7Parameters): { x: number; y: number; z: number } {
  return {
    x: parameters.tx + parameters.scale * x - parameters.rz * y + parameters.ry * z,
    y: parameters.ty + parameters.rz * x + parameters.scale * y - parameters.rx * z,
    z: parameters.tz - parameters.ry * x + parameters.rx * y + parameters.scale * z
  }
}

export function fitHeightPlane(controls: HeightControl[]): FittedTransform<HeightPlaneParameters> | null {
  const rows = controls.map((control) => ({
    coefficients: [1, control.x, control.y],
    misclosure: control.targetHeight - control.sourceHeight,
    weight: 1 / (control.sigma * control.sigma)
  }))
  const adjustment = weightedLeastSquares(rows)
  if (!adjustment) return null
  return { parameters: { offset: adjustment.corrections[0]!, slopeX: adjustment.corrections[1]!, slopeY: adjustment.corrections[2]! }, adjustment }
}

export function applyHeightPlane(x: number, y: number, height: number, parameters: HeightPlaneParameters): number {
  return height + parameters.offset + parameters.slopeX * x + parameters.slopeY * y
}

type Ellipsoid = { a: number; f: number }

const ELLIPSOIDS: Record<string, Ellipsoid> = {
  CGCS2000: { a: 6378137, f: 1 / 298.257222101 },
  WGS84: { a: 6378137, f: 1 / 298.257223563 },
  Xian80: { a: 6378140, f: 1 / 298.257 },
  Beijing54: { a: 6378245, f: 1 / 298.3 }
}

export function resolveEllipsoid(name: string): Ellipsoid | null {
  const source = name.trim().toLowerCase()
  const normalized = source.replaceAll(/[^a-z0-9]/g, '')
  if (normalized === 'cgcs2000' || source.includes('2000国家大地')) return ELLIPSOIDS.CGCS2000!
  if (normalized === 'wgs84') return ELLIPSOIDS.WGS84!
  if (normalized === 'xian80' || source.includes('1980西安')) return ELLIPSOIDS.Xian80!
  if (normalized === 'beijing54' || source.includes('1954北京')) return ELLIPSOIDS.Beijing54!
  return null
}

function ellipsoidDerived(ellipsoid: Ellipsoid): { a: number; e2: number; ep2: number } {
  const b = ellipsoid.a * (1 - ellipsoid.f)
  return { a: ellipsoid.a, e2: (ellipsoid.a ** 2 - b ** 2) / ellipsoid.a ** 2, ep2: (ellipsoid.a ** 2 - b ** 2) / b ** 2 }
}

function meridianCoefficients(e2: number): { a0: number; a2: number; a4: number; a6: number } {
  return {
    a0: 1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256,
    a2: 3 / 8 * (e2 + e2 ** 2 / 4 + 15 * e2 ** 3 / 128),
    a4: 15 / 256 * (e2 ** 2 + 3 * e2 ** 3 / 4),
    a6: 35 * e2 ** 3 / 3072
  }
}

export function gaussKrugerForward(latitudeDeg: number, longitudeDeg: number, centralMeridianDeg: number, ellipsoid: Ellipsoid): { x: number; y: number } {
  const { a, e2, ep2 } = ellipsoidDerived(ellipsoid)
  const latitude = latitudeDeg * Math.PI / 180
  const longitudeDifference = (longitudeDeg - centralMeridianDeg) * Math.PI / 180
  const sin = Math.sin(latitude); const cos = Math.cos(latitude); const tangent = Math.tan(latitude)
  const radius = a / Math.sqrt(1 - e2 * sin ** 2)
  const etaSquared = ep2 * cos ** 2
  const { a0, a2, a4, a6 } = meridianCoefficients(e2)
  const meridianArc = a * (a0 * latitude - a2 * Math.sin(2 * latitude) + a4 * Math.sin(4 * latitude) - a6 * Math.sin(6 * latitude))
  const dl2 = longitudeDifference ** 2; const dl4 = dl2 ** 2; const dl6 = dl4 * dl2
  const x = meridianArc
    + radius * sin * cos / 2 * dl2
    + radius * sin * cos ** 3 / 24 * (5 - tangent ** 2 + 9 * etaSquared + 4 * etaSquared ** 2) * dl4
    + radius * sin * cos ** 5 / 720 * (61 - 58 * tangent ** 2 + tangent ** 4) * dl6
  const y = radius * cos * longitudeDifference
    + radius * cos ** 3 / 6 * (1 - tangent ** 2 + etaSquared) * longitudeDifference ** 3
    + radius * cos ** 5 / 120 * (5 - 18 * tangent ** 2 + tangent ** 4 + 14 * etaSquared - 58 * etaSquared * tangent ** 2) * longitudeDifference ** 5
  return { x, y }
}

export function gaussKrugerInverse(x: number, y: number, centralMeridianDeg: number, ellipsoid: Ellipsoid): { latitude: number; longitude: number } {
  const { a, e2, ep2 } = ellipsoidDerived(ellipsoid)
  const { a0, a2, a4, a6 } = meridianCoefficients(e2)
  let footprint = x / (a * a0)
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const arc = a * (a0 * footprint - a2 * Math.sin(2 * footprint) + a4 * Math.sin(4 * footprint) - a6 * Math.sin(6 * footprint))
    footprint += (x - arc) / (a * a0)
  }
  const sin = Math.sin(footprint); const cos = Math.cos(footprint); const tangent = Math.tan(footprint)
  const primeVerticalRadius = a / Math.sqrt(1 - e2 * sin ** 2)
  const meridianRadius = a * (1 - e2) / (1 - e2 * sin ** 2) ** 1.5
  const etaSquared = ep2 * cos ** 2; const tangentSquared = tangent ** 2
  const y2 = y ** 2; const y4 = y2 ** 2; const y6 = y4 * y2
  const latitude = footprint
    - tangent / (2 * meridianRadius * primeVerticalRadius) * y2
    + tangent / (24 * meridianRadius * primeVerticalRadius ** 3) * (5 + 3 * tangentSquared + etaSquared - 9 * etaSquared * tangentSquared) * y4
    - tangent / (720 * meridianRadius * primeVerticalRadius ** 5) * (61 + 90 * tangentSquared + 45 * tangentSquared ** 2) * y6
  const longitudeDifference = y / (primeVerticalRadius * cos)
    - y ** 3 / (6 * primeVerticalRadius ** 3 * cos) * (1 + 2 * tangentSquared + etaSquared)
    + y ** 5 / (120 * primeVerticalRadius ** 5 * cos) * (5 + 28 * tangentSquared + 24 * tangentSquared ** 2 + 6 * etaSquared + 8 * etaSquared * tangentSquared)
  return { latitude: latitude * 180 / Math.PI, longitude: centralMeridianDeg + longitudeDifference * 180 / Math.PI }
}
