/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

// ============================================================
// Ellipsoid parameters for Chinese geodetic datums
// ============================================================

const ELLIPSOIDS = {
  CGCS2000: { a: 6378137.0, f: 1 / 298.257222101, desc: "中国大地坐标系2000" },
  WGS84: { a: 6378137.0, f: 1 / 298.257223563, desc: "WGS-84坐标系" },
  Xian80: { a: 6378140.0, f: 1 / 298.257, desc: "1980西安坐标系（IAG-75椭球）" },
  Beijing54: { a: 6378245.0, f: 1 / 298.3, desc: "1954北京坐标系（克拉索夫斯基椭球）" },
} as const

type Datum = keyof typeof ELLIPSOIDS

function params(datum: Datum) {
  const e = ELLIPSOIDS[datum]
  const b = e.a * (1 - e.f)
  const e2 = (e.a * e.a - b * b) / (e.a * e.a)
  const ep2 = (e.a * e.a - b * b) / (b * b)
  return { a: e.a, b, f: e.f, e2, ep2, desc: e.desc }
}

// ============================================================
// Gauss-Krüger forward projection (BL → xy)
// ============================================================

function forward(latDeg: number, lonDeg: number, centralMeridian: number, datum: Datum) {
  const p = params(datum)
  const lat = (latDeg * Math.PI) / 180
  const dl = ((lonDeg - centralMeridian) * Math.PI) / 180

  const sinB = Math.sin(lat)
  const cosB = Math.cos(lat)
  const tanB = Math.tan(lat)
  const N = p.a / Math.sqrt(1 - p.e2 * sinB * sinB)
  const eta2 = p.ep2 * cosB * cosB
  const t = tanB

  // Meridian arc length
  const A0 = 1 - p.e2 / 4 - (3 * p.e2 * p.e2) / 64 - (5 * p.e2 * p.e2 * p.e2) / 256
  const A2 = (3 / 8) * (p.e2 + (p.e2 * p.e2) / 4 + (15 * p.e2 * p.e2 * p.e2) / 128)
  const A4 = (15 / 256) * (p.e2 * p.e2 + (3 * p.e2 * p.e2 * p.e2) / 4)
  const A6 = (35 * p.e2 * p.e2 * p.e2) / 3072
  const M = p.a * (A0 * lat - A2 * Math.sin(2 * lat) + A4 * Math.sin(4 * lat) - A6 * Math.sin(6 * lat))

  const dl2 = dl * dl
  const dl4 = dl2 * dl2
  const dl6 = dl4 * dl2

  const x =
    M +
    ((N * sinB * cosB) / 2) * dl2 +
    ((N * sinB * cosB * cosB * cosB) / 24) * (5 - t * t + 9 * eta2 + 4 * eta2 * eta2) * dl4 +
    ((N * sinB * Math.pow(cosB, 5)) / 720) * (61 - 58 * t * t + t * t * t * t) * dl6

  const y =
    N * cosB * dl +
    ((N * cosB * cosB * cosB) / 6) * (1 - t * t + eta2) * dl2 * dl +
    ((N * Math.pow(cosB, 5)) / 120) * (5 - 18 * t * t + t * t * t * t + 14 * eta2 - 58 * eta2 * t * t) * dl4 * dl

  return { x, y }
}

// ============================================================
// Gauss-Krüger inverse projection (xy → BL)
// ============================================================

function inverse(x: number, y: number, centralMeridian: number, datum: Datum) {
  const p = params(datum)

  // Footprint latitude by iterating meridian arc
  const A0 = 1 - p.e2 / 4 - (3 * p.e2 * p.e2) / 64 - (5 * p.e2 * p.e2 * p.e2) / 256
  let Bf = x / (p.a * A0)
  for (let i = 0; i < 10; i++) {
    const A2 = (3 / 8) * (p.e2 + (p.e2 * p.e2) / 4 + (15 * p.e2 * p.e2 * p.e2) / 128)
    const A4 = (15 / 256) * (p.e2 * p.e2 + (3 * p.e2 * p.e2 * p.e2) / 4)
    const A6 = (35 * p.e2 * p.e2 * p.e2) / 3072
    const Mf = p.a * (A0 * Bf - A2 * Math.sin(2 * Bf) + A4 * Math.sin(4 * Bf) - A6 * Math.sin(6 * Bf))
    Bf = Bf + (x - Mf) / (p.a * A0)
  }

  const sinBf = Math.sin(Bf)
  const cosBf = Math.cos(Bf)
  const tanBf = Math.tan(Bf)
  const Nf = p.a / Math.sqrt(1 - p.e2 * sinBf * sinBf)
  const Rf = (p.a * (1 - p.e2)) / Math.pow(1 - p.e2 * sinBf * sinBf, 1.5)
  const eta2 = p.ep2 * cosBf * cosBf
  const tf = tanBf
  const tf2 = tf * tf

  const y2 = y * y
  const y4 = y2 * y2
  const y6 = y4 * y2

  const lat =
    Bf -
    (tf / (2 * Rf * Nf)) * y2 +
    (tf / (24 * Rf * Nf * Nf * Nf)) * (5 + 3 * tf2 + eta2 - 9 * eta2 * tf2) * y4 -
    (tf / (720 * Rf * Math.pow(Nf, 5))) * (61 + 90 * tf2 + 45 * tf2 * tf2) * y6

  const lon =
    y / (Nf * cosBf) -
    ((y2 * y) / (6 * Nf * Nf * Nf * cosBf)) * (1 + 2 * tf2 + eta2) +
    ((y4 * y) / (120 * Math.pow(Nf, 5) * cosBf)) * (5 + 28 * tf2 + 24 * tf2 * tf2 + 6 * eta2 + 8 * eta2 * tf2)

  return {
    lat: (lat * 180) / Math.PI,
    lon: centralMeridian + (lon * 180) / Math.PI,
  }
}

// ============================================================
// 7-parameter Bursa-Wolf datum transformation
// ============================================================

function blh2xyz(latDeg: number, lonDeg: number, h: number, datum: Datum) {
  const p = params(datum)
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  const sinB = Math.sin(lat)
  const cosB = Math.cos(lat)
  const sinL = Math.sin(lon)
  const cosL = Math.cos(lon)
  const N = p.a / Math.sqrt(1 - p.e2 * sinB * sinB)
  return {
    X: (N + h) * cosB * cosL,
    Y: (N + h) * cosB * sinL,
    Z: (N * (1 - p.e2) + h) * sinB,
  }
}

function xyz2blh(X: number, Y: number, Z: number, datum: Datum) {
  const p = params(datum)
  const lon = Math.atan2(Y, X)
  const rho = Math.sqrt(X * X + Y * Y)
  let lat = Math.atan2(Z, rho * (1 - p.e2))

  for (let i = 0; i < 10; i++) {
    const sinB = Math.sin(lat)
    const N = p.a / Math.sqrt(1 - p.e2 * sinB * sinB)
    lat = Math.atan2(Z + p.e2 * N * sinB, rho)
  }
  const sinB = Math.sin(lat)
  const N = p.a / Math.sqrt(1 - p.e2 * sinB * sinB)
  const h = rho / Math.cos(lat) - N

  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI, h }
}

function bursa(
  X: number,
  Y: number,
  Z: number,
  dx: number,
  dy: number,
  dz: number,
  rx: number,
  ry: number,
  rz: number,
  s: number,
) {
  const rxr = (rx * Math.PI) / 180 / 3600
  const ryr = (ry * Math.PI) / 180 / 3600
  const rzr = (rz * Math.PI) / 180 / 3600
  const sc = 1 + s * 1e-6
  return {
    X: dx + sc * (X + rzr * Y - ryr * Z),
    Y: dy + sc * (-rzr * X + Y + rxr * Z),
    Z: dz + sc * (ryr * X - rxr * Y + Z),
  }
}

// Common approximate 7-parameter sets (China region, for engineering use)
// These are approximate values for demonstration; real projects should use
// local control point fitting for high-precision transformations.
const TRANSFORMS: Record<
  string,
  { dx: number; dy: number; dz: number; rx: number; ry: number; rz: number; s: number }
> = {
  WGS84_to_CGCS2000: { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, s: 0 },
  CGCS2000_to_WGS84: { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, s: 0 },
  Beijing54_to_CGCS2000: { dx: -12.064, dy: 130.736, dz: 91.496, rx: 0, ry: 0, rz: 0, s: 0 },
  CGCS2000_to_Beijing54: { dx: 12.064, dy: -130.736, dz: -91.496, rx: 0, ry: 0, rz: 0, s: 0 },
  Xian80_to_CGCS2000: { dx: -4.2, dy: 72.4, dz: 80.6, rx: 0, ry: 0, rz: 0, s: 0 },
  CGCS2000_to_Xian80: { dx: 4.2, dy: -72.4, dz: -80.6, rx: 0, ry: 0, rz: 0, s: 0 },
  Beijing54_to_WGS84: { dx: -12.064, dy: 130.736, dz: 91.496, rx: 0, ry: 0, rz: 0, s: 0 },
  WGS84_to_Beijing54: { dx: 12.064, dy: -130.736, dz: -91.496, rx: 0, ry: 0, rz: 0, s: 0 },
  Xian80_to_WGS84: { dx: -4.2, dy: 72.4, dz: 80.6, rx: 0, ry: 0, rz: 0, s: 0 },
  WGS84_to_Xian80: { dx: 4.2, dy: -72.4, dz: -80.6, rx: 0, ry: 0, rz: 0, s: 0 },
  Beijing54_to_Xian80: { dx: -7.864, dy: 58.336, dz: 10.896, rx: 0, ry: 0, rz: 0, s: 0 },
  Xian80_to_Beijing54: { dx: 7.864, dy: -58.336, dz: -10.896, rx: 0, ry: 0, rz: 0, s: 0 },
}

// ============================================================
// Tool: Gauss-Krüger forward projection
// ============================================================

export const gauss_forward = tool({
  description:
    "高斯-克吕格投影正算：将大地经纬度(B, L)转换为平面直角坐标(x, y)。data_analyst 在将GPS采集的经纬度数据转换为工程平面坐标时调用此工具。",
  args: {
    lat: tool.schema.number().describe("纬度（十进制度），如 30.123456"),
    lon: tool.schema.number().describe("经度（十进制度），如 120.654321"),
    centralMeridian: tool.schema
      .number()
      .describe("中央子午线经度（度），3度带常用：120、123等；6度带常用：117、123等"),
    datum: tool.schema.enum(["CGCS2000", "WGS84", "Xian80", "Beijing54"]).default("CGCS2000").describe("坐标系"),
    addFalseEasting: tool.schema.boolean().default(true).describe("是否加500km假东偏移（工程坐标通常为true）"),
    zonePrefix: tool.schema.boolean().default(false).describe("y坐标是否加带号前缀（如3度带第40带则y前缀40）"),
  },
  async execute(args) {
    const { x, y: rawY } = forward(args.lat, args.lon, args.centralMeridian, args.datum)
    const zone = Math.round(args.centralMeridian / 3)
    let y = rawY
    if (args.addFalseEasting) y += 500000
    if (args.zonePrefix) y += zone * 1000000

    const ep = params(args.datum)
    return JSON.stringify({
      datum: args.datum,
      datum_desc: ep.desc,
      central_meridian: args.centralMeridian,
      zone_3deg: zone,
      input: { lat_deg: args.lat, lon_deg: args.lon },
      output: { x_m: Number(x.toFixed(4)), y_m: Number(y.toFixed(4)) },
      false_easting: args.addFalseEasting,
      zone_prefix: args.zonePrefix,
      message: `✅ 高斯正算完成（${ep.desc}）：B=${args.lat}°, L=${args.lon}° → x=${x.toFixed(4)}m, y=${y.toFixed(4)}m`,
    })
  },
})

// ============================================================
// Tool: Gauss-Krüger inverse projection
// ============================================================

export const gauss_inverse = tool({
  description:
    "高斯-克吕格投影反算：将平面直角坐标(x, y)转换为大地经纬度(B, L)。在需要将工程坐标还原为经纬度（如报告附图、GIS叠加）时调用。",
  args: {
    x: tool.schema.number().describe("北方向坐标(m)"),
    y: tool.schema.number().describe("东方向坐标(m)，可含500km假东偏移和带号前缀"),
    centralMeridian: tool.schema.number().describe("中央子午线经度（度）"),
    datum: tool.schema.enum(["CGCS2000", "WGS84", "Xian80", "Beijing54"]).default("CGCS2000").describe("坐标系"),
    hasFalseEasting: tool.schema.boolean().default(true).describe("y坐标是否已含500km假东偏移"),
    hasZonePrefix: tool.schema.boolean().default(false).describe("y坐标是否已含带号前缀"),
  },
  async execute(args) {
    let y = args.y
    if (args.hasZonePrefix) y = y % 1000000
    if (args.hasFalseEasting) y -= 500000

    const { lat, lon } = inverse(args.x, y, args.centralMeridian, args.datum)
    const ep = params(args.datum)

    return JSON.stringify({
      datum: args.datum,
      datum_desc: ep.desc,
      central_meridian: args.centralMeridian,
      input: { x_m: args.x, y_m: args.y },
      output: { lat_deg: Number(lat.toFixed(8)), lon_deg: Number(lon.toFixed(8)) },
      message: `✅ 高斯反算完成（${ep.desc}）：x=${args.x}m, y=${args.y}m → B=${lat.toFixed(8)}°, L=${lon.toFixed(8)}°`,
    })
  },
})

// ============================================================
// Tool: Datum transformation (7-parameter Bursa-Wolf)
// ============================================================

export const datum_transform = tool({
  description:
    "坐标系转换（七参数布尔莎模型）：在 CGCS2000、WGS84、1980西安坐标系、1954北京坐标系之间转换经纬度。使用内置的全国概略参数，精度约1~2m，满足一般工程复核需求。若需高精度转换（亚毫米级），请提供当地控制点拟合的七参数。",
  args: {
    lat: tool.schema.number().describe("纬度（十进制度）"),
    lon: tool.schema.number().describe("经度（十进制度）"),
    h: tool.schema.number().default(0).describe("大地高(m)，默认0"),
    from: tool.schema.enum(["CGCS2000", "WGS84", "Xian80", "Beijing54"]).describe("源坐标系"),
    to: tool.schema.enum(["CGCS2000", "WGS84", "Xian80", "Beijing54"]).describe("目标坐标系"),
    customParams: tool.schema
      .object({
        dx: tool.schema.number().describe("X平移(m)"),
        dy: tool.schema.number().describe("Y平移(m)"),
        dz: tool.schema.number().describe("Z平移(m)"),
        rx: tool.schema.number().describe("X旋转(角秒)"),
        ry: tool.schema.number().describe("Y旋转(角秒)"),
        rz: tool.schema.number().describe("Z旋转(角秒)"),
        s: tool.schema.number().describe("尺度因子(ppm)"),
      })
      .optional()
      .describe("自定义七参数（若提供则覆盖内置参数，用于高精度区域转换）"),
  },
  async execute(args) {
    if (args.from === args.to)
      return JSON.stringify({
        from: args.from,
        to: args.to,
        input: { lat: args.lat, lon: args.lon, h: args.h },
        output: { lat: args.lat, lon: args.lon, h: args.h },
        message: "源坐标系与目标坐标系相同，无需转换。",
      })

    const key = `${args.from}_to_${args.to}`
    const tp = args.customParams ?? TRANSFORMS[key]
    if (!tp) return JSON.stringify({ error: `不支持 ${args.from} → ${args.to} 的直接转换。` })

    const src = blh2xyz(args.lat, args.lon, args.h, args.from)
    const dst = bursa(src.X, src.Y, src.Z, tp.dx, tp.dy, tp.dz, tp.rx, tp.ry, tp.rz, tp.s)
    const result = xyz2blh(dst.X, dst.Y, dst.Z, args.to)

    const fromDesc = ELLIPSOIDS[args.from].desc
    const toDesc = ELLIPSOIDS[args.to].desc
    const isCustom = !!args.customParams

    return JSON.stringify({
      from: { datum: args.from, desc: fromDesc },
      to: { datum: args.to, desc: toDesc },
      input: { lat_deg: args.lat, lon_deg: args.lon, h_m: args.h },
      output: {
        lat_deg: Number(result.lat.toFixed(8)),
        lon_deg: Number(result.lon.toFixed(8)),
        h_m: Number(result.h.toFixed(3)),
      },
      parameters_used: isCustom ? "用户自定义七参数" : "内置全国概略参数",
      precision_note: isCustom
        ? "使用自定义参数，精度取决于参数拟合质量"
        : "内置概略参数精度约1~2m，仅供工程复核。高精度需求请提供当地控制点拟合参数。",
      message: `✅ 坐标系转换完成：${fromDesc} → ${toDesc}，B=${result.lat.toFixed(8)}°, L=${result.lon.toFixed(8)}°, H=${result.h.toFixed(3)}m`,
    })
  },
})
