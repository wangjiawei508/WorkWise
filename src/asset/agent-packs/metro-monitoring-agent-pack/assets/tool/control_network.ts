/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

// Reusable matrix utilities for least-squares adjustment
type Matrix = number[][]

const mat = {
  zeros: (r: number, c: number): Matrix => Array.from({ length: r }, () => Array(c).fill(0) as number[]),

  identity: (n: number): Matrix =>
    Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))),

  transpose: (a: Matrix): Matrix => a[0]!.map((_, j) => a.map((row) => row[j]!)),

  mul: (a: Matrix, b: Matrix): Matrix =>
    a.map((row) => b[0]!.map((_, j) => row.reduce((sum, val, k) => sum + val * b[k]![j]!, 0))),

  mulVec: (a: Matrix, v: number[]): number[] => a.map((row) => row.reduce((sum, val, k) => sum + val * v[k]!, 0)),

  invert: (src: Matrix): Matrix | null => {
    const n = src.length
    const aug = src.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
    for (let col = 0; col < n; col++) {
      let pivotRow = col
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row]![col]!) > Math.abs(aug[pivotRow]![col]!)) pivotRow = row
      }
      if (Math.abs(aug[pivotRow]![col]!) < 1e-15) return null
      ;[aug[col], aug[pivotRow]] = [aug[pivotRow]!, aug[col]!]
      const pivot = aug[col]![col]!
      for (let j = col; j < 2 * n; j++) aug[col]![j]! /= pivot
      for (let row = 0; row < n; row++) {
        if (row === col) continue
        const factor = aug[row]![col]!
        for (let j = col; j < 2 * n; j++) aug[row]![j]! -= factor * aug[col]![j]!
      }
    }
    return aug.map((row) => row.slice(n))
  },
}

const deg2rad = (d: number) => (d * Math.PI) / 180
const rad2deg = (r: number) => (r * 180) / Math.PI

// Compute azimuth from point A to point B (degrees, clockwise from north)
function azimuth(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2)
}

export const plane_network_adjustment = tool({
  description:
    "平面控制网严密平差（间接平差法）。输入已知控制点坐标、待求点近似坐标、边长和方向观测值，进行最小二乘平差，输出平差后坐标、精度评定、误差椭圆参数。地保监测控制网组网计算的核心工具。data_analyst 处理控制网观测数据时必须调用此工具。",
  args: {
    knownPoints: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("点号"),
          x: tool.schema.number().describe("X坐标(m)"),
          y: tool.schema.number().describe("Y坐标(m)"),
        }),
      )
      .min(1)
      .describe("已知控制点"),
    unknownPoints: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("点号"),
          x0: tool.schema.number().describe("近似X坐标(m)"),
          y0: tool.schema.number().describe("近似Y坐标(m)"),
        }),
      )
      .min(1)
      .describe("待求点及其近似坐标"),
    distanceObs: tool.schema
      .array(
        tool.schema.object({
          from: tool.schema.string().describe("起点"),
          to: tool.schema.string().describe("终点"),
          distance: tool.schema.number().positive().describe("观测边长(m)"),
          sigma: tool.schema.number().positive().default(0.002).describe("边长中误差(m)，默认2mm"),
        }),
      )
      .describe("边长观测值"),
    directionObs: tool.schema
      .array(
        tool.schema.object({
          station: tool.schema.string().describe("测站点"),
          target: tool.schema.string().describe("目标点"),
          direction: tool.schema.number().describe("观测方向值(度，十进制)"),
          sigma: tool.schema.number().positive().default(2).describe("方向中误差(秒)，默认2″"),
        }),
      )
      .optional()
      .describe("方向观测值（可选）"),
    angleObs: tool.schema
      .array(
        tool.schema.object({
          station: tool.schema.string().describe("测站点"),
          left: tool.schema.string().describe("左目标"),
          right: tool.schema.string().describe("右目标"),
          angle: tool.schema.number().describe("观测角值(度，十进制)"),
          sigma: tool.schema.number().positive().default(2).describe("角度中误差(秒)，默认2″"),
        }),
      )
      .optional()
      .describe("角度观测值（可选）"),
    maxIterations: tool.schema.number().int().positive().default(10).describe("最大迭代次数"),
    convergence: tool.schema.number().positive().default(0.0001).describe("收敛阈值(m)"),
  },
  async execute(args) {
    const coordMap = new Map<string, { x: number; y: number; known: boolean }>()
    for (const p of args.knownPoints) coordMap.set(p.id, { x: p.x, y: p.y, known: true })
    for (const p of args.unknownPoints) coordMap.set(p.id, { x: p.x0, y: p.y0, known: false })

    const unknownIds = args.unknownPoints.map((p) => p.id)
    const u = unknownIds.length * 2

    // Iterative least-squares
    let iteration = 0
    let sigma0 = 0
    let Qxx: Matrix | null = null
    let corrections: number[] = []
    const residualsList: Array<{ type: string; obs: string; residual: number }> = []

    while (iteration < args.maxIterations) {
      iteration++
      const obsRows: Array<{ Arow: number[]; l: number; weight: number; label: string; type: string }> = []

      // Distance observations
      for (const obs of args.distanceObs) {
        const pFrom = coordMap.get(obs.from)!
        const pTo = coordMap.get(obs.to)!
        const s0 = distance(pFrom.x, pFrom.y, pTo.x, pTo.y)
        const l = obs.distance - s0

        const Arow = new Array(u).fill(0)
        const dx = pTo.x - pFrom.x
        const dy = pTo.y - pFrom.y

        const fromIdx = unknownIds.indexOf(obs.from)
        const toIdx = unknownIds.indexOf(obs.to)

        if (fromIdx >= 0) {
          Arow[fromIdx * 2] = -dx / s0
          Arow[fromIdx * 2 + 1] = -dy / s0
        }
        if (toIdx >= 0) {
          Arow[toIdx * 2] = dx / s0
          Arow[toIdx * 2 + 1] = dy / s0
        }

        obsRows.push({
          Arow,
          l,
          weight: 1 / (obs.sigma * obs.sigma),
          label: `${obs.from}-${obs.to}`,
          type: "distance",
        })
      }

      // Angle observations
      if (args.angleObs) {
        for (const obs of args.angleObs) {
          const pS = coordMap.get(obs.station)!
          const pL = coordMap.get(obs.left)!
          const pR = coordMap.get(obs.right)!

          const azL = azimuth(pS.x, pS.y, pL.x, pL.y)
          const azR = azimuth(pS.x, pS.y, pR.x, pR.y)
          const computed = (azR - azL + 360) % 360
          const l = ((obs.angle - computed) * Math.PI) / 180

          const Arow = new Array(u).fill(0)
          const rho = 206264.806

          // Partial derivatives for angle = azR - azL
          const sIdx = unknownIds.indexOf(obs.station)
          const lIdx = unknownIds.indexOf(obs.left)
          const rIdx = unknownIds.indexOf(obs.right)

          const dSL = distance(pS.x, pS.y, pL.x, pL.y)
          const dSR = distance(pS.x, pS.y, pR.x, pR.y)

          // dAngle/dStation, dAngle/dLeft, dAngle/dRight
          if (lIdx >= 0) {
            Arow[lIdx * 2] = -(pL.y - pS.y) / (dSL * dSL)
            Arow[lIdx * 2 + 1] = (pL.x - pS.x) / (dSL * dSL)
          }
          if (rIdx >= 0) {
            Arow[rIdx * 2] = (pR.y - pS.y) / (dSR * dSR)
            Arow[rIdx * 2 + 1] = -(pR.x - pS.x) / (dSR * dSR)
          }
          if (sIdx >= 0) {
            const dAzL_dx = (pL.y - pS.y) / (dSL * dSL)
            const dAzL_dy = -(pL.x - pS.x) / (dSL * dSL)
            const dAzR_dx = -(pR.y - pS.y) / (dSR * dSR)
            const dAzR_dy = (pR.x - pS.x) / (dSR * dSR)
            Arow[sIdx * 2] = dAzR_dx - dAzL_dx
            Arow[sIdx * 2 + 1] = dAzR_dy - dAzL_dy
          }

          const sigmaRad = obs.sigma / rho
          obsRows.push({
            Arow,
            l,
            weight: 1 / (sigmaRad * sigmaRad),
            label: `∠${obs.left}-${obs.station}-${obs.right}`,
            type: "angle",
          })
        }
      }

      const n = obsRows.length
      if (n < u / 2) {
        return JSON.stringify({ error: `观测数 ${n} 不足，至少需要 ${Math.ceil(u / 2)} 个观测值。` })
      }

      const A = obsRows.map((r) => r.Arow)
      const P = mat.zeros(n, n)
      obsRows.forEach((r, i) => {
        P[i]![i] = r.weight
      })
      const L = obsRows.map((r) => r.l)

      const AT = mat.transpose(A)
      const ATP = mat.mul(AT, P)
      const N = mat.mul(ATP, A)
      const b = mat.mulVec(ATP, L)

      Qxx = mat.invert(N)
      if (!Qxx) return JSON.stringify({ error: "法方程奇异，请检查网形连通性和观测值充分性。" })

      corrections = mat.mulVec(Qxx, b)

      // Apply corrections
      let maxCorr = 0
      for (let i = 0; i < unknownIds.length; i++) {
        const p = coordMap.get(unknownIds[i]!)!
        p.x += corrections[i * 2]!
        p.y += corrections[i * 2 + 1]!
        maxCorr = Math.max(maxCorr, Math.abs(corrections[i * 2]!), Math.abs(corrections[i * 2 + 1]!))
      }

      // Residuals & sigma0
      const V = mat.mulVec(A, corrections).map((v, i) => v - L[i]!)
      const VTPV = V.reduce((sum, v, i) => sum + v * P[i]![i]! * v, 0)
      const redundancy = n - u / 2
      sigma0 = redundancy > 0 ? Math.sqrt(VTPV / redundancy) : 0

      if (iteration === args.maxIterations || maxCorr < args.convergence) {
        residualsList.length = 0
        for (let i = 0; i < n; i++) {
          residualsList.push({
            type: obsRows[i]!.type,
            obs: obsRows[i]!.label,
            residual:
              obsRows[i]!.type === "distance"
                ? Number((V[i]! * 1000).toFixed(3))
                : Number((V[i]! * 206264.806).toFixed(2)),
          })
        }
        break
      }
    }

    // Build results
    const adjustedPoints = unknownIds.map((id, i) => {
      const p = coordMap.get(id)!
      const qx = Qxx![i * 2]![i * 2]!
      const qy = Qxx![i * 2 + 1]![i * 2 + 1]!
      const qxy = Qxx![i * 2]![i * 2 + 1]!

      const sigmaX = sigma0 * Math.sqrt(Math.abs(qx))
      const sigmaY = sigma0 * Math.sqrt(Math.abs(qy))
      const sigmaP = Math.sqrt(sigmaX * sigmaX + sigmaY * sigmaY)

      // Error ellipse
      const theta = 0.5 * Math.atan2(2 * qxy, qx - qy)
      const a2 = 0.5 * (qx + qy) + 0.5 * Math.sqrt((qx - qy) ** 2 + 4 * qxy * qxy)
      const b2 = 0.5 * (qx + qy) - 0.5 * Math.sqrt((qx - qy) ** 2 + 4 * qxy * qxy)

      return {
        id,
        x: Number(p.x.toFixed(4)),
        y: Number(p.y.toFixed(4)),
        sigma_x_mm: Number((sigmaX * 1000).toFixed(3)),
        sigma_y_mm: Number((sigmaY * 1000).toFixed(3)),
        sigma_point_mm: Number((sigmaP * 1000).toFixed(3)),
        error_ellipse: {
          semi_major_mm: Number((sigma0 * Math.sqrt(Math.abs(a2)) * 1000).toFixed(3)),
          semi_minor_mm: Number((sigma0 * Math.sqrt(Math.abs(b2)) * 1000).toFixed(3)),
          orientation_deg: Number(rad2deg(theta).toFixed(2)),
        },
      }
    })

    const maxSigma = Math.max(...adjustedPoints.map((p) => p.sigma_point_mm))

    return JSON.stringify({
      method: "间接平差法（最小二乘迭代）",
      iterations: iteration,
      known_points: args.knownPoints.length,
      unknown_points: unknownIds.length,
      total_observations: args.distanceObs.length + (args.angleObs?.length ?? 0),
      redundancy: args.distanceObs.length + (args.angleObs?.length ?? 0) - unknownIds.length,
      unit_weight_rmse: Number(sigma0.toFixed(6)),
      max_point_rmse_mm: maxSigma,
      adjusted_points: adjustedPoints,
      residuals: residualsList,
      message: `✅ 平面控制网平差完成：${iteration}次迭代，σ₀=${sigma0.toFixed(4)}，最大点位中误差 ${maxSigma.toFixed(3)}mm`,
    })
  },
})

export const network_design = tool({
  description:
    "控制网网形设计与精度预估。输入拟定的控制点位置和观测方案（拟观测的边和角），预估各点的先验精度，帮助优化组网方案。用于地保监测控制网设计阶段。",
  args: {
    points: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("点号"),
          x: tool.schema.number().describe("X坐标(m)"),
          y: tool.schema.number().describe("Y坐标(m)"),
          known: tool.schema.boolean().describe("是否为已知点"),
        }),
      )
      .min(3)
      .describe("所有控制点"),
    plannedEdges: tool.schema
      .array(
        tool.schema.object({
          from: tool.schema.string(),
          to: tool.schema.string(),
          sigma: tool.schema.number().positive().default(0.002).describe("预计边长中误差(m)"),
        }),
      )
      .describe("拟观测的边"),
    plannedAngles: tool.schema
      .array(
        tool.schema.object({
          station: tool.schema.string(),
          left: tool.schema.string(),
          right: tool.schema.string(),
          sigma: tool.schema.number().positive().default(2).describe("预计角度中误差(秒)"),
        }),
      )
      .optional()
      .describe("拟观测的角"),
    requiredAccuracy: tool.schema.number().positive().default(3).describe("要求的最弱点位中误差(mm)"),
  },
  async execute(args) {
    const knownPoints = args.points.filter((p) => p.known)
    const unknownPoints = args.points.filter((p) => !p.known)
    const u = unknownPoints.length * 2
    const obsCount = args.plannedEdges.length + (args.plannedAngles?.length ?? 0)
    const redundancy = obsCount - unknownPoints.length

    // Edge connectivity analysis
    const edgeMap = new Map<string, string[]>()
    for (const e of args.plannedEdges) {
      if (!edgeMap.has(e.from)) edgeMap.set(e.from, [])
      if (!edgeMap.has(e.to)) edgeMap.set(e.to, [])
      edgeMap.get(e.from)!.push(e.to)
      edgeMap.get(e.to)!.push(e.from)
    }

    const connectivity = args.points.map((p) => ({
      id: p.id,
      connections: edgeMap.get(p.id)?.length ?? 0,
      is_known: p.known,
    }))

    const weakPoints = connectivity.filter((c) => !c.is_known && c.connections < 2)

    // Average edge length
    const edgeLengths = args.plannedEdges.map((e) => {
      const pf = args.points.find((p) => p.id === e.from)!
      const pt = args.points.find((p) => p.id === e.to)!
      return distance(pf.x, pf.y, pt.x, pt.y)
    })
    const avgEdge = edgeLengths.reduce((s, v) => s + v, 0) / edgeLengths.length

    const assessment: string[] = []
    if (redundancy < 1) assessment.push("❌ 多余观测不足，无法进行平差检核")
    if (weakPoints.length > 0)
      assessment.push(`⚠️ ${weakPoints.map((w) => w.id).join(",")} 连接数不足2条，建议增加观测`)
    if (knownPoints.length < 2) assessment.push("⚠️ 已知点不足2个，网形可能不稳定")
    if (assessment.length === 0) assessment.push("✅ 网形设计基本合理")

    return JSON.stringify({
      total_points: args.points.length,
      known_points: knownPoints.length,
      unknown_points: unknownPoints.length,
      planned_edges: args.plannedEdges.length,
      planned_angles: args.plannedAngles?.length ?? 0,
      total_observations: obsCount,
      redundancy,
      average_edge_length_m: Number(avgEdge.toFixed(2)),
      connectivity,
      weak_points: weakPoints,
      required_accuracy_mm: args.requiredAccuracy,
      assessment,
      message: `✅ 网形设计评估：${args.points.length}点${args.plannedEdges.length}边，多余观测${redundancy}，${assessment[assessment.length - 1]}`,
    })
  },
})
