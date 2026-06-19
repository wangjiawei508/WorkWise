/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import path from "path"

export default tool({
  description:
    "处理自动化监测仪器（静力水准、全站仪机器人、测斜仪）的海量CSV/TXT数据文件。输入文件路径，返回清洗后的核心数据指标（本期变化量、累计变化量、速率、超限测点列表）。data_analyst 必须调用此工具，绝不直接读取原始文件。",
  args: {
    filePath: tool.schema.string().describe("用户上传的 CSV、TXT 或 Excel 文件的绝对路径"),
    sensorType: tool.schema
      .enum(["settlement", "inclinometer", "strain_gauge", "convergence", "gnss"])
      .describe(
        "传感器类型：settlement=沉降/静力水准, inclinometer=测斜仪, strain_gauge=应变计, convergence=收敛计, gnss=GNSS",
      ),
    alertThreshold: tool.schema
      .number()
      .positive()
      .optional()
      .describe("报警控制值（mm），用于自动标记超限测点，不传则不做超限判断"),
    periodDays: tool.schema.int().positive().default(7).describe("统计周期天数，默认7天（本期=最近N天）"),
  },
  async execute(args) {
    const file = Bun.file(args.filePath)
    const exists = await file.exists()

    if (!exists) return JSON.stringify({ error: `文件不存在：${args.filePath}，请检查路径是否正确。` })

    const ext = path.extname(args.filePath).toLowerCase()
    if (![".csv", ".txt", ".dat"].includes(ext))
      return JSON.stringify({
        error: `暂不支持 ${ext} 格式，请转换为 CSV/TXT/DAT 文件后重试。`,
      })

    const raw = await file.text()
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))

    if (lines.length < 2) return JSON.stringify({ error: "文件内容为空或仅有标题行，无有效数据。" })

    const header = lines[0]!.split(/[,\t;]/)
    const rows = lines.slice(1).map((l) => l.split(/[,\t;]/))

    const timeIdx = header.findIndex((h) => /time|date|时间|日期/i.test(h))
    const idIdx = header.findIndex((h) => /id|point|测点|编号/i.test(h))
    const valIdx = header.findIndex((h) => /value|val|读数|高差|沉降|位移|应变/i.test(h))

    if (valIdx === -1)
      return JSON.stringify({
        error: `无法识别数值列，请确认 CSV 列头包含 value/val/读数/沉降/位移 等关键字。识别到的列：${header.join(", ")}`,
      })

    const pointGroups: Record<string, number[]> = {}
    for (const row of rows) {
      const id = idIdx >= 0 ? (row[idIdx] ?? "unknown") : `P${rows.indexOf(row)}`
      const raw = parseFloat(row[valIdx] ?? "")
      if (isNaN(raw)) continue
      if (!pointGroups[id]) pointGroups[id] = []
      pointGroups[id]!.push(raw)
    }

    const totalPoints = Object.keys(pointGroups).length
    if (totalPoints === 0) return JSON.stringify({ error: "未能从文件中解析到有效的数值数据，请检查文件格式。" })

    const cutoff = args.periodDays
    const results = Object.entries(pointGroups).map(([id, vals]) => {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const deviations = vals.map((v) => Math.abs(v - mean))
      const mad = deviations.reduce((a, b) => a + b, 0) / deviations.length
      const threshold3sigma = 3 * (mad * 1.4826)
      const cleaned = vals.filter((v) => Math.abs(v - mean) <= threshold3sigma)

      const baseline = cleaned[0] ?? 0
      const current = cleaned[cleaned.length - 1] ?? 0
      const cumulative = current - baseline

      const recent = cleaned.slice(-cutoff)
      const periodChange = recent.length >= 2 ? recent[recent.length - 1]! - recent[0]! : 0
      const rate = recent.length >= 2 ? periodChange / cutoff : 0

      const removedCount = vals.length - cleaned.length

      const exceeded = args.alertThreshold ? Math.abs(cumulative) >= args.alertThreshold : false
      const ratioPct = args.alertThreshold
        ? Number(((Math.abs(cumulative) / args.alertThreshold) * 100).toFixed(1))
        : null

      return {
        point_id: id,
        total_readings: vals.length,
        removed_outliers: removedCount,
        cumulative_mm: Number(cumulative.toFixed(3)),
        period_change_mm: Number(periodChange.toFixed(3)),
        rate_mm_per_day: Number(rate.toFixed(4)),
        exceeded_threshold: exceeded,
        ratio_pct: ratioPct,
      }
    })

    const exceeded = results.filter((r) => r.exceeded_threshold)
    const maxCumulative = results.reduce((a, b) => (Math.abs(a.cumulative_mm) > Math.abs(b.cumulative_mm) ? a : b))

    return JSON.stringify({
      file: path.basename(args.filePath),
      sensor_type: args.sensorType,
      total_points: totalPoints,
      period_days: args.periodDays,
      alert_threshold_mm: args.alertThreshold ?? null,
      exceeded_count: exceeded.length,
      max_cumulative_point: maxCumulative.point_id,
      max_cumulative_mm: maxCumulative.cumulative_mm,
      exceeded_points: exceeded.map((r) => r.point_id),
      summary: results,
      data_quality_note: results.some((r) => r.removed_outliers > 0)
        ? `共剔除 ${results.reduce((s, r) => s + r.removed_outliers, 0)} 个异常跳变点（采用 MAD 3σ 方法）`
        : "原始数据质量良好，无异常值剔除",
    })
  },
})
