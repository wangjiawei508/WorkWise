/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import path from "path"

const FIELDS: Record<number, string> = {
  11: "point_id",
  21: "hz_angle_deg",
  22: "v_angle_deg",
  31: "slope_dist_m",
  32: "horiz_dist_m",
  33: "height_diff_m",
  81: "easting_m",
  82: "northing_m",
  83: "elevation_m",
  87: "reflector_height_m",
  88: "instrument_height_m",
}

const ANGLES = new Set([21, 22])
const METRIC = new Set([31, 32, 33, 81, 82, 83, 87, 88])

const PATTERNS: [RegExp, string][] = [
  [/^(point|id|name|pt|nr|编号|测点|点号)$/i, "point_id"],
  [/^(hz|h_angle|horizontal_angle|水平角|ha|hz_angle)$/i, "hz_angle_deg"],
  [/^(v_angle|vertical|zenith|天顶角|竖直角|va)$/i, "v_angle_deg"],
  [/^(slope|sd|slope_dist|斜距|slope_distance)$/i, "slope_dist_m"],
  [/^(hd|horiz_dist|horizontal_dist|平距|水平距)$/i, "horiz_dist_m"],
  [/^(dh|height_diff|高差)$/i, "height_diff_m"],
  [/^(east|easting|e_coord|东坐标)$/i, "easting_m"],
  [/^(north|northing|n_coord|北坐标)$/i, "northing_m"],
  [/^(elev|elevation|height|h_coord|高程|高度)$/i, "elevation_m"],
  [/^(rh|reflector|target_height|棱镜高|觇标高)$/i, "reflector_height_m"],
  [/^(ih|instrument_height|仪器高)$/i, "instrument_height_m"],
]

function dms(data: string, wide: boolean) {
  const deg = parseInt(data.slice(0, 3), 10)
  const min = parseInt(data.slice(3, 5), 10)
  const sec = wide
    ? parseInt(data.slice(5, 7), 10) + parseInt(data.slice(7), 10) / Math.pow(10, data.length - 7)
    : parseInt(data.slice(5, 7), 10) + parseInt(data.slice(7), 10) / 10
  return deg + min / 60 + sec / 3600
}

function word(raw: string, wide: boolean) {
  const clean = raw.replace(/^[*+]+/, "")
  const m = clean.match(/^(\d{2})([^+-]+)([+-])(.+)$/)
  if (!m) return null

  const wi = parseInt(m[1]!, 10)
  const name = FIELDS[wi]
  if (!name) return null

  if (wi === 11) return { name, value: m[4]!.replace(/^[0\s]+/, "") || "0" }

  const sign = m[3] === "-" ? -1 : 1
  if (ANGLES.has(wi)) return { name, value: Number((sign * dms(m[4]!, wide)).toFixed(6)) }
  if (METRIC.has(wi)) return { name, value: Number(((sign * parseInt(m[4]!, 10)) / (wide ? 10000 : 1000)).toFixed(4)) }
  return null
}

function gsi(content: string, wide: boolean) {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return null

  const starred = lines.some((l) => l.startsWith("*"))
  const groups = starred
    ? lines.reduce<string[][]>((acc, line) => {
        if (line.startsWith("*")) {
          acc.push([line])
          return acc
        }
        const last = acc[acc.length - 1]
        if (last) last.push(line)
        return acc
      }, [])
    : lines.map((l) => [l])

  const records = groups
    .map((group) =>
      group
        .flatMap((line) => line.split(/\s+/))
        .reduce<Record<string, string | number>>((obs, w) => {
          const parsed = word(w, wide)
          if (parsed) obs[parsed.name] = parsed.value
          return obs
        }, {}),
    )
    .filter((obs) => Object.keys(obs).length > 0)

  if (records.length === 0) return null
  return { format: wide ? "gsi-16" : "gsi-8", records }
}

function dat(content: string) {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("!"))
  if (lines.length < 2) return null

  const first = lines[0]!
  const delim = first.includes("\t") ? /\t+/ : first.includes(",") ? /,\s*/ : first.includes(";") ? /;\s*/ : /\s+/
  const cells = first.split(delim).map((c) => c.trim())
  if (!cells.some((c) => /[a-zA-Z\u4e00-\u9fff]/.test(c))) return null

  const mapping = cells.map((h) => PATTERNS.find(([re]) => re.test(h.trim()))?.[1] ?? null)
  if (!mapping.some(Boolean)) return null

  const records = lines
    .slice(1)
    .map((line) =>
      line
        .split(delim)
        .map((c) => c.trim())
        .reduce<Record<string, string | number>>((obs, val, i) => {
          const col = mapping[i]
          if (!col || !val) return obs
          if (col === "point_id") {
            obs[col] = val
            return obs
          }
          const num = parseFloat(val)
          if (!isNaN(num)) obs[col] = num
          return obs
        }, {}),
    )
    .filter((obs) => Object.keys(obs).length > 0)

  if (records.length === 0) return null
  return { format: "dat", records }
}

function detect(content: string) {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return null

  const probe = lines[0]!.replace(/^\*/, "").trim().split(/\s+/)[0] ?? ""
  const m = probe.match(/^(\d{2})([^+-]+)([+-])(.+)$/)
  if (m) return gsi(content, m[4]!.length > 8)
  return dat(content)
}

export default tool({
  description:
    "解析徕卡全站仪 GSI-8/GSI-16 格式及通用 DAT 文本格式的外业观测文件，将仪器原始数据转换为结构化 JSON，供平差计算和报告生成使用。",
  args: {
    filePath: tool.schema.string().describe("外业数据文件的绝对路径"),
    format: tool.schema
      .enum(["gsi-8", "gsi-16", "dat-auto"])
      .describe("文件格式：gsi-8=Leica GSI-8, gsi-16=Leica GSI-16, dat-auto=自动检测（优先尝试 GSI，其次 DAT 表格）"),
  },
  async execute(args) {
    const file = Bun.file(args.filePath)
    const exists = await file.exists()
    if (!exists) return JSON.stringify({ error: `文件不存在：${args.filePath}` })

    const raw = await file.text()
    if (raw.trim().length === 0) return JSON.stringify({ error: "文件内容为空" })

    const result = args.format === "gsi-8" ? gsi(raw, false) : args.format === "gsi-16" ? gsi(raw, true) : detect(raw)

    if (!result)
      return JSON.stringify({
        error: "无法识别文件格式，请确认为 GSI 或 DAT 表格格式，或手动指定 format 参数。",
      })

    return JSON.stringify({
      format: result.format,
      file: path.basename(args.filePath),
      total_records: result.records.length,
      records: result.records,
    })
  },
})
