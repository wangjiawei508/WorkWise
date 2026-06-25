import {
  DEFAULT_AGNES_IMAGE_MODEL,
  DEFAULT_AGNES_PROVIDER_ID,
  FALLBACK_AGNES_IMAGE_MODEL
} from './app-settings-types'

export const AGNES_IMAGE_PROVIDER_ID = DEFAULT_AGNES_PROVIDER_ID
export const AGNES_IMAGE_DEFAULT_MODEL = DEFAULT_AGNES_IMAGE_MODEL
export const AGNES_IMAGE_FALLBACK_MODEL = FALLBACK_AGNES_IMAGE_MODEL
export const AGNES_IMAGE_DEFAULT_SIZE = '1536x1024'
export const AGNES_IMAGE_DIRECTORY = 'img'

export const AGNES_IMAGE_SIZES = [
  '1024x1024',
  '1536x1024',
  '1024x1536'
] as const

export type AgnesImageSize = typeof AGNES_IMAGE_SIZES[number]

export type AgnesImagePromptVariable = {
  name: string
  label: string
  defaultValue: string
}

export type AgnesImagePromptTemplate = {
  id: string
  title: string
  description: string
  size: AgnesImageSize
  variables: AgnesImagePromptVariable[]
  prompt: string
}

export type AgnesImageGenerationPayload = {
  workspaceRoot: string
  currentFilePath: string
  prompt: string
  providerId?: string
  model?: string
  size?: string
  imageDirectory?: string
}

export type AgnesImageGenerationResult =
  | {
      ok: true
      path: string
      markdownPath: string
      mimeType: string
      size: number
      model: string
      prompt: string
      createdAt: string
      revisedPrompt?: string
    }
  | { ok: false; message: string }

export const AGNES_IMAGE_PROMPT_TEMPLATES: AgnesImagePromptTemplate[] = [
  {
    id: 'engineering-report-cover',
    title: '工程汇报封面',
    description: '适合方案、月报、汇报材料和 PPT 首页配图。',
    size: '1536x1024',
    variables: [
      { name: '主题', label: '主题', defaultValue: '城市基础设施监测与运维' },
      { name: '行业', label: '行业', defaultValue: '轨道交通、城市更新、工程监测' },
      { name: '画面主体', label: '画面主体', defaultValue: '城市轨道、高架桥、监测传感器和数据光线' },
      { name: '颜色', label: '颜色', defaultValue: '深蓝、青绿、少量暖橙点缀' },
      { name: '用途', label: '用途', defaultValue: '正式汇报封面，留出标题区域' },
      { name: '比例', label: '比例', defaultValue: '16:9 横版' }
    ],
    prompt:
      '为「{主题}」生成一张{用途}配图。行业背景是{行业}，画面主体包含{画面主体}。风格要求：现代、可信、专业、清爽，有工程科技感但不过度科幻；主色为{颜色}；构图为{比例}，上方或左侧预留干净留白用于放置标题。不要出现文字、Logo、水印、人物特写。'
  },
  {
    id: 'monitoring-data-background',
    title: '监测数据背景',
    description: '适合日报、周报、数据分析章节背景和图表页。',
    size: '1536x1024',
    variables: [
      { name: '主题', label: '主题', defaultValue: '结构变形监测数据分析' },
      { name: '行业', label: '行业', defaultValue: '地铁保护区、运营期结构监测、深基坑监测' },
      { name: '画面主体', label: '画面主体', defaultValue: '折线图、测点网格、隧道断面轮廓和传感器节点' },
      { name: '颜色', label: '颜色', defaultValue: '白底、蓝绿数据线、低饱和灰色网格' },
      { name: '用途', label: '用途', defaultValue: '报告内页背景或数据看板配图' },
      { name: '比例', label: '比例', defaultValue: '16:9 横版' }
    ],
    prompt:
      '生成一张用于{用途}的抽象数据背景图，主题为「{主题}」，行业语境是{行业}。画面应包含{画面主体}，呈现真实工程数据的秩序感。风格要求：简洁、低噪声、可叠加文字和图表；配色为{颜色}；构图为{比例}。不要出现可读文字、品牌标识、水印、夸张霓虹或复杂人物。'
  },
  {
    id: 'construction-ops-diagram',
    title: '施工/运维示意图',
    description: '适合解释施工穿越、巡检、测点布设和运维流程。',
    size: '1536x1024',
    variables: [
      { name: '主题', label: '主题', defaultValue: '穿越既有轨道交通区间的自动化监测' },
      { name: '行业', label: '行业', defaultValue: '城市轨道交通保护区工程' },
      { name: '画面主体', label: '画面主体', defaultValue: '盾构隧道、施工机械、自动化全站仪、监测棱镜和控制线' },
      { name: '颜色', label: '颜色', defaultValue: '浅灰工程线稿、蓝色监测线、橙色施工区域' },
      { name: '用途', label: '用途', defaultValue: '技术方案示意图' },
      { name: '比例', label: '比例', defaultValue: '16:9 横版' }
    ],
    prompt:
      '生成一张{用途}风格的工程示意图，主题为「{主题}」。行业背景：{行业}。画面主体包含{画面主体}，以半写实+信息图的方式展示空间关系和监测逻辑。配色采用{颜色}，构图为{比例}。画面要专业、清楚、适合放进技术方案，不要出现文字标签、Logo、水印或夸张卡通风。'
  },
  {
    id: 'business-writing-illustration',
    title: '商务写作配图',
    description: '适合公众号、方案前言、市场介绍和产品能力说明。',
    size: '1536x1024',
    variables: [
      { name: '主题', label: '主题', defaultValue: '传统工程监测行业的数字化转型' },
      { name: '行业', label: '行业', defaultValue: '基础设施、城市安全、项目管理' },
      { name: '画面主体', label: '画面主体', defaultValue: '会议桌、城市模型、数据屏、工程图纸和协作人员剪影' },
      { name: '颜色', label: '颜色', defaultValue: '自然白、石墨灰、蓝绿色重点色' },
      { name: '用途', label: '用途', defaultValue: '商务文章头图' },
      { name: '比例', label: '比例', defaultValue: '16:9 横版' }
    ],
    prompt:
      '为「{主题}」生成一张{用途}。行业语境是{行业}，画面主体包含{画面主体}。风格要求：真实、克制、商业杂志感，体现专业服务、数据能力和协作，不要像广告海报。配色为{颜色}，构图为{比例}，留出可放标题的空间。不要出现可读文字、Logo、水印。'
  },
  {
    id: 'iconic-illustration',
    title: '图标式插画',
    description: '适合功能模块、Skill 卡片、流程节点和产品说明。',
    size: '1024x1024',
    variables: [
      { name: '主题', label: '主题', defaultValue: '智能体辅助工程文档生成' },
      { name: '行业', label: '行业', defaultValue: '工程咨询与基础设施运维' },
      { name: '画面主体', label: '画面主体', defaultValue: '文档、齿轮、传感器节点、数据曲线和小型城市结构' },
      { name: '颜色', label: '颜色', defaultValue: '蓝绿、白色、少量亮黄' },
      { name: '用途', label: '用途', defaultValue: '产品功能图标或 Skill 图标' },
      { name: '比例', label: '比例', defaultValue: '1:1 方图' }
    ],
    prompt:
      '生成一张用于{用途}的图标式插画，主题为「{主题}」，行业背景是{行业}。画面主体包含{画面主体}。风格要求：简洁、扁平轻 3D、边缘清晰、适合小尺寸展示；配色为{颜色}；构图为{比例}，主体居中，背景干净。不要出现文字、Logo、水印或复杂场景。'
  }
]

export function defaultAgnesImageTemplate(): AgnesImagePromptTemplate {
  return AGNES_IMAGE_PROMPT_TEMPLATES[0]!
}

export function variableDefaultsForTemplate(
  template: AgnesImagePromptTemplate
): Record<string, string> {
  return Object.fromEntries(
    template.variables.map((variable) => [variable.name, variable.defaultValue])
  )
}

export function fillAgnesImagePrompt(
  template: AgnesImagePromptTemplate,
  values: Record<string, string>
): string {
  let prompt = template.prompt
  for (const variable of template.variables) {
    const raw = values[variable.name]?.trim() || variable.defaultValue
    prompt = prompt.replaceAll(`{${variable.name}}`, raw)
  }
  return prompt
}

export function isAgnesImageSize(value: string | undefined): value is AgnesImageSize {
  return AGNES_IMAGE_SIZES.includes(value as AgnesImageSize)
}
