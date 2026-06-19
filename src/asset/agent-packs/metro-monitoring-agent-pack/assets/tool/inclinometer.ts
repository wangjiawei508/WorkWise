/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

// ============================================================
// Deep horizontal displacement (inclinometer) tools
// 基坑深层水平位移（测斜仪）监测数据处理与分析
// ============================================================

// ============================================================
// Tool: Inclinometer profile calculation
// ============================================================

export const inclinometer_profile = tool({
  description:
    "测斜仪深层水平位移剖面计算。根据各深度处的测斜仪读数（A+/A-/B+/B-），计算各深度处的累计水平位移，生成位移-深度剖面。基坑监测中深层水平位移分析的核心工具。data_analyst 处理测斜数据时必须调用此工具。",
  args: {
    pointId: tool.schema.string().describe("测斜孔编号，如 CX-01"),
    gaugeLength: tool.schema.number().positive().default(0.5).describe("测斜仪导轮间距(m)，常见为0.5m或1.0m"),
    direction: tool.schema
      .enum(["A", "B", "AB"])
      .default("A")
      .describe("计算方向：A=垂直基坑方向, B=平行基坑方向, AB=双向"),
    baseDepth: tool.schema.number().positive().describe("管底深度(m)，即假定不动点深度"),
    initialReadings: tool.schema
      .array(
        tool.schema.object({
          depth: tool.schema.number().describe("测量深度(m)，从管口往下"),
          aPlus: tool.schema.number().describe("A+方向读数"),
          aMinus: tool.schema.number().describe("A-方向读数"),
          bPlus: tool.schema.number().optional().describe("B+方向读数"),
          bMinus: tool.schema.number().optional().describe("B-方向读数"),
        }),
      )
      .min(2)
      .describe("初始（基准）读数，从浅到深排列"),
    currentReadings: tool.schema
      .array(
        tool.schema.object({
          depth: tool.schema.number().describe("测量深度(m)"),
          aPlus: tool.schema.number().describe("A+方向读数"),
          aMinus: tool.schema.number().describe("A-方向读数"),
          bPlus: tool.schema.number().optional().describe("B+方向读数"),
          bMinus: tool.schema.number().optional().describe("B-方向读数"),
        }),
      )
      .min(2)
      .describe("本期读数，深度序列与初始读数一致"),
    alertThreshold: tool.schema.number().positive().optional().describe("水平位移报警值(mm)"),
  },
  async execute(args) {
    const K = 2 * 25000 // 灵敏度系数，标准测斜仪 2×25000
    const L = args.gaugeLength

    // Build depth-indexed maps
    const initMap = new Map(args.initialReadings.map((r) => [r.depth, r]))
    const currMap = new Map(args.currentReadings.map((r) => [r.depth, r]))

    // Get sorted depths (deep to shallow for bottom-up accumulation)
    const depths = [...new Set([...initMap.keys(), ...currMap.keys()])].sort((a, b) => b - a)

    // Calculate incremental displacement at each depth
    const increments: Array<{
      depth: number
      deltaA: number
      deltaB: number | null
    }> = []

    for (const d of depths) {
      const init = initMap.get(d)
      const curr = currMap.get(d)
      if (!init || !curr) continue

      // A direction: combined reading = (A+ - A-) to eliminate zero offset
      const initCombA = init.aPlus - init.aMinus
      const currCombA = curr.aPlus - curr.aMinus
      const deltaA = ((currCombA - initCombA) / K) * L * 1000 // mm

      let deltaB: number | null = null
      if (
        init.bPlus !== undefined &&
        init.bMinus !== undefined &&
        curr.bPlus !== undefined &&
        curr.bMinus !== undefined
      ) {
        const initCombB = init.bPlus - init.bMinus
        const currCombB = curr.bPlus - curr.bMinus
        deltaB = ((currCombB - initCombB) / K) * L * 1000 // mm
      }

      increments.push({ depth: d, deltaA, deltaB })
    }

    // Bottom-up accumulation (from base depth upward)
    // The deepest point (base) is assumed to have zero displacement
    let cumA = 0
    let cumB = 0
    const profile: Array<{
      depth: number
      incremental_a_mm: number
      incremental_b_mm: number | null
      cumulative_a_mm: number
      cumulative_b_mm: number | null
      resultant_mm: number | null
      status: string
    }> = []

    for (const inc of increments) {
      cumA += inc.deltaA
      if (inc.deltaB !== null) cumB += inc.deltaB

      const resultant = inc.deltaB !== null ? Math.sqrt(cumA * cumA + cumB * cumB) : null

      let status = "🟢 正常"
      if (args.alertThreshold) {
        const checkVal = resultant ?? Math.abs(cumA)
        const ratio = checkVal / args.alertThreshold
        if (ratio >= 1.0) status = "🔴 超限"
        else if (ratio >= 0.85) status = "🟠 接近阈值"
        else if (ratio >= 0.7) status = "🟡 关注"
      }

      profile.push({
        depth: inc.depth,
        incremental_a_mm: Number(inc.deltaA.toFixed(3)),
        incremental_b_mm: inc.deltaB !== null ? Number(inc.deltaB.toFixed(3)) : null,
        cumulative_a_mm: Number(cumA.toFixed(3)),
        cumulative_b_mm: inc.deltaB !== null ? Number(cumB.toFixed(3)) : null,
        resultant_mm: resultant !== null ? Number(resultant.toFixed(3)) : null,
        status,
      })
    }

    // Reverse so output is shallow-to-deep (top to bottom)
    profile.reverse()

    // Find max displacement
    const maxPoint = profile.reduce(
      (max, p) => {
        const val = p.resultant_mm ?? Math.abs(p.cumulative_a_mm)
        return val > max.value ? { depth: p.depth, value: val } : max
      },
      { depth: 0, value: 0 },
    )

    return JSON.stringify({
      point_id: args.pointId,
      direction: args.direction,
      gauge_length_m: L,
      base_depth_m: args.baseDepth,
      measurement_count: profile.length,
      max_displacement: {
        depth_m: maxPoint.depth,
        value_mm: Number(maxPoint.value.toFixed(3)),
      },
      profile,
      alert_threshold_mm: args.alertThreshold ?? null,
      message: `✅ ${args.pointId} 测斜分析完成：${profile.length}个测点，最大位移 ${maxPoint.value.toFixed(3)}mm（深度 ${maxPoint.depth}m）${args.alertThreshold ? `，控制值 ${args.alertThreshold}mm` : ""}`,
    })
  },
})

// ============================================================
// Tool: Inclinometer multi-period trend analysis
// ============================================================

export const inclinometer_trend = tool({
  description:
    "测斜仪多期数据趋势分析。输入同一测斜孔多期的最大水平位移值，分析位移发展趋势、速率变化，预测未来位移。用于基坑监测周报中的深层位移趋势判断。",
  args: {
    pointId: tool.schema.string().describe("测斜孔编号"),
    maxDepth: tool.schema.number().positive().describe("最大位移所在深度(m)"),
    records: tool.schema
      .array(
        tool.schema.object({
          date: tool.schema.string().describe("观测日期 YYYY-MM-DD"),
          maxDisplacement: tool.schema.number().describe("该期最大累计水平位移(mm)"),
        }),
      )
      .min(3)
      .describe("多期最大位移数据，按时间排序"),
    alertThreshold: tool.schema.number().positive().optional().describe("报警值(mm)"),
    predictionDays: tool.schema.number().int().positive().default(7).describe("预测天数"),
  },
  async execute(args) {
    const n = args.records.length
    const t0 = new Date(args.records[0]!.date).getTime()
    const days = args.records.map((r) => (new Date(r.date).getTime() - t0) / 86400000)
    const vals = args.records.map((r) => r.maxDisplacement)

    // Period rates
    const rates: Array<{ period: string; rate: number; increment: number }> = []
    for (let i = 1; i < n; i++) {
      const dt = days[i]! - days[i - 1]!
      const dv = vals[i]! - vals[i - 1]!
      rates.push({
        period: `${args.records[i - 1]!.date} → ${args.records[i]!.date}`,
        rate: dt > 0 ? Number((dv / dt).toFixed(4)) : 0,
        increment: Number(dv.toFixed(3)),
      })
    }

    // Linear regression
    const meanX = days.reduce((s, v) => s + v, 0) / n
    const meanY = vals.reduce((s, v) => s + v, 0) / n
    const ssxy = days.reduce((s, x, i) => s + (x - meanX) * (vals[i]! - meanY), 0)
    const ssxx = days.reduce((s, x) => s + (x - meanX) * (x - meanX), 0)
    const b = ssxx > 0 ? ssxy / ssxx : 0
    const a = meanY - b * meanX

    const lastDay = days[n - 1]!
    const predictions = Array.from({ length: args.predictionDays }, (_, i) => {
      const d = lastDay + i + 1
      return {
        date: new Date(t0 + d * 86400000).toISOString().slice(0, 10),
        predicted_mm: Number((a + b * d).toFixed(3)),
      }
    })

    // Stability
    const last3 = rates.slice(-3).map((r) => Math.abs(r.rate))
    const avgLast3 = last3.length > 0 ? last3.reduce((s, v) => s + v, 0) / last3.length : 0
    const avgRate = Math.abs(b)

    let stability: string
    if (avgLast3 < 0.01) stability = "✅ 已收敛"
    else if (avgLast3 < 0.05) stability = "🟢 趋于收敛"
    else if (avgLast3 > avgRate * 1.5) stability = "🔴 加速发展，需加密监测"
    else stability = "🟡 等速发展，继续监测"

    let daysToAlert: number | string = "不会到达"
    if (args.alertThreshold && b > 0) {
      const d = (args.alertThreshold - a) / b - lastDay
      if (d > 0) daysToAlert = Number(d.toFixed(1))
    }

    return JSON.stringify({
      point_id: args.pointId,
      max_depth_m: args.maxDepth,
      latest_mm: vals[n - 1],
      trend_rate_mm_per_day: Number(b.toFixed(4)),
      stability,
      rates,
      predictions,
      days_to_alert: daysToAlert,
      message: `✅ ${args.pointId} 深层位移趋势：最新 ${vals[n - 1]}mm，速率 ${b.toFixed(4)}mm/d，${stability}`,
    })
  },
})
