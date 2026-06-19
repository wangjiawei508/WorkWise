/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

// ============================================================
// Stakeout / layout calculation tools
// ============================================================

const deg2rad = (d: number) => (d * Math.PI) / 180
const rad2deg = (r: number) => (r * 180) / Math.PI

function normalizeAz(az: number): number {
  return ((az % 360) + 360) % 360
}

// ============================================================
// Tool: Polar stakeout (compute angle & distance from station)
// ============================================================

export const polar_stakeout = tool({
  description:
    "极坐标放样计算：根据设站点坐标、后视方向和待放样点坐标，计算放样所需的水平角（转角）和水平距离。这是全站仪放样作业的核心计算，data_analyst 在准备放样数据时必须调用此工具。",
  args: {
    station: tool.schema
      .object({
        id: tool.schema.string().describe("设站点编号"),
        x: tool.schema.number().describe("设站点X坐标（东方向/m）"),
        y: tool.schema.number().describe("设站点Y坐标（北方向/m）"),
      })
      .describe("全站仪架设点"),
    backsight: tool.schema
      .object({
        id: tool.schema.string().describe("后视点编号"),
        x: tool.schema.number().describe("后视点X坐标"),
        y: tool.schema.number().describe("后视点Y坐标"),
      })
      .describe("后视方向已知点"),
    targets: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("待放样点编号"),
          x: tool.schema.number().describe("设计X坐标"),
          y: tool.schema.number().describe("设计Y坐标"),
          designElevation: tool.schema.number().optional().describe("设计高程(m)，若提供则输出高差"),
        }),
      )
      .min(1)
      .describe("待放样目标点列表"),
    stationElevation: tool.schema.number().optional().describe("设站点高程(m)"),
    instrumentHeight: tool.schema.number().default(0).describe("仪器高(m)"),
  },
  async execute(args) {
    // Azimuth from station to backsight
    const dxBack = args.backsight.x - args.station.x
    const dyBack = args.backsight.y - args.station.y
    const azBack = normalizeAz(rad2deg(Math.atan2(dxBack, dyBack)))

    const results = args.targets.map((t) => {
      const dx = t.x - args.station.x
      const dy = t.y - args.station.y
      const azTarget = normalizeAz(rad2deg(Math.atan2(dx, dy)))
      const horizAngle = normalizeAz(azTarget - azBack)
      const horizDist = Math.sqrt(dx * dx + dy * dy)

      // Convert angle to DMS
      const aDeg = Math.floor(horizAngle)
      const aMinFull = (horizAngle - aDeg) * 60
      const aMin = Math.floor(aMinFull)
      const aSec = (aMinFull - aMin) * 60

      const result: Record<string, unknown> = {
        point_id: t.id,
        design_x: t.x,
        design_y: t.y,
        azimuth_to_target_deg: Number(azTarget.toFixed(6)),
        horizontal_angle_deg: Number(horizAngle.toFixed(6)),
        horizontal_angle_dms: `${aDeg}°${aMin}′${aSec.toFixed(1)}″`,
        horizontal_distance_m: Number(horizDist.toFixed(4)),
      }

      if (t.designElevation !== undefined && args.stationElevation !== undefined) {
        const heightDiff = t.designElevation - args.stationElevation - args.instrumentHeight
        result.height_to_set_m = Number(heightDiff.toFixed(4))
      }

      return result
    })

    return JSON.stringify({
      station: { id: args.station.id, x: args.station.x, y: args.station.y },
      backsight: { id: args.backsight.id, azimuth_deg: Number(azBack.toFixed(6)) },
      stakeout_data: results,
      point_count: results.length,
      message: `✅ 极坐标放样数据已生成：设站 ${args.station.id}，后视 ${args.backsight.id}，共 ${results.length} 个放样点`,
    })
  },
})

// ============================================================
// Tool: Chainage/offset from alignment
// ============================================================

export const chainage_offset = tool({
  description:
    "里程桩号与偏距计算：根据线路中线点坐标串和目标点坐标，计算目标点在线路上的投影里程桩号和横向偏距。城市轨道监测中用于确定监测点相对线路的位置关系。",
  args: {
    alignment: tool.schema
      .array(
        tool.schema.object({
          chainage: tool.schema.number().describe("该中线点的里程桩号(m)"),
          x: tool.schema.number().describe("X坐标"),
          y: tool.schema.number().describe("Y坐标"),
        }),
      )
      .min(2)
      .describe("线路中线坐标串（按里程递增顺序排列，至少2个点）"),
    targets: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("目标点编号"),
          x: tool.schema.number().describe("X坐标"),
          y: tool.schema.number().describe("Y坐标"),
        }),
      )
      .min(1)
      .describe("待计算的目标点列表"),
  },
  async execute(args) {
    const align = args.alignment

    const results = args.targets.map((t) => {
      let bestDist = Infinity
      let bestChainage = align[0]!.chainage
      let bestOffset = 0
      let bestSide = "左" as string

      for (let i = 0; i < align.length - 1; i++) {
        const p1 = align[i]!
        const p2 = align[i + 1]!

        // Segment vector
        const sx = p2.x - p1.x
        const sy = p2.y - p1.y
        const segLen = Math.sqrt(sx * sx + sy * sy)
        if (segLen < 1e-10) continue

        // Project target onto segment
        const tx = t.x - p1.x
        const ty = t.y - p1.y
        const proj = (tx * sx + ty * sy) / (segLen * segLen)
        const clamped = Math.max(0, Math.min(1, proj))

        const px = p1.x + clamped * sx
        const py = p1.y + clamped * sy
        const dist = Math.sqrt((t.x - px) * (t.x - px) + (t.y - py) * (t.y - py))

        if (dist < bestDist) {
          bestDist = dist
          bestChainage = p1.chainage + clamped * (p2.chainage - p1.chainage)
          bestOffset = dist

          // Determine side (cross product: positive = left of alignment direction)
          const cross = sx * ty - sy * tx
          bestSide = cross >= 0 ? "左" : "右"
        }
      }

      // Format chainage as K0+000.000
      const km = Math.floor(bestChainage / 1000)
      const remainder = bestChainage % 1000

      return {
        point_id: t.id,
        chainage_m: Number(bestChainage.toFixed(3)),
        chainage_formatted: `K${km}+${remainder.toFixed(3).padStart(7, "0")}`,
        offset_m: Number(bestOffset.toFixed(4)),
        side: bestSide,
        message: `${t.id}: K${km}+${remainder.toFixed(3).padStart(7, "0")}，偏距 ${bestOffset.toFixed(4)}m（${bestSide}侧）`,
      }
    })

    return JSON.stringify({
      alignment_points: align.length,
      chainage_range: `K${Math.floor(align[0]!.chainage / 1000)}+${(align[0]!.chainage % 1000).toFixed(3)} ~ K${Math.floor(align[align.length - 1]!.chainage / 1000)}+${(align[align.length - 1]!.chainage % 1000).toFixed(3)}`,
      results,
      point_count: results.length,
      message: `✅ 里程偏距计算完成，共 ${results.length} 个点`,
    })
  },
})

// ============================================================
// Tool: Batch stakeout point generation
// ============================================================

export const batch_stakeout_points = tool({
  description:
    "批量放样点生成：根据线路中线坐标串，按指定间距在中线上内插放样点坐标并可偏移生成边线放样点。适用于管线放样、基坑围护桩放样等场景。",
  args: {
    alignment: tool.schema
      .array(
        tool.schema.object({
          chainage: tool.schema.number().describe("里程桩号(m)"),
          x: tool.schema.number().describe("X坐标"),
          y: tool.schema.number().describe("Y坐标"),
        }),
      )
      .min(2)
      .describe("线路中线坐标串"),
    interval: tool.schema.number().positive().describe("放样间距(m)"),
    startChainage: tool.schema.number().optional().describe("起始里程(m)，默认从中线首点开始"),
    endChainage: tool.schema.number().optional().describe("终止里程(m)，默认到中线末点"),
    offsets: tool.schema
      .array(tool.schema.number())
      .optional()
      .describe("横向偏移距离列表(m)，正值为线路左侧，负值为右侧。如 [5, -5] 生成左右各5m的边线点"),
    prefix: tool.schema.string().default("P").describe("点号前缀"),
  },
  async execute(args) {
    const align = args.alignment
    const startCh = args.startChainage ?? align[0]!.chainage
    const endCh = args.endChainage ?? align[align.length - 1]!.chainage

    // Interpolate point on alignment at given chainage
    function interpolate(chainage: number): { x: number; y: number; azimuth: number } | null {
      for (let i = 0; i < align.length - 1; i++) {
        const p1 = align[i]!
        const p2 = align[i + 1]!
        if (chainage >= p1.chainage && chainage <= p2.chainage) {
          const ratio = (chainage - p1.chainage) / (p2.chainage - p1.chainage)
          const x = p1.x + ratio * (p2.x - p1.x)
          const y = p1.y + ratio * (p2.y - p1.y)
          const azimuth = Math.atan2(p2.x - p1.x, p2.y - p1.y)
          return { x, y, azimuth }
        }
      }
      return null
    }

    const points: Array<{
      id: string
      chainage: number
      chainage_formatted: string
      offset_m: number
      x: number
      y: number
    }> = []

    let idx = 0
    for (let ch = startCh; ch <= endCh + 0.001; ch += args.interval) {
      const pt = interpolate(ch)
      if (!pt) continue
      idx++

      const km = Math.floor(ch / 1000)
      const rem = ch % 1000
      const chFmt = `K${km}+${rem.toFixed(3).padStart(7, "0")}`

      // Center line point
      points.push({
        id: `${args.prefix}${idx}`,
        chainage: Number(ch.toFixed(3)),
        chainage_formatted: chFmt,
        offset_m: 0,
        x: Number(pt.x.toFixed(4)),
        y: Number(pt.y.toFixed(4)),
      })

      // Offset points
      if (args.offsets) {
        for (const offset of args.offsets) {
          // Perpendicular direction: rotate azimuth by +90° for left, -90° for right
          const perpAz = pt.azimuth + (offset >= 0 ? Math.PI / 2 : -Math.PI / 2)
          const absOffset = Math.abs(offset)
          const ox = pt.x + absOffset * Math.sin(perpAz)
          const oy = pt.y + absOffset * Math.cos(perpAz)
          const side = offset >= 0 ? "L" : "R"

          points.push({
            id: `${args.prefix}${idx}-${side}${absOffset}`,
            chainage: Number(ch.toFixed(3)),
            chainage_formatted: chFmt,
            offset_m: offset,
            x: Number(ox.toFixed(4)),
            y: Number(oy.toFixed(4)),
          })
        }
      }
    }

    return JSON.stringify({
      interval_m: args.interval,
      chainage_range: `${startCh} ~ ${endCh}`,
      offsets: args.offsets ?? [0],
      total_points: points.length,
      points,
      message: `✅ 批量放样点生成完成：间距 ${args.interval}m，共 ${points.length} 个点`,
    })
  },
})
