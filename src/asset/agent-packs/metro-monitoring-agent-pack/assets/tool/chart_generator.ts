/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#e11d48",
  "#65a30d",
  "#c026d3",
  "#ea580c",
]

const W = 800
const H = 400
const PAD = { top: 50, right: 30, bottom: 60, left: 70 }

function xml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function group(data: Array<{ point_id: string; date: string; value: number }>) {
  return data.reduce((m, d) => {
    const arr = m.get(d.point_id) ?? []
    arr.push({ date: d.date, value: d.value })
    m.set(d.point_id, arr)
    return m
  }, new Map<string, Array<{ date: string; value: number }>>())
}

export default tool({
  description:
    "根据监测时序数据生成SVG趋势折线图，用于工程监测报告（日报/周报/月报）中的数据可视化。支持多测点系列、报警阈值线叠加。生成的SVG文件可直接在浏览器中查看或嵌入报告。",
  args: {
    data: tool.schema
      .array(
        tool.schema.object({
          point_id: tool.schema.string().describe("测点编号，如 JC-01"),
          date: tool.schema.string().describe("日期或序列标识，如 2024-01-15"),
          value: tool.schema.number().describe("监测值，单位mm"),
        }),
      )
      .min(1)
      .describe("监测时序数据数组"),
    title: tool.schema.string().optional().describe("图表标题，如：地表沉降监测趋势图"),
    alertThreshold: tool.schema.number().optional().describe("报警阈值(mm)，在图表上显示为红色水平虚线"),
    outputPath: tool.schema.string().optional().describe("SVG文件输出路径，默认为 ./chart_output.svg"),
  },
  async execute(args) {
    const series = group(args.data)
    const ids = [...series.keys()]

    series.forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)))

    const dates = [...new Set(args.data.map((d) => d.date))].sort()
    const raw =
      args.alertThreshold !== undefined
        ? [...args.data.map((d) => d.value), args.alertThreshold]
        : args.data.map((d) => d.value)

    const span = Math.max(Math.max(...raw) - Math.min(...raw), 0.1)
    const minY = Math.min(...raw) - span * 0.1
    const maxY = Math.max(...raw) + span * 0.1

    const cw = W - PAD.left - PAD.right
    const ch = H - PAD.top - PAD.bottom

    const sx = (i: number) => PAD.left + (i / Math.max(dates.length - 1, 1)) * cw
    const sy = (v: number) => PAD.top + ch - ((v - minY) / (maxY - minY)) * ch

    const ticks = 5
    const step = Math.max(1, Math.ceil(dates.length / 10))

    const svg: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      `<style>text{font-family:"Microsoft YaHei","PingFang SC",sans-serif}</style>`,
      `<rect width="${W}" height="${H}" fill="#fff"/>`,
    ]

    // title
    if (args.title) {
      svg.push(
        `<text x="${W / 2}" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#1f2937">${xml(args.title)}</text>`,
      )
    }

    // horizontal grid + Y labels
    Array.from({ length: ticks + 1 }, (_, i) => {
      const y = PAD.top + (i / ticks) * ch
      const v = maxY - (i / ticks) * (maxY - minY)
      svg.push(
        `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#e5e7eb"/>`,
        `<text x="${PAD.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7280">${v.toFixed(2)}</text>`,
      )
    })

    // vertical grid + X labels
    dates.forEach((d, i) => {
      if (i % step !== 0) return
      const x = sx(i)
      const label = d.length > 5 ? d.slice(5) : d
      svg.push(
        `<line x1="${x}" y1="${PAD.top}" x2="${x}" y2="${PAD.top + ch}" stroke="#e5e7eb"/>`,
        `<text x="${x}" y="${PAD.top + ch + 18}" text-anchor="end" font-size="10" fill="#6b7280" transform="rotate(-35 ${x} ${PAD.top + ch + 18})">${xml(label)}</text>`,
      )
    })

    // axes
    svg.push(
      `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + ch}" stroke="#374151" stroke-width="1.5"/>`,
      `<line x1="${PAD.left}" y1="${PAD.top + ch}" x2="${W - PAD.right}" y2="${PAD.top + ch}" stroke="#374151" stroke-width="1.5"/>`,
    )

    // Y-axis label
    svg.push(
      `<text x="18" y="${PAD.top + ch / 2}" text-anchor="middle" font-size="12" fill="#374151" transform="rotate(-90 18 ${PAD.top + ch / 2})">变化量 (mm)</text>`,
    )

    // alert threshold
    if (args.alertThreshold !== undefined) {
      const y = sy(args.alertThreshold)
      svg.push(
        `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="6,4"/>`,
        `<text x="${W - PAD.right - 4}" y="${y - 6}" text-anchor="end" font-size="10" fill="#ef4444" font-weight="bold">⚠ 报警值 ${args.alertThreshold}mm</text>`,
      )
    }

    // data lines + dots
    ids.forEach((id, idx) => {
      const color = PALETTE[idx % PALETTE.length]
      const pts = series.get(id)!
      const coords = pts.map((p) => `${sx(dates.indexOf(p.date))},${sy(p.value)}`).join(" ")

      svg.push(
        `<polyline points="${coords}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
      )

      pts.forEach((p) => {
        svg.push(
          `<circle cx="${sx(dates.indexOf(p.date))}" cy="${sy(p.value)}" r="3" fill="${color}" stroke="#fff" stroke-width="1"/>`,
        )
      })
    })

    // legend (top-right overlay)
    const lx = W - PAD.right - 10
    const ly = PAD.top + 10
    const lw = 100
    const lh = ids.length * 16 + 12

    svg.push(
      `<rect x="${lx - lw}" y="${ly - 8}" width="${lw + 10}" height="${lh}" rx="4" fill="#fff" fill-opacity="0.92" stroke="#e5e7eb"/>`,
    )

    ids.forEach((id, idx) => {
      const color = PALETTE[idx % PALETTE.length]
      const y = ly + idx * 16 + 4
      svg.push(
        `<line x1="${lx - lw + 8}" y1="${y}" x2="${lx - lw + 26}" y2="${y}" stroke="${color}" stroke-width="2"/>`,
        `<circle cx="${lx - lw + 17}" cy="${y}" r="2.5" fill="${color}"/>`,
        `<text x="${lx - lw + 32}" y="${y + 4}" font-size="10" fill="#374151">${xml(id)}</text>`,
      )
    })

    svg.push("</svg>")

    const out = svg.join("\n")
    const dest = args.outputPath ?? "chart_output.svg"

    await Bun.write(dest, out)

    return JSON.stringify({
      output_path: dest,
      width: W,
      height: H,
      point_count: args.data.length,
      series_count: ids.length,
      date_range: dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length - 1]}` : "",
      message: `✅ 趋势图已生成：${ids.length}条测点曲线，${args.data.length}个数据点，保存至 ${dest}`,
    })
  },
})
