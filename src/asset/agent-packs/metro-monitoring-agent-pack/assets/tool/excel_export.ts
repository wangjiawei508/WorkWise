/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { deflateRawSync } from "node:zlib"

// XLSX = ZIP of XML files (Office Open XML SpreadsheetML)
// Reuse the minimal ZIP builder from report_export.ts

function crc32(buf: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
  }
  return (c ^ 0xffffffff) >>> 0
}

function zip(files: Array<{ name: string; data: Uint8Array }>) {
  const entries: Array<{
    name: Uint8Array
    compressed: Uint8Array
    crc: number
    size: number
    csize: number
    offset: number
  }> = []
  const parts: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const nameBytes = new TextEncoder().encode(f.name)
    const crc = crc32(f.data)
    const compressed = new Uint8Array(deflateRawSync(f.data))
    const header = new Uint8Array(30 + nameBytes.length)
    const v = new DataView(header.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true)
    v.setUint16(8, 8, true)
    v.setUint32(14, crc, true)
    v.setUint32(18, compressed.length, true)
    v.setUint32(22, f.data.length, true)
    v.setUint16(26, nameBytes.length, true)
    header.set(nameBytes, 30)

    entries.push({ name: nameBytes, compressed, crc, size: f.data.length, csize: compressed.length, offset })
    parts.push(header, compressed)
    offset += header.length + compressed.length
  }

  const cdStart = offset
  for (const e of entries) {
    const cd = new Uint8Array(46 + e.name.length)
    const v = new DataView(cd.buffer)
    v.setUint32(0, 0x02014b50, true)
    v.setUint16(4, 20, true)
    v.setUint16(6, 20, true)
    v.setUint16(10, 8, true)
    v.setUint32(16, e.crc, true)
    v.setUint32(20, e.csize, true)
    v.setUint32(24, e.size, true)
    v.setUint16(28, e.name.length, true)
    v.setUint32(42, e.offset, true)
    cd.set(e.name, 46)
    parts.push(cd)
    offset += cd.length
  }

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, offset - cdStart, true)
  ev.setUint32(16, cdStart, true)
  parts.push(eocd)

  let total = 0
  for (const p of parts) total += p.length
  const result = new Uint8Array(total)
  let pos = 0
  for (const p of parts) {
    result.set(p, pos)
    pos += p.length
  }
  return result
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Excel column letter: 0->A, 1->B, ..., 25->Z, 26->AA
function colLetter(idx: number): string {
  let s = ""
  let n = idx
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

type CellValue = string | number | boolean | null | undefined
type SheetData = {
  name: string
  headers: string[]
  rows: CellValue[][]
  columnWidths?: number[]
  freezeRow?: number
}

function buildSharedStrings(sheets: SheetData[]): { xml: string; lookup: Map<string, number> } {
  const lookup = new Map<string, number>()
  let idx = 0

  for (const sheet of sheets) {
    for (const h of sheet.headers) {
      if (!lookup.has(h)) lookup.set(h, idx++)
    }
    for (const row of sheet.rows) {
      for (const cell of row) {
        if (typeof cell === "string" && !lookup.has(cell)) lookup.set(cell, idx++)
      }
    }
  }

  const items = Array.from(lookup.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([s]) => `<si><t>${esc(s)}</t></si>`)
    .join("")

  return {
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${lookup.size}" uniqueCount="${lookup.size}">${items}</sst>`,
    lookup,
  }
}

function buildSheet(sheet: SheetData, strings: Map<string, number>): string {
  const cols = sheet.headers.length
  const lastCol = colLetter(cols - 1)
  const lastRow = sheet.rows.length + 1

  // Column widths
  let colsXml = ""
  if (sheet.columnWidths && sheet.columnWidths.length > 0) {
    const colDefs = sheet.columnWidths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join("")
    colsXml = `<cols>${colDefs}</cols>`
  }

  // Header row
  const headerCells = sheet.headers
    .map((h, c) => {
      const ref = `${colLetter(c)}1`
      const si = strings.get(h) ?? 0
      return `<c r="${ref}" t="s" s="1"><v>${si}</v></c>`
    })
    .join("")
  const headerRow = `<row r="1">${headerCells}</row>`

  // Data rows
  const dataRows = sheet.rows
    .map((row, ri) => {
      const r = ri + 2
      const cells = row
        .map((cell, ci) => {
          const ref = `${colLetter(ci)}${r}`
          if (cell === null || cell === undefined) return `<c r="${ref}"/>`
          if (typeof cell === "number") return `<c r="${ref}" s="2"><v>${cell}</v></c>`
          if (typeof cell === "boolean") return `<c r="${ref}"><v>${cell ? 1 : 0}</v></c>`
          const si = strings.get(cell) ?? 0
          return `<c r="${ref}" t="s"><v>${si}</v></c>`
        })
        .join("")
      return `<row r="${r}">${cells}</row>`
    })
    .join("\n")

  // Freeze pane (freeze header row by default)
  const freezeRow = sheet.freezeRow ?? 1
  const pane =
    freezeRow > 0
      ? `<pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/>`
      : ""

  // AutoFilter on header row
  const autoFilter = `<autoFilter ref="A1:${lastCol}${lastRow}"/>`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${colsXml}
  <sheetViews><sheetView tabSelected="1" workbookViewId="0">${pane}</sheetView></sheetViews>
  <sheetData>
${headerRow}
${dataRows}
  </sheetData>
  ${autoFilter}
</worksheet>`
}

function buildStyles(): string {
  // s="0" = default, s="1" = header (bold, light blue bg), s="2" = number (2 decimals)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="0.000"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><name val="等线"/></font>
    <font><b/><sz val="11"/><name val="等线"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border/>
    <border>
      <left style="thin"><color auto="1"/></left>
      <right style="thin"><color auto="1"/></right>
      <top style="thin"><color auto="1"/></top>
      <bottom style="thin"><color auto="1"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`
}

function buildXlsx(sheets: SheetData[]): Uint8Array {
  const { xml: sst, lookup } = buildSharedStrings(sheets)

  const sheetXmls = sheets.map((s) => buildSheet(s, lookup))

  const sheetRefs = sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetRefs}</sheets>
</workbook>`

  const sheetRelEntries = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelEntries}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("\n  ")

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetOverrides}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`

  const enc = (s: string) => new TextEncoder().encode(s)

  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rels) },
    { name: "xl/workbook.xml", data: enc(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(wbRels) },
    { name: "xl/styles.xml", data: enc(buildStyles()) },
    { name: "xl/sharedStrings.xml", data: enc(sst) },
  ]

  for (let i = 0; i < sheetXmls.length; i++) {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXmls[i]!) })
  }

  return zip(files)
}

export const excel_export = tool({
  description:
    "将监测数据导出为 .xlsx（Excel）文件。支持多 Sheet、表头冻结、自动筛选、数值格式化。用于导出基坑监测日报/周报数据表、变形汇总表、轴力统计表等。data_analyst 或 technical_writer 需要输出 Excel 报表时必须调用此工具。",
  args: {
    sheets: tool.schema
      .array(
        tool.schema.object({
          name: tool.schema.string().describe("Sheet 名称，如 '沉降监测' '深层位移' '轴力统计'"),
          headers: tool.schema.array(tool.schema.string()).min(1).describe("列标题"),
          rows: tool.schema
            .array(
              tool.schema.array(
                tool.schema.union([
                  tool.schema.string(),
                  tool.schema.number(),
                  tool.schema.boolean(),
                  tool.schema.null(),
                ]),
              ),
            )
            .describe("数据行，每行元素数量与 headers 一致"),
          columnWidths: tool.schema
            .array(tool.schema.number().positive())
            .optional()
            .describe("各列宽度（字符数），不传则自动计算"),
          freezeRow: tool.schema.number().int().default(1).describe("冻结前N行，默认1（冻结表头）"),
        }),
      )
      .min(1)
      .describe("工作表列表，支持多个 Sheet"),
    title: tool.schema.string().default("监测数据").describe("文件名（不含扩展名）"),
    outputPath: tool.schema.string().optional().describe("输出路径，默认 ./[title].xlsx"),
  },
  async execute(args) {
    const sheetsData: SheetData[] = args.sheets.map((s) => {
      const widths =
        s.columnWidths ??
        s.headers.map((h, i) => {
          const headerLen = [...h].length + 4
          const maxDataLen = s.rows.reduce((max, row) => {
            const cell = row[i]
            const len = cell === null || cell === undefined ? 0 : String(cell).length
            return Math.max(max, len)
          }, 0)
          return Math.min(Math.max(headerLen, maxDataLen + 2), 50)
        })

      return {
        name: s.name,
        headers: s.headers,
        rows: s.rows,
        columnWidths: widths,
        freezeRow: s.freezeRow,
      }
    })

    const xlsxBytes = buildXlsx(sheetsData)
    const dest = args.outputPath ?? `./${args.title.replace(/[/\\:*?"<>|]/g, "_")}.xlsx`
    await Bun.write(dest, xlsxBytes)

    const totalRows = args.sheets.reduce((s, sh) => s + sh.rows.length, 0)
    const totalCols = args.sheets.reduce((s, sh) => s + sh.headers.length, 0)

    return JSON.stringify({
      output_path: dest,
      file_size_kb: Number((xlsxBytes.length / 1024).toFixed(1)),
      format: "xlsx (Office Open XML SpreadsheetML)",
      sheets: args.sheets.map((s) => ({
        name: s.name,
        columns: s.headers.length,
        rows: s.rows.length,
      })),
      total_rows: totalRows,
      total_columns: totalCols,
      message: `✅ Excel 报表已导出：${dest}（${(xlsxBytes.length / 1024).toFixed(1)} KB），${args.sheets.length}个工作表，共 ${totalRows} 行数据`,
    })
  },
})

export const monitoring_table_export = tool({
  description:
    "快速导出标准格式的监测数据汇总表。直接输入测点数据，自动生成带预警标识的规范化 Excel 报表。适用于沉降、位移、轴力、水位等各类监测项目的数据报表导出。",
  args: {
    projectName: tool.schema.string().describe("项目名称"),
    monitoringType: tool.schema
      .enum(["settlement", "displacement", "axial_force", "water_level", "inclinometer", "convergence"])
      .describe("监测类型"),
    date: tool.schema.string().describe("报表日期 YYYY-MM-DD"),
    points: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("测点编号"),
          section: tool.schema.string().optional().describe("所属断面"),
          initialValue: tool.schema.number().optional().describe("初始值"),
          previousValue: tool.schema.number().optional().describe("上期值"),
          currentValue: tool.schema.number().describe("本期值"),
          cumulativeChange: tool.schema.number().describe("累计变化量"),
          periodChange: tool.schema.number().optional().describe("本期变化量"),
          rate: tool.schema.number().optional().describe("变化速率(/d)"),
        }),
      )
      .min(1)
      .describe("各测点数据"),
    alertThreshold: tool.schema.number().positive().optional().describe("报警控制值"),
    unit: tool.schema.string().default("mm").describe("单位"),
    outputPath: tool.schema.string().optional().describe("输出路径"),
  },
  async execute(args) {
    const typeLabels: Record<string, string> = {
      settlement: "沉降监测",
      displacement: "水平位移",
      axial_force: "轴力监测",
      water_level: "水位监测",
      inclinometer: "深层水平位移",
      convergence: "收敛监测",
    }
    const typeLabel = typeLabels[args.monitoringType] ?? args.monitoringType

    const headers = [
      "测点编号",
      ...(args.points.some((p) => p.section) ? ["所属断面"] : []),
      ...(args.points.some((p) => p.initialValue !== undefined) ? [`初始值(${args.unit})`] : []),
      ...(args.points.some((p) => p.previousValue !== undefined) ? [`上期值(${args.unit})`] : []),
      `本期值(${args.unit})`,
      `累计变化量(${args.unit})`,
      ...(args.points.some((p) => p.periodChange !== undefined) ? [`本期变化量(${args.unit})`] : []),
      ...(args.points.some((p) => p.rate !== undefined) ? [`变化速率(${args.unit}/d)`] : []),
      ...(args.alertThreshold ? [`控制值(${args.unit})`, "占控制值(%)", "预警状态"] : []),
    ]

    const rows: CellValue[][] = args.points.map((p) => {
      const ratio = args.alertThreshold ? Math.abs(p.cumulativeChange) / args.alertThreshold : 0
      let alertStatus = ""
      if (args.alertThreshold) {
        if (ratio >= 1.0) alertStatus = "超限"
        else if (ratio >= 0.85) alertStatus = "橙色预警"
        else if (ratio >= 0.7) alertStatus = "黄色预警"
        else alertStatus = "正常"
      }

      return [
        p.id,
        ...(args.points.some((pt) => pt.section) ? [p.section ?? ""] : []),
        ...(args.points.some((pt) => pt.initialValue !== undefined) ? [p.initialValue ?? null] : []),
        ...(args.points.some((pt) => pt.previousValue !== undefined) ? [p.previousValue ?? null] : []),
        p.currentValue,
        p.cumulativeChange,
        ...(args.points.some((pt) => pt.periodChange !== undefined) ? [p.periodChange ?? null] : []),
        ...(args.points.some((pt) => pt.rate !== undefined) ? [p.rate ?? null] : []),
        ...(args.alertThreshold ? [args.alertThreshold, Number((ratio * 100).toFixed(1)), alertStatus] : []),
      ]
    })

    // Summary row
    const cumulativeValues = args.points.map((p) => Math.abs(p.cumulativeChange))
    const maxIdx = cumulativeValues.indexOf(Math.max(...cumulativeValues))
    const avgCumulative = cumulativeValues.reduce((s, v) => s + v, 0) / cumulativeValues.length
    const alertCount = args.alertThreshold
      ? args.points.filter((p) => Math.abs(p.cumulativeChange) >= args.alertThreshold! * 0.7).length
      : 0

    const sheetData: SheetData = {
      name: typeLabel,
      headers,
      rows,
      freezeRow: 1,
    }

    const xlsxBytes = buildXlsx([sheetData])
    const filename = `${args.projectName}_${typeLabel}_${args.date}`
    const dest = args.outputPath ?? `./${filename.replace(/[/\\:*?"<>|]/g, "_")}.xlsx`
    await Bun.write(dest, xlsxBytes)

    return JSON.stringify({
      output_path: dest,
      file_size_kb: Number((xlsxBytes.length / 1024).toFixed(1)),
      project: args.projectName,
      type: typeLabel,
      date: args.date,
      point_count: args.points.length,
      max_point: { id: args.points[maxIdx]!.id, value: args.points[maxIdx]!.cumulativeChange },
      avg_cumulative: Number(avgCumulative.toFixed(3)),
      alert_count: alertCount,
      message: `✅ ${typeLabel}报表已导出：${dest}，${args.points.length}个测点，最大变化 ${args.points[maxIdx]!.id}(${args.points[maxIdx]!.cumulativeChange}${args.unit})${alertCount > 0 ? `，${alertCount}个测点预警` : ""}`,
    })
  },
})
