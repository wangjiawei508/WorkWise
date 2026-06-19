/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"

type Clause = {
  code: string
  title: string
  section: string
  content: string
  keywords: string[]
  mandatory: boolean
}

const STANDARDS: Clause[] = [
  // GB 50911 — 城市轨道交通工程监测技术规范
  {
    code: "GB 50911",
    title: "城市轨道交通工程监测技术规范",
    section: "3.0.1",
    content: "城市轨道交通工程的设计、施工及运营阶段，应根据工程特点和环境条件制定监测方案，进行工程监测。",
    keywords: ["监测方案", "设计阶段", "施工阶段", "运营阶段"],
    mandatory: true,
  },
  {
    code: "GB 50911",
    title: "城市轨道交通工程监测技术规范",
    section: "3.0.3",
    content:
      "监测工作应做到：1 采用的监测方法和精度应满足监测要求；2 监测过程中应加强对监测点的保护，避免损坏；3 监测数据应及时处理、分析和反馈。",
    keywords: ["监测精度", "监测方法", "数据反馈"],
    mandatory: true,
  },
  {
    code: "GB 50911",
    title: "城市轨道交通工程监测技术规范",
    section: "4.2.1",
    content: "基准点应埋设在变形影响范围以外稳定的区域，且不少于3个。基准点间距不宜大于500m，并应定期进行稳定性检验。",
    keywords: ["基准点", "稳定性", "影响范围", "埋设"],
    mandatory: false,
  },
  {
    code: "GB 50911",
    title: "城市轨道交通工程监测技术规范",
    section: "5.1.2",
    content:
      "地铁保护区监测应包括：结构沉降、结构水平位移、隧道收敛、地表沉降、管线位移、建筑物沉降与倾斜等项目，并应根据工程影响等级确定必测项和选测项。",
    keywords: ["保护区", "结构沉降", "水平位移", "隧道收敛", "管线", "必测项"],
    mandatory: true,
  },
  {
    code: "GB 50911",
    title: "城市轨道交通工程监测技术规范",
    section: "5.4.1",
    content: "监测频率应根据施工进度、变形速率和变形量大小综合确定。施工期关键阶段监测频率不应低于1次/天。",
    keywords: ["监测频率", "施工进度", "变形速率", "关键阶段"],
    mandatory: true,
  },
  {
    code: "GB 50911",
    title: "城市轨道交通工程监测技术规范",
    section: "5.5.1",
    content:
      "监测报警值应根据相关设计文件、规范要求和工程经验综合确定。当监测值达到报警值时，应及时报告建设单位和相关部门，并应采取相应措施。",
    keywords: ["报警值", "报警", "预警", "控制值"],
    mandatory: true,
  },
  {
    code: "GB 50911",
    title: "城市轨道交通工程监测技术规范",
    section: "7.2.1",
    content:
      "竖向位移监测精度等级不应低于二等水准测量，高程中误差不应大于±0.5mm。当采用静力水准时，系统分辨力不应大于0.01mm。",
    keywords: ["竖向位移", "水准测量", "精度", "静力水准"],
    mandatory: false,
  },
  {
    code: "GB 50911",
    title: "城市轨道交通工程监测技术规范",
    section: "7.3.1",
    content:
      "水平位移监测宜采用全站仪极坐标法、视准线法或自动化监测系统。全站仪测角中误差不应大于1″，测距中误差不应大于1mm+1ppm。",
    keywords: ["水平位移", "全站仪", "极坐标", "视准线"],
    mandatory: false,
  },

  // GB 50497 — 建筑基坑工程监测技术标准
  {
    code: "GB 50497",
    title: "建筑基坑工程监测技术标准",
    section: "3.0.1",
    content: "开挖深度大于等于5m或开挖深度小于5m但现场地质条件和周围环境较复杂的基坑工程，应实施基坑工程监测。",
    keywords: ["基坑", "开挖深度", "5m", "监测"],
    mandatory: true,
  },
  {
    code: "GB 50497",
    title: "建筑基坑工程监测技术标准",
    section: "3.0.2",
    content:
      "基坑工程监测应包括以下必测项目：1 围护墙（桩）顶水平位移；2 周边地表沉降；3 围护墙（桩）顶竖向位移。安全等级为一级的基坑还应包括：深层水平位移、支撑轴力、地下水位等。",
    keywords: ["必测项目", "围护墙", "水平位移", "地表沉降", "支撑轴力", "地下水位"],
    mandatory: true,
  },
  {
    code: "GB 50497",
    title: "建筑基坑工程监测技术标准",
    section: "5.0.1",
    content:
      "围护墙顶水平位移报警值：一级基坑不应大于30mm，且日变化量不应大于3mm/d；二级基坑不应大于40mm。围护墙深层最大水平位移报警值：一级不应大于0.3%H（H为基坑深度），二级不应大于0.6%H。",
    keywords: ["报警值", "围护墙", "水平位移", "30mm", "日变化量", "3mm/d"],
    mandatory: true,
  },
  {
    code: "GB 50497",
    title: "建筑基坑工程监测技术标准",
    section: "5.0.3",
    content:
      "地表沉降报警值：一级基坑的最大沉降量不应大于0.15%L（L为基坑边长），且日沉降量不应大于2mm/d。管线变形报警值应根据管线类型和材质确定，刚性管线不应大于10mm。",
    keywords: ["地表沉降", "管线", "报警值", "日沉降量"],
    mandatory: true,
  },
  {
    code: "GB 50497",
    title: "建筑基坑工程监测技术标准",
    section: "6.2.1",
    content:
      "基坑工程监测频率应根据施工进程确定：开挖期间不应少于1次/天；当出现异常情况或达到报警值时，应加密监测并持续至变形趋于稳定。基坑使用超过设计工况时间时，监测频率不应低于1次/周。",
    keywords: ["监测频率", "开挖期间", "1次/天", "加密监测"],
    mandatory: true,
  },
  {
    code: "GB 50497",
    title: "建筑基坑工程监测技术标准",
    section: "7.1.1",
    content:
      "监测点布置应满足监测要求：围护墙顶水平位移监测点沿基坑周边布置，间距不宜大于20m，关键部位应适当加密。地表沉降监测点应在开挖影响范围内按断面布置。",
    keywords: ["监测点布置", "间距", "20m", "断面"],
    mandatory: false,
  },

  // JGJ 8 — 建筑变形测量规范
  {
    code: "JGJ 8",
    title: "建筑变形测量规范",
    section: "3.0.2",
    content:
      "变形测量等级划分为四个等级。一等适用于特别重要或特别精密的工程，二等适用于重要或精密工程（如高层建筑、地铁），三等适用于一般工程，四等适用于精度要求较低的工程。",
    keywords: ["变形测量等级", "一等", "二等", "三等", "四等"],
    mandatory: false,
  },
  {
    code: "JGJ 8",
    title: "建筑变形测量规范",
    section: "4.1.3",
    content:
      "沉降观测的水准基点应不少于3个，并应埋设在变形影响区域以外。基准点之间应组成闭合环路或附合水准路线进行联测。",
    keywords: ["水准基点", "基准点", "闭合环路", "3个"],
    mandatory: false,
  },
  {
    code: "JGJ 8",
    title: "建筑变形测量规范",
    section: "4.3.1",
    content:
      "水准测量各等级精度要求：二等水准视线长度不大于50m，前后视距差不大于1m，每站高差中误差不大于0.5mm。三等水准视线长度不大于75m，前后视距差不大于3m。",
    keywords: ["水准测量", "精度", "视线长度", "前后视距差"],
    mandatory: false,
  },
  {
    code: "JGJ 8",
    title: "建筑变形测量规范",
    section: "5.1.1",
    content:
      "建筑沉降稳定标准：最后100天的沉降速率小于0.01~0.04mm/d（由基础类型确定），可认为已进入稳定阶段。地基为砂类土时取小值，地基为淤泥质黏土时取大值。",
    keywords: ["沉降稳定", "沉降速率", "0.01mm/d", "稳定标准"],
    mandatory: false,
  },
  {
    code: "JGJ 8",
    title: "建筑变形测量规范",
    section: "5.5.1",
    content:
      "建筑倾斜观测应测定建筑顶部相对于底部的水平位移。多层和高层建筑的倾斜报警值为H/500（H为建筑高度），整体倾斜不应超过H/250。",
    keywords: ["倾斜", "倾斜报警值", "H/500", "建筑高度"],
    mandatory: false,
  },

  // GB 50026 — 工程测量标准
  {
    code: "GB 50026",
    title: "工程测量标准",
    section: "4.2.1",
    content:
      "平面控制网的等级分为一等至四等，以及一级至三级。城市测量一般采用二等以上控制网。GPS控制网的基线向量解算应满足：同步观测时间不少于60min（静态），单频接收机基线长度不大于15km。",
    keywords: ["控制网", "等级", "GPS", "基线", "静态观测"],
    mandatory: false,
  },
  {
    code: "GB 50026",
    title: "工程测量标准",
    section: "4.3.1",
    content:
      "高程控制网等级：一等水准闭合差限差±4√L mm，二等±6√L mm（城市轨道交通基准网常用），三等±12√L mm，四等±20√L mm（L为路线长度/km）。",
    keywords: ["高程控制", "闭合差", "限差", "水准", "4√L", "6√L", "12√L", "20√L"],
    mandatory: true,
  },
  {
    code: "GB 50026",
    title: "工程测量标准",
    section: "5.1.1",
    content:
      "导线测量的角度闭合差限差：DJ1仪器±5″√n，DJ2仪器±10″√n，DJ6仪器±20″√n（n为测站数）。全长相对闭合差：一级导线不大于1/40000，二级不大于1/20000，三级不大于1/10000。",
    keywords: ["导线", "角度闭合差", "DJ1", "DJ2", "DJ6", "相对闭合差"],
    mandatory: true,
  },
  {
    code: "GB 50026",
    title: "工程测量标准",
    section: "6.2.1",
    content:
      "地形测量的高程注记应取位至0.01m。建筑物轮廓点位中误差不应大于图上0.5mm，独立地物点位中误差不应大于图上1.0mm。",
    keywords: ["地形测量", "高程注记", "点位中误差"],
    mandatory: false,
  },

  // GB 55017 — 工程勘察通用规范
  {
    code: "GB 55017",
    title: "工程勘察通用规范",
    section: "2.0.1",
    content: "工程勘察应查明场地工程地质和水文地质条件，评价工程建设适宜性，并为设计、施工和运营提供可靠依据。",
    keywords: ["工程勘察", "水文地质", "地质条件", "可靠依据"],
    mandatory: true,
  },
  {
    code: "GB 55017",
    title: "工程勘察通用规范",
    section: "5.1.1",
    content: "涉及工程安全的勘察成果、参数取值和风险评价应有充分依据，不能满足要求时应补充勘察或专项论证。",
    keywords: ["风险评价", "补充勘察", "专项论证", "工程安全"],
    mandatory: true,
  },

  // GB 50007 — 建筑地基基础设计规范
  {
    code: "GB 50007",
    title: "建筑地基基础设计规范",
    section: "5.3",
    content: "地基变形计算和控制应结合建筑物安全等级、地基土性质、基础形式和相邻工程影响综合确定。",
    keywords: ["地基变形", "相邻工程", "基础", "沉降"],
    mandatory: false,
  },
  {
    code: "GB 50007",
    title: "建筑地基基础设计规范",
    section: "8.5",
    content: "基坑、边坡和邻近建筑影响分析应关注支护结构、地下水、周边荷载和变形控制要求。",
    keywords: ["基坑", "边坡", "地下水", "周边荷载", "变形控制"],
    mandatory: false,
  },

  // TB 10101 / TB 10601 — 铁路工程测量和高速铁路工程测量
  {
    code: "TB 10101",
    title: "铁路工程测量规范",
    section: "CPIII",
    content: "铁路精密工程测量应按相应等级建立平面和高程控制网，CPIII 控制网成果应满足轨道精调和运营维护的精度要求。",
    keywords: ["铁路", "CPIII", "精测网", "平面控制", "高程控制"],
    mandatory: false,
  },
  {
    code: "TB 10601",
    title: "高速铁路工程测量规范",
    section: "精密控制网",
    content: "高速铁路工程测量应建立分级精密控制网，控制测量、复测和成果使用应保证轨道工程对平顺性和稳定性的要求。",
    keywords: ["高速铁路", "精密控制网", "复测", "平顺性", "稳定性"],
    mandatory: false,
  },

  // 地方规程核查项 — 不替代正式条文
  {
    code: "LOCAL-RAIL-PROTECTION",
    title: "地方轨道交通保护区监测技术规程（项目适用版）",
    section: "核查项",
    content:
      "地方轨道交通保护区项目应核验所在地运营单位或主管部门发布的最新版保护区监测技术规程；监测项目、频率、报警值和报审格式以项目适用版为准。",
    keywords: ["地方规程", "保护区", "运营单位", "宁波", "浙江", "最新版"],
    mandatory: true,
  },
]

function score(clause: Clause, keywords: string[]) {
  const lower = keywords.map((k) => k.toLowerCase())
  let s = 0
  for (const kw of clause.keywords) {
    if (lower.some((q) => kw.toLowerCase().includes(q) || q.includes(kw.toLowerCase()))) s += 2
  }
  if (lower.some((q) => clause.content.toLowerCase().includes(q))) s += 1
  if (lower.some((q) => clause.section.includes(q))) s += 3
  if (lower.some((q) => clause.code.toLowerCase().includes(q.toLowerCase()))) s += 2
  return s
}

export const query_standard = tool({
  description:
    "查询工程监测相关规范条文。内置 GB 50911、GB 50497、JGJ 8、GB 50026、GB 55017、GB 50007、TB 10101、TB 10601，并提供地方轨道交通保护区规程核查项。qa_reviewer 在审查技术方案时必须调用此工具获取准确依据，严禁凭记忆引用。",
  args: {
    keywords: tool.schema
      .array(tool.schema.string())
      .min(1)
      .describe('查询关键词列表，如 ["报警值", "基坑"] 或 ["水准", "闭合差"]'),
    standardCode: tool.schema
      .enum([
        "GB 50911",
        "GB 50497",
        "JGJ 8",
        "GB 50026",
        "GB 55017",
        "GB 50007",
        "TB 10101",
        "TB 10601",
        "LOCAL-RAIL-PROTECTION",
        "all",
      ])
      .default("all")
      .describe("限定查询的规范编号，默认搜索全部"),
    mandatoryOnly: tool.schema.boolean().default(false).describe("是否只返回强制性条文"),
  },
  async execute(args) {
    let pool = STANDARDS
    if (args.standardCode !== "all") pool = pool.filter((c) => c.code === args.standardCode)
    if (args.mandatoryOnly) pool = pool.filter((c) => c.mandatory)

    const scored = pool
      .map((c) => ({ clause: c, score: score(c, args.keywords) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)

    if (scored.length === 0)
      return JSON.stringify({
        query: args.keywords,
        results: [],
        message: `未找到与关键词 [${args.keywords.join(", ")}] 匹配的条文。建议调整关键词或扩大搜索范围。`,
      })

    const results = scored.slice(0, 8).map((r) => ({
      code: r.clause.code,
      title: r.clause.title,
      section: r.clause.section,
      content: r.clause.content,
      mandatory: r.clause.mandatory,
      relevance: r.score,
    }))

    return JSON.stringify({
      query: args.keywords,
      standard_filter: args.standardCode,
      mandatory_only: args.mandatoryOnly,
      total_matches: scored.length,
      returned: results.length,
      results,
      message: `✅ 共找到 ${scored.length} 条相关条文，返回前 ${results.length} 条（按相关度排序）。`,
    })
  },
})

export const list_standards = tool({
  description: "列出内置规范库中所有可查询的规范清单及条文数量，供 qa_reviewer 了解当前知识库覆盖范围。",
  args: {},
  async execute() {
    const summary = new Map<string, { title: string; total: number; mandatory: number }>()
    for (const c of STANDARDS) {
      const existing = summary.get(c.code) ?? { title: c.title, total: 0, mandatory: 0 }
      existing.total++
      if (c.mandatory) existing.mandatory++
      summary.set(c.code, existing)
    }

    const list = [...summary.entries()].map(([code, info]) => ({
      code,
      title: info.title,
      total_clauses: info.total,
      mandatory_clauses: info.mandatory,
    }))

    return JSON.stringify({
      standards: list,
      total_clauses: STANDARDS.length,
      message: `📚 规范库共收录 ${summary.size} 部规范、${STANDARDS.length} 条核心条文。`,
    })
  },
})
