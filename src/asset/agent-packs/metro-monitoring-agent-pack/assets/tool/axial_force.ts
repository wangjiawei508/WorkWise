/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

export const axial_force_calc = tool({
  description:
    "基坑支撑轴力计算与分析。根据轴力计/应变计频率或应力值，计算钢支撑或混凝土支撑的实际轴力，对比设计值和报警值进行预警分级。基坑自动化监测中轴力分析的核心工具。data_analyst 处理轴力监测数据时必须调用此工具。",
  args: {
    pointId: tool.schema.string().describe("测点编号，如 ZL-01"),
    strutType: tool.schema.enum(["steel", "concrete"]).describe("支撑类型：steel=钢支撑, concrete=混凝土支撑"),
    crossSectionArea: tool.schema.number().positive().describe("支撑截面积(m²)，钢支撑查型钢表，混凝土支撑=宽×高"),
    elasticModulus: tool.schema
      .number()
      .positive()
      .optional()
      .describe("弹性模量(GPa)，不传则默认：钢=206GPa，混凝土=30GPa"),
    designForce: tool.schema.number().positive().describe("设计轴力(kN)"),
    alertRatio: tool.schema.number().positive().default(0.8).describe("报警比例，默认0.8（设计值的80%报警）"),
    readings: tool.schema
      .array(
        tool.schema.object({
          date: tool.schema.string().describe("观测日期 YYYY-MM-DD HH:mm"),
          value: tool.schema.number().describe("轴力值(kN)或应力值(MPa)"),
          valueType: tool.schema
            .enum(["force", "stress", "frequency"])
            .default("force")
            .describe("值类型：force=轴力kN, stress=应力MPa, frequency=频率Hz"),
        }),
      )
      .min(1)
      .describe("观测数据序列"),
    frequencyCalibration: tool.schema
      .object({
        k: tool.schema.number().describe("标定系数K"),
        f0: tool.schema.number().describe("初始频率(Hz)"),
      })
      .optional()
      .describe("频率型传感器标定参数（仅frequency类型需要）"),
    temperature: tool.schema
      .object({
        current: tool.schema.number().describe("当前温度(℃)"),
        reference: tool.schema.number().describe("基准温度(℃)"),
        coefficient: tool.schema.number().describe("温度修正系数(kN/℃)"),
      })
      .optional()
      .describe("温度补偿参数（可选）"),
  },
  async execute(args) {
    const E = args.elasticModulus ?? (args.strutType === "steel" ? 206 : 30)
    const A = args.crossSectionArea
    const alertForce = args.designForce * args.alertRatio

    const tempCorrection = args.temperature
      ? args.temperature.coefficient * (args.temperature.current - args.temperature.reference)
      : 0

    const analyzed = args.readings.map((r) => {
      let force: number
      if (r.valueType === "force") {
        force = r.value
      } else if (r.valueType === "stress") {
        force = r.value * A * 1000
      } else {
        if (!args.frequencyCalibration) return { date: r.date, error: "频率型需提供标定参数" }
        const cal = args.frequencyCalibration
        force = cal.k * (r.value * r.value - cal.f0 * cal.f0)
      }

      force += tempCorrection
      const stress = force / (A * 1000)
      const designRatio = force / args.designForce

      let status = "🟢 正常"
      if (designRatio >= 1.0) status = "🔴 超设计值"
      else if (force >= alertForce) status = "🟠 超报警值"
      else if (designRatio >= 0.6) status = "🟡 关注"

      return {
        date: r.date,
        force_kN: Number(force.toFixed(1)),
        stress_MPa: Number(stress.toFixed(2)),
        design_ratio_pct: Number((designRatio * 100).toFixed(1)),
        status,
      }
    })

    const validEntries = analyzed.filter((a) => "force_kN" in a) as Array<{
      date: string
      force_kN: number
      stress_MPa: number
      design_ratio_pct: number
      status: string
    }>

    const maxEntry = validEntries.reduce((max, e) => (e.force_kN > max.force_kN ? e : max), validEntries[0]!)

    const rates: Array<{ period: string; rate_kN_per_day: number }> = []
    for (let i = 1; i < validEntries.length; i++) {
      const dt = (new Date(validEntries[i]!.date).getTime() - new Date(validEntries[i - 1]!.date).getTime()) / 86400000
      if (dt > 0) {
        rates.push({
          period: `${validEntries[i - 1]!.date} → ${validEntries[i]!.date}`,
          rate_kN_per_day: Number(((validEntries[i]!.force_kN - validEntries[i - 1]!.force_kN) / dt).toFixed(1)),
        })
      }
    }

    const allowableStress = args.strutType === "steel" ? 215 : (E * 1000) / 3
    const safetyFactor = allowableStress / maxEntry.stress_MPa

    return JSON.stringify({
      point_id: args.pointId,
      strut_type: args.strutType === "steel" ? "钢支撑" : "混凝土支撑",
      cross_section_area_m2: A,
      elastic_modulus_GPa: E,
      design_force_kN: args.designForce,
      alert_force_kN: Number(alertForce.toFixed(1)),
      temperature_correction_kN: Number(tempCorrection.toFixed(1)),
      max_force: {
        date: maxEntry.date,
        force_kN: maxEntry.force_kN,
        design_ratio_pct: maxEntry.design_ratio_pct,
      },
      safety_factor: Number(safetyFactor.toFixed(2)),
      readings: analyzed,
      rates,
      message: `✅ ${args.pointId} 轴力分析：最大 ${maxEntry.force_kN}kN（设计值${maxEntry.design_ratio_pct}%），安全系数 ${safetyFactor.toFixed(2)}`,
    })
  },
})

export const axial_force_comparison = tool({
  description:
    "多道支撑轴力对比分析。同时对比同一基坑断面上多道支撑的轴力状态，判断力的分布合理性。用于基坑监测日报中的轴力汇总分析。",
  args: {
    sectionId: tool.schema.string().describe("监测断面编号"),
    struts: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string().describe("支撑编号，如 第1道钢支撑"),
          level: tool.schema.number().int().positive().describe("第几道支撑（从上往下）"),
          currentForce: tool.schema.number().describe("当前轴力(kN)"),
          designForce: tool.schema.number().positive().describe("设计轴力(kN)"),
          previousForce: tool.schema.number().optional().describe("上期轴力(kN)"),
        }),
      )
      .min(1)
      .describe("各道支撑数据"),
  },
  async execute(args) {
    const results = args.struts
      .sort((a, b) => a.level - b.level)
      .map((s) => {
        const ratio = s.currentForce / s.designForce
        const increment = s.previousForce !== undefined ? s.currentForce - s.previousForce : null

        let status = "🟢 正常"
        if (ratio >= 1.0) status = "🔴 超设计值"
        else if (ratio >= 0.8) status = "🟠 超报警值"
        else if (ratio >= 0.6) status = "🟡 关注"

        return {
          id: s.id,
          level: s.level,
          current_kN: s.currentForce,
          design_kN: s.designForce,
          ratio_pct: Number((ratio * 100).toFixed(1)),
          increment_kN: increment !== null ? Number(increment.toFixed(1)) : null,
          status,
        }
      })

    const maxStrut = results.reduce((max, r) => (r.ratio_pct > max.ratio_pct ? r : max), results[0]!)
    const alertCount = results.filter((r) => r.status.includes("超")).length
    const totalForce = results.reduce((s, r) => s + r.current_kN, 0)

    return JSON.stringify({
      section_id: args.sectionId,
      strut_count: results.length,
      total_force_kN: Number(totalForce.toFixed(1)),
      max_ratio_strut: { id: maxStrut.id, ratio_pct: maxStrut.ratio_pct },
      alert_count: alertCount,
      details: results,
      message: `✅ ${args.sectionId} 轴力汇总：${results.length}道支撑，总力 ${totalForce.toFixed(0)}kN，最大比值 ${maxStrut.id}(${maxStrut.ratio_pct}%)，${alertCount}道预警`,
    })
  },
})
