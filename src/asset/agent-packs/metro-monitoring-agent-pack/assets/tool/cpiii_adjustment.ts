/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

type Matrix = number[][]

const mat = {
  zeros: (r: number, c: number): Matrix => Array.from({ length: r }, () => Array(c).fill(0) as number[]),

  transpose: (a: Matrix): Matrix => a[0]!.map((_, j) => a.map((row) => row[j]!)),

  mul: (a: Matrix, b: Matrix): Matrix =>
    a.map((row) => b[0]!.map((_, j) => row.reduce((sum, val, k) => sum + val * b[k]![j]!, 0))),

  mulVec: (a: Matrix, v: number[]): number[] => a.map((row) => row.reduce((sum, val, k) => sum + val * v[k]!, 0)),

  add: (a: Matrix, b: Matrix): Matrix => a.map((row, i) => row.map((v, j) => v + b[i]![j]!)),

  scale: (a: Matrix, s: number): Matrix => a.map((row) => row.map((v) => v * s)),

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

export const free_station_resection = tool({
  description:
    "自由测站后方交会计算。根据全站仪对多个已知CPIII点的观测（方向+距离），解算自由测站的坐标和方位角定向，并进行精度评定。CPIII测量中每个测站设站计算的基础工具。data_analyst 处理CPIII自由测站数据时必须调用此工具。",
  args: {
    stationId: tool.schema.string().describe("测站编号"),
    approximatePosition: tool.schema
      .object({
        x: tool.schema.number().describe("测站近似X坐标(m)"),
        y: tool.schema.number().describe("测站近似Y坐标(m)"),
        z: tool.schema.number().describe("测站近似高程(m)"),
      })
      .optional()
      .describe("测站近似坐标（不提供则自动计算初始值）"),
    instrumentHeight: tool.schema.number().positive().describe("仪器高(m)"),
    targets: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("CPIII目标点编号"),
          x: tool.schema.number().describe("已知X坐标(m)"),
          y: tool.schema.number().describe("已知Y坐标(m)"),
          z: tool.schema.number().describe("已知高程(m)"),
          prismHeight: tool.schema.number().describe("棱镜高(m)"),
          horizDirection: tool.schema.number().describe("水平方向观测值(度，十进制)"),
          vertAngle: tool.schema.number().describe("竖直角(度，天顶距)"),
          slopeDist: tool.schema.number().positive().describe("斜距(m)"),
        }),
      )
      .min(3)
      .describe("观测目标点（至少3个CPIII点）"),
    distanceSigma: tool.schema.number().positive().default(0.001).describe("测距先验中误差(m)，默认1mm"),
    directionSigma: tool.schema.number().positive().default(1).describe("方向先验中误差(秒)，默认1″"),
    maxIterations: tool.schema.number().int().positive().default(10).describe("最大迭代次数"),
  },
  async execute(args) {
    const rho = 206264.806
    const targets = args.targets

    // Compute horizontal distance and height difference from slope distance and vertical angle
    const processed = targets.map((t) => {
      const zenith = deg2rad(t.vertAngle)
      const hDist = t.slopeDist * Math.sin(zenith)
      const vDiff = t.slopeDist * Math.cos(zenith) + args.instrumentHeight - t.prismHeight
      return { ...t, hDist, heightToTarget: t.z + t.prismHeight }
    })

    // Initial approximation: centroid of intersection from first two targets
    let sx: number, sy: number, sz: number
    if (args.approximatePosition) {
      sx = args.approximatePosition.x
      sy = args.approximatePosition.y
      sz = args.approximatePosition.z
    } else {
      sx = targets.reduce((s, t) => s + t.x, 0) / targets.length
      sy = targets.reduce((s, t) => s + t.y, 0) / targets.length
      sz = targets.reduce((s, t) => s + t.z, 0) / targets.length
    }

    // Unknowns: [dx, dy, dz, dOrientation] (4 parameters)
    let orientation = 0
    const nObs = processed.length * 2 // direction + distance per target
    const nUnknowns = 4

    let sigma0 = 0
    let Qxx: Matrix | null = null

    for (let iter = 0; iter < args.maxIterations; iter++) {
      const A: number[][] = []
      const L: number[] = []
      const P: number[][] = mat.zeros(nObs, nObs)

      for (let i = 0; i < processed.length; i++) {
        const t = processed[i]!
        const dx = t.x - sx
        const dy = t.y - sy
        const dist0 = Math.sqrt(dx * dx + dy * dy)
        const az0 = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360

        // Direction observation equation
        let dirDiff = t.horizDirection + orientation - az0
        if (dirDiff > 180) dirDiff -= 360
        if (dirDiff < -180) dirDiff += 360
        const dirDiffRad = (dirDiff * Math.PI) / 180

        // A matrix row for direction: partial derivatives w.r.t. [sx, sy, sz, orientation]
        // dAz/dsx = dy / (dist^2), dAz/dsy = -dx / (dist^2), dAz/dsz = 0, dAz/dOri = 1
        const dirRow = [dy / (dist0 * dist0), -dx / (dist0 * dist0), 0, 1]
        A.push(dirRow)
        L.push(dirDiffRad)
        P[i * 2]![i * 2] = 1 / (args.directionSigma / rho) ** 2

        // Distance observation equation
        const distDiff = t.hDist - dist0
        // dDist/dsx = -dx/dist, dDist/dsy = -dy/dist, dDist/dsz = 0, dDist/dOri = 0
        const distRow = [-dx / dist0, -dy / dist0, 0, 0]
        A.push(distRow)
        L.push(distDiff)
        P[i * 2 + 1]![i * 2 + 1] = 1 / args.distanceSigma ** 2
      }

      const AT = mat.transpose(A)
      const ATP = mat.mul(AT, P)
      const N = mat.mul(ATP, A)
      const b = mat.mulVec(ATP, L)

      Qxx = mat.invert(N)
      if (!Qxx) return JSON.stringify({ error: "法方程奇异，检查观测数据和CPIII点分布。" })

      const X = mat.mulVec(Qxx, b)

      sx += X[0]!
      sy += X[1]!
      sz += X[2]!
      orientation += (X[3]! * 180) / Math.PI

      const V = mat.mulVec(A, X).map((v, i) => v - L[i]!)
      const VTPV = V.reduce((sum, v, i) => sum + v * P[i]![i]! * v, 0)
      const redundancy = nObs - nUnknowns
      sigma0 = redundancy > 0 ? Math.sqrt(VTPV / redundancy) : 0

      if (Math.abs(X[0]!) < 0.00001 && Math.abs(X[1]!) < 0.00001) break
    }

    // Height from vertical observations
    const heights = processed.map((t) => {
      const zenith = deg2rad(t.vertAngle)
      return t.z + t.prismHeight - (t.slopeDist * Math.cos(zenith) + args.instrumentHeight)
    })
    const avgHeight = heights.reduce((s, h) => s + h, 0) / heights.length
    const heightRmse = Math.sqrt(
      heights.reduce((s, h) => s + (h - avgHeight) ** 2, 0) / Math.max(heights.length - 1, 1),
    )

    const sigmaX = Qxx ? sigma0 * Math.sqrt(Math.abs(Qxx[0]![0]!)) : 0
    const sigmaY = Qxx ? sigma0 * Math.sqrt(Math.abs(Qxx[1]![1]!)) : 0
    const sigmaP = Math.sqrt(sigmaX * sigmaX + sigmaY * sigmaY)
    const sigmaOri = Qxx ? sigma0 * Math.sqrt(Math.abs(Qxx[3]![3]!)) * rho : 0

    // Target residuals
    const targetResiduals = processed.map((t) => {
      const dx = t.x - sx
      const dy = t.y - sy
      const dist0 = Math.sqrt(dx * dx + dy * dy)
      const az0 = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
      let dirRes = t.horizDirection + orientation - az0
      if (dirRes > 180) dirRes -= 360
      if (dirRes < -180) dirRes += 360
      return {
        id: t.id,
        direction_residual_arcsec: Number((dirRes * 3600).toFixed(2)),
        distance_residual_mm: Number(((t.hDist - dist0) * 1000).toFixed(2)),
      }
    })

    orientation = ((orientation % 360) + 360) % 360

    return JSON.stringify({
      station_id: args.stationId,
      position: {
        x: Number(sx.toFixed(4)),
        y: Number(sy.toFixed(4)),
        z: Number(avgHeight.toFixed(4)),
      },
      orientation_deg: Number(orientation.toFixed(6)),
      instrument_height_m: args.instrumentHeight,
      precision: {
        sigma_x_mm: Number((sigmaX * 1000).toFixed(3)),
        sigma_y_mm: Number((sigmaY * 1000).toFixed(3)),
        sigma_point_mm: Number((sigmaP * 1000).toFixed(3)),
        sigma_height_mm: Number((heightRmse * 1000).toFixed(3)),
        sigma_orientation_arcsec: Number(sigmaOri.toFixed(2)),
        unit_weight_rmse: Number(sigma0.toFixed(6)),
      },
      target_count: targets.length,
      target_residuals: targetResiduals,
      message: `✅ ${args.stationId} 自由测站解算：(${sx.toFixed(4)}, ${sy.toFixed(4)}, ${avgHeight.toFixed(4)})，点位σ=${(sigmaP * 1000).toFixed(3)}mm，定向σ=${sigmaOri.toFixed(2)}″`,
    })
  },
})

export const cpiii_network_adjustment = tool({
  description:
    "CPIII轨道控制网平差计算。根据多个自由测站的解算结果和CPIII点的约束条件，进行整网平差，输出所有CPIII点的最终坐标和精度。用于轨道铺设前的CPIII网复测和精度评估。data_analyst 处理CPIII整网数据时必须调用此工具。",
  args: {
    knownPoints: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("点号"),
          x: tool.schema.number().describe("X坐标(m)"),
          y: tool.schema.number().describe("Y坐标(m)"),
          z: tool.schema.number().describe("高程(m)"),
        }),
      )
      .min(2)
      .describe("约束点（高等级控制点，如CPII或线路控制点）"),
    cpiii_points: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("CPIII点号"),
          x0: tool.schema.number().describe("近似X坐标(m)"),
          y0: tool.schema.number().describe("近似Y坐标(m)"),
          z0: tool.schema.number().describe("近似高程(m)"),
        }),
      )
      .min(4)
      .describe("待求CPIII点及近似坐标"),
    distanceObs: tool.schema
      .array(
        tool.schema.object({
          from: tool.schema.string().describe("起点（测站或CPIII点）"),
          to: tool.schema.string().describe("终点（CPIII点）"),
          distance: tool.schema.number().positive().describe("观测边长(m)"),
          sigma: tool.schema.number().positive().default(0.001).describe("中误差(m)"),
        }),
      )
      .describe("边长观测值"),
    directionObs: tool.schema
      .array(
        tool.schema.object({
          station: tool.schema.string().describe("测站"),
          target: tool.schema.string().describe("目标"),
          direction: tool.schema.number().describe("方向值(度)"),
          sigma: tool.schema.number().positive().default(1).describe("中误差(秒)"),
        }),
      )
      .optional()
      .describe("方向观测值"),
    heightObs: tool.schema
      .array(
        tool.schema.object({
          from: tool.schema.string(),
          to: tool.schema.string(),
          heightDiff: tool.schema.number().describe("高差(m)"),
          sigma: tool.schema.number().positive().default(0.0005).describe("中误差(m)"),
        }),
      )
      .optional()
      .describe("高差观测值"),
    requiredAccuracy: tool.schema
      .object({
        plane_mm: tool.schema.number().positive().default(1).describe("平面精度要求(mm)，CPIII规范通常1mm"),
        height_mm: tool.schema.number().positive().default(1).describe("高程精度要求(mm)，CPIII规范通常1mm"),
      })
      .optional()
      .describe("精度指标"),
  },
  async execute(args) {
    const accuracy = args.requiredAccuracy ?? { plane_mm: 1, height_mm: 1 }
    const coordMap = new Map<string, { x: number; y: number; z: number; known: boolean }>()
    for (const p of args.knownPoints) coordMap.set(p.id, { x: p.x, y: p.y, z: p.z, known: true })
    for (const p of args.cpiii_points) coordMap.set(p.id, { x: p.x0, y: p.y0, z: p.z0, known: false })

    const unknownIds = args.cpiii_points.map((p) => p.id)
    const u = unknownIds.length * 2

    // Plane adjustment (same algorithm as control_network but tailored for CPIII)
    const maxIter = 10
    let sigma0 = 0
    let Qxx: Matrix | null = null

    for (let iter = 0; iter < maxIter; iter++) {
      const rows: Array<{ Arow: number[]; l: number; weight: number }> = []

      for (const obs of args.distanceObs) {
        const pF = coordMap.get(obs.from)
        const pT = coordMap.get(obs.to)
        if (!pF || !pT) continue

        const dx = pT.x - pF.x
        const dy = pT.y - pF.y
        const s0 = Math.sqrt(dx * dx + dy * dy)
        if (s0 < 0.001) continue

        const Arow = new Array(u).fill(0)
        const fIdx = unknownIds.indexOf(obs.from)
        const tIdx = unknownIds.indexOf(obs.to)

        if (fIdx >= 0) {
          Arow[fIdx * 2] = -dx / s0
          Arow[fIdx * 2 + 1] = -dy / s0
        }
        if (tIdx >= 0) {
          Arow[tIdx * 2] = dx / s0
          Arow[tIdx * 2 + 1] = dy / s0
        }

        rows.push({ Arow, l: obs.distance - s0, weight: 1 / obs.sigma ** 2 })
      }

      const n = rows.length
      if (n < u / 2) return JSON.stringify({ error: `观测数不足，需至少 ${Math.ceil(u / 2)} 个。` })

      const A = rows.map((r) => r.Arow)
      const P = mat.zeros(n, n)
      rows.forEach((r, i) => {
        P[i]![i] = r.weight
      })
      const L = rows.map((r) => r.l)

      const AT = mat.transpose(A)
      const N = mat.mul(mat.mul(AT, P), A)
      const b = mat.mulVec(mat.mul(AT, P), L)

      Qxx = mat.invert(N)
      if (!Qxx) return JSON.stringify({ error: "法方程奇异。" })

      const X = mat.mulVec(Qxx, b)

      let maxCorr = 0
      for (let i = 0; i < unknownIds.length; i++) {
        const p = coordMap.get(unknownIds[i]!)!
        p.x += X[i * 2]!
        p.y += X[i * 2 + 1]!
        maxCorr = Math.max(maxCorr, Math.abs(X[i * 2]!), Math.abs(X[i * 2 + 1]!))
      }

      const V = mat.mulVec(A, X).map((v, i) => v - L[i]!)
      const VTPV = V.reduce((sum, v, i) => sum + v * P[i]![i]! * v, 0)
      sigma0 = n - u / 2 > 0 ? Math.sqrt(VTPV / (n - u / 2)) : 0

      if (maxCorr < 0.00001) break
    }

    // Height adjustment (simple leveling if height observations provided)
    if (args.heightObs && args.heightObs.length > 0) {
      const hKnown = new Map(args.knownPoints.map((p) => [p.id, p.z]))
      const hUnknown = unknownIds.filter((id) => !hKnown.has(id))
      const hU = hUnknown.length

      if (args.heightObs.length >= hU) {
        const A = mat.zeros(args.heightObs.length, hU)
        const P = mat.zeros(args.heightObs.length, args.heightObs.length)
        const L: number[] = []

        args.heightObs.forEach((obs, i) => {
          const fIdx = hUnknown.indexOf(obs.from)
          const tIdx = hUnknown.indexOf(obs.to)
          if (fIdx >= 0) A[i]![fIdx] = -1
          if (tIdx >= 0) A[i]![tIdx] = 1
          P[i]![i] = 1 / obs.sigma ** 2

          const fH = hKnown.get(obs.from) ?? coordMap.get(obs.from)?.z ?? 0
          const tH = hKnown.get(obs.to) ?? coordMap.get(obs.to)?.z ?? 0
          L.push(obs.heightDiff - (tH - fH))
        })

        const AT = mat.transpose(A)
        const N = mat.mul(mat.mul(AT, P), A)
        const QH = mat.invert(N)
        if (QH) {
          const X = mat.mulVec(QH, mat.mulVec(mat.mul(AT, P), L))
          hUnknown.forEach((id, i) => {
            const p = coordMap.get(id)!
            p.z += X[i]!
          })
        }
      }
    }

    // Results
    const results = unknownIds.map((id, i) => {
      const p = coordMap.get(id)!
      const qx = Qxx ? Math.abs(Qxx[i * 2]![i * 2]!) : 0
      const qy = Qxx ? Math.abs(Qxx[i * 2 + 1]![i * 2 + 1]!) : 0
      const sigmaX = sigma0 * Math.sqrt(qx) * 1000
      const sigmaY = sigma0 * Math.sqrt(qy) * 1000
      const sigmaP = Math.sqrt(sigmaX ** 2 + sigmaY ** 2)

      return {
        id,
        x: Number(p.x.toFixed(4)),
        y: Number(p.y.toFixed(4)),
        z: Number(p.z.toFixed(4)),
        sigma_x_mm: Number(sigmaX.toFixed(3)),
        sigma_y_mm: Number(sigmaY.toFixed(3)),
        sigma_point_mm: Number(sigmaP.toFixed(3)),
        plane_pass: sigmaP <= accuracy.plane_mm,
      }
    })

    const maxSigma = Math.max(...results.map((r) => r.sigma_point_mm))
    const passCount = results.filter((r) => r.plane_pass).length

    return JSON.stringify({
      method: "CPIII轨道控制网整网平差",
      constraint_points: args.knownPoints.length,
      cpiii_points: unknownIds.length,
      total_distance_obs: args.distanceObs.length,
      total_height_obs: args.heightObs?.length ?? 0,
      unit_weight_rmse: Number(sigma0.toFixed(6)),
      max_point_rmse_mm: maxSigma,
      accuracy_requirement: accuracy,
      pass_rate: `${passCount}/${results.length}`,
      all_pass: passCount === results.length,
      adjusted_points: results,
      assessment:
        passCount === results.length
          ? `✅ CPIII网平差合格：所有点位中误差 ≤ ${accuracy.plane_mm}mm，最大 ${maxSigma.toFixed(3)}mm`
          : `⚠️ ${results.length - passCount}个CPIII点精度不满足 ${accuracy.plane_mm}mm 要求，最大 ${maxSigma.toFixed(3)}mm，建议补测`,
      message: `✅ CPIII平差完成：${unknownIds.length}点，σ₀=${sigma0.toFixed(4)}，最大点位σ=${maxSigma.toFixed(3)}mm，合格率 ${passCount}/${results.length}`,
    })
  },
})
