/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

// ============================================================
// Total station distance correction tools
// ============================================================

// Standard atmospheric conditions (IUGG)
const STD_TEMP = 15 // °C
const STD_PRESSURE = 1013.25 // hPa
const STD_GROUP_REFRACTIVITY = 281.8 // N_g for typical EDM (λ ≈ 0.86μm)

// ============================================================
// Tool: Atmospheric correction for EDM
// ============================================================

export const atmospheric_correction = tool({
  description:
    "全站仪/测距仪气象改正计算。根据现场实测的气温和气压，计算第一速度改正（气象改正）并返回改正后的斜距。data_analyst 在处理外业测距数据时，若气象条件与仪器预设不同，必须调用此工具进行改正。",
  args: {
    slopeDistance: tool.schema.number().positive().describe("实测斜距(m)"),
    temperature: tool.schema.number().describe("现场气温(°C)"),
    pressure: tool.schema.number().positive().describe("现场气压(hPa/mbar)"),
    humidity: tool.schema.number().min(0).max(100).default(50).describe("相对湿度(%)，默认50%"),
    instrumentRefTemp: tool.schema.number().default(STD_TEMP).describe("仪器出厂标准气温(°C)，通常15°C"),
    instrumentRefPressure: tool.schema.number().default(STD_PRESSURE).describe("仪器出厂标准气压(hPa)，通常1013.25hPa"),
  },
  async execute(args) {
    // Approximate water vapor pressure (Magnus formula)
    const ew = 4.6108 * Math.exp((17.27 * args.temperature) / (args.temperature + 237.3))
    const e = (ew * args.humidity) / 100

    // Group refractivity at field conditions
    const Nfield =
      (STD_GROUP_REFRACTIVITY * (args.pressure / args.instrumentRefPressure) * (1 + args.instrumentRefTemp / 273.15)) /
        (1 + args.temperature / 273.15) -
      (11.27 * e) / (273.15 + args.temperature)

    // Group refractivity at instrument standard conditions
    const Nstd = STD_GROUP_REFRACTIVITY

    // Correction ppm
    const ppm = Nstd - Nfield
    const correction = args.slopeDistance * ppm * 1e-6
    const corrected = args.slopeDistance + correction

    return JSON.stringify({
      input: {
        slope_distance_m: args.slopeDistance,
        temperature_c: args.temperature,
        pressure_hpa: args.pressure,
        humidity_pct: args.humidity,
      },
      water_vapor_pressure_hpa: Number(e.toFixed(3)),
      field_refractivity_N: Number(Nfield.toFixed(2)),
      standard_refractivity_N: Nstd,
      correction_ppm: Number(ppm.toFixed(2)),
      correction_m: Number(correction.toFixed(4)),
      corrected_distance_m: Number(corrected.toFixed(4)),
      message: `✅ 气象改正：${args.slopeDistance}m → ${corrected.toFixed(4)}m（改正量 ${correction >= 0 ? "+" : ""}${correction.toFixed(4)}m，${ppm.toFixed(2)} ppm）`,
    })
  },
})

// ============================================================
// Tool: Slope distance → Horizontal distance
// ============================================================

export const slope_to_horizontal = tool({
  description:
    "斜距化平：将全站仪实测的斜距和天顶距（或竖直角）转换为水平距离和高差。这是测距数据处理的基本步骤，data_analyst 在计算平面坐标前必须先调用此工具。",
  args: {
    slopeDistance: tool.schema.number().positive().describe("斜距(m)"),
    zenithAngle: tool.schema.number().optional().describe("天顶距（十进制度），0°=天顶，90°=水平"),
    verticalAngle: tool.schema.number().optional().describe("竖直角（十进制度），正值仰角，负值俯角。与天顶距二选一"),
    instrumentHeight: tool.schema.number().default(0).describe("仪器高(m)，默认0"),
    targetHeight: tool.schema.number().default(0).describe("目标高/棱镜高(m)，默认0"),
  },
  async execute(args) {
    if (args.zenithAngle === undefined && args.verticalAngle === undefined)
      return JSON.stringify({ error: "必须提供天顶距(zenithAngle)或竖直角(verticalAngle)之一。" })

    const zenith = args.zenithAngle !== undefined ? args.zenithAngle : 90 - (args.verticalAngle ?? 0)

    const zenithRad = (zenith * Math.PI) / 180
    const horizDist = args.slopeDistance * Math.sin(zenithRad)
    const rawHeightDiff = args.slopeDistance * Math.cos(zenithRad)
    const heightDiff = rawHeightDiff + args.instrumentHeight - args.targetHeight

    return JSON.stringify({
      input: {
        slope_distance_m: args.slopeDistance,
        zenith_angle_deg: Number(zenith.toFixed(6)),
        instrument_height_m: args.instrumentHeight,
        target_height_m: args.targetHeight,
      },
      horizontal_distance_m: Number(horizDist.toFixed(4)),
      height_difference_m: Number(heightDiff.toFixed(4)),
      raw_height_diff_m: Number(rawHeightDiff.toFixed(4)),
      message: `✅ 斜距 ${args.slopeDistance}m, 天顶距 ${zenith.toFixed(4)}° → 平距 ${horizDist.toFixed(4)}m, 高差 ${heightDiff.toFixed(4)}m`,
    })
  },
})

// ============================================================
// Tool: Projection correction (sea level + Gauss projection)
// ============================================================

export const projection_correction = tool({
  description:
    "投影改正（归算至参考椭球面 + 高斯投影变形改正）。将实测的水平距离改正到参考椭球面（海拔改正），再改正高斯投影面变形。工程测量中，当测区海拔较高或距中央子午线较远时，必须进行此改正。",
  args: {
    horizontalDistance: tool.schema.number().positive().describe("地面水平距离(m)"),
    averageElevation: tool.schema.number().describe("测线平均海拔高度(m)"),
    averageYOffset: tool.schema.number().describe("测线中点距中央子午线的距离(m)，即y坐标（去掉500km假东偏移后）"),
    earthRadius: tool.schema.number().default(6371000).describe("平均地球半径(m)，默认6371000"),
  },
  async execute(args) {
    const R = args.earthRadius

    // Sea level (ellipsoid) correction
    const seaLevelFactor = R / (R + args.averageElevation)
    const seaLevelDist = args.horizontalDistance * seaLevelFactor
    const seaLevelCorr = seaLevelDist - args.horizontalDistance

    // Gauss projection scale factor correction
    const ym = args.averageYOffset
    const gaussFactor = 1 + (ym * ym) / (2 * R * R)
    const projectedDist = seaLevelDist * gaussFactor
    const gaussCorr = projectedDist - seaLevelDist

    const totalCorr = projectedDist - args.horizontalDistance
    const totalPpm = (totalCorr / args.horizontalDistance) * 1e6

    return JSON.stringify({
      input: {
        horizontal_distance_m: args.horizontalDistance,
        average_elevation_m: args.averageElevation,
        average_y_offset_m: args.averageYOffset,
      },
      sea_level_correction: {
        factor: Number(seaLevelFactor.toFixed(8)),
        correction_m: Number(seaLevelCorr.toFixed(4)),
        corrected_m: Number(seaLevelDist.toFixed(4)),
      },
      gauss_projection_correction: {
        scale_factor: Number(gaussFactor.toFixed(8)),
        correction_m: Number(gaussCorr.toFixed(4)),
        corrected_m: Number(projectedDist.toFixed(4)),
      },
      total_correction_m: Number(totalCorr.toFixed(4)),
      total_correction_ppm: Number(totalPpm.toFixed(2)),
      projected_distance_m: Number(projectedDist.toFixed(4)),
      message: `✅ 投影改正：${args.horizontalDistance}m → ${projectedDist.toFixed(4)}m（总改正 ${totalCorr >= 0 ? "+" : ""}${totalCorr.toFixed(4)}m = ${totalPpm.toFixed(2)} ppm）`,
    })
  },
})

// ============================================================
// Tool: Full distance reduction pipeline
// ============================================================

export const distance_reduction = tool({
  description:
    "测距综合归算（一键完成：气象改正→斜距化平→投影改正）。将全站仪原始斜距数据经过完整的三步改正，最终得到高斯投影面上的平面距离。这是外业数据处理的标准流程，data_analyst 拿到原始测距记录后应首先调用此工具。",
  args: {
    slopeDistance: tool.schema.number().positive().describe("实测斜距(m)"),
    zenithAngle: tool.schema.number().describe("天顶距（十进制度）"),
    temperature: tool.schema.number().describe("现场气温(°C)"),
    pressure: tool.schema.number().positive().describe("现场气压(hPa)"),
    humidity: tool.schema.number().min(0).max(100).default(50).describe("相对湿度(%)"),
    instrumentHeight: tool.schema.number().default(0).describe("仪器高(m)"),
    targetHeight: tool.schema.number().default(0).describe("棱镜高(m)"),
    averageElevation: tool.schema.number().default(0).describe("测线平均海拔(m)，为0则跳过投影改正"),
    averageYOffset: tool.schema.number().default(0).describe("距中央子午线距离(m)，为0则跳过高斯改正"),
  },
  async execute(args) {
    const steps: string[] = []

    // Step 1: Atmospheric correction
    const ew = 4.6108 * Math.exp((17.27 * args.temperature) / (args.temperature + 237.3))
    const e = (ew * args.humidity) / 100
    const Nfield =
      (STD_GROUP_REFRACTIVITY * (args.pressure / STD_PRESSURE) * (1 + STD_TEMP / 273.15)) /
        (1 + args.temperature / 273.15) -
      (11.27 * e) / (273.15 + args.temperature)
    const ppm = STD_GROUP_REFRACTIVITY - Nfield
    const atmosCorr = args.slopeDistance * ppm * 1e-6
    const atmosDist = args.slopeDistance + atmosCorr
    steps.push(`气象改正: ${args.slopeDistance}m + ${atmosCorr.toFixed(4)}m = ${atmosDist.toFixed(4)}m`)

    // Step 2: Slope to horizontal
    const zenithRad = (args.zenithAngle * Math.PI) / 180
    const horizDist = atmosDist * Math.sin(zenithRad)
    const heightDiff = atmosDist * Math.cos(zenithRad) + args.instrumentHeight - args.targetHeight
    steps.push(`斜距化平: ${atmosDist.toFixed(4)}m → ${horizDist.toFixed(4)}m`)

    // Step 3: Projection correction (only if elevation or y-offset provided)
    let finalDist = horizDist
    const R = 6371000

    if (args.averageElevation !== 0 || args.averageYOffset !== 0) {
      const seaFactor = R / (R + args.averageElevation)
      const seaDist = horizDist * seaFactor
      const gaussFactor = 1 + (args.averageYOffset * args.averageYOffset) / (2 * R * R)
      finalDist = seaDist * gaussFactor
      const projCorr = finalDist - horizDist
      steps.push(
        `投影改正: ${horizDist.toFixed(4)}m → ${finalDist.toFixed(4)}m（${projCorr >= 0 ? "+" : ""}${projCorr.toFixed(4)}m）`,
      )
    }

    return JSON.stringify({
      input: {
        slope_distance_m: args.slopeDistance,
        zenith_angle_deg: args.zenithAngle,
        temperature_c: args.temperature,
        pressure_hpa: args.pressure,
      },
      step1_atmospheric: {
        correction_ppm: Number(ppm.toFixed(2)),
        correction_m: Number(atmosCorr.toFixed(4)),
        result_m: Number(atmosDist.toFixed(4)),
      },
      step2_slope_to_horizontal: {
        horizontal_distance_m: Number(horizDist.toFixed(4)),
        height_difference_m: Number(heightDiff.toFixed(4)),
      },
      step3_projection: {
        projected_distance_m: Number(finalDist.toFixed(4)),
        total_reduction_m: Number((finalDist - args.slopeDistance).toFixed(4)),
      },
      final_distance_m: Number(finalDist.toFixed(4)),
      height_difference_m: Number(heightDiff.toFixed(4)),
      processing_steps: steps,
      message: `✅ 综合归算完成：原始斜距 ${args.slopeDistance}m → 投影平距 ${finalDist.toFixed(4)}m，高差 ${heightDiff.toFixed(4)}m`,
    })
  },
})
