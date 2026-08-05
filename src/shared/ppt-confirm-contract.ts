/**
 * PPT Master 4.3 native confirmation contract.
 *
 * The WorkWise agent authors `confirm_ui/recommendations.stage1.json`
 * (AI-authored proposal, per PPT Master confirm_ui.md). The renderer turns
 * that proposal into an interactive panel; on confirm it writes the upstream
 * compatible `confirm_ui/result.json` and injects a confirmation message into
 * the current conversation so the agent continues the generation.
 */

export type PptMasterRecommendations = Record<string, unknown>
export type PptMasterConfirmEdits = Record<string, unknown>

export type PptMasterStage = 'stage1' | 'stage2' | 'stage3' | 'final'

export type PptMasterConfirmedResult = {
  stage: string
  status: string
  confirmedAt: string
  projectDir?: string
  source: 'workwise-native-panel'
} & Record<string, unknown>

const INTERNAL_RESULT_KEYS = new Set(['stage', 'status', 'confirmedAt', 'projectDir', 'source'])

export function buildPptMasterResult(
  recommendations: PptMasterRecommendations,
  edits: PptMasterConfirmEdits = {},
  projectDir?: string,
  stage: PptMasterStage = 'final',
  confirmedAt = new Date().toISOString()
): PptMasterConfirmedResult {
  const merged: Record<string, unknown> = { ...recommendations }
  for (const [key, value] of Object.entries(edits)) {
    if (INTERNAL_RESULT_KEYS.has(key)) continue
    if (value === undefined) continue
    merged[key] = value
  }
  const [resultStage, resultStatus] =
    stage === 'stage1'
      ? ['stage1', 'stage1-confirmed']
      : stage === 'stage2'
        ? ['stage2', 'stage2-confirmed']
        : ['final', 'confirmed']
  return {
    ...merged,
    stage: resultStage,
    status: resultStatus,
    confirmedAt,
    ...(projectDir ? { projectDir } : {}),
    source: 'workwise-native-panel'
  }
}

/**
 * PPT Master upstream recommendation files wrap values in a `recommend`
 * object and keep per-field candidate arrays in a top-level `candidates`
 * map (e.g. `recommendations.stage1.json`). WorkWise-authored files may
 * instead use the flat single-pass shape directly. Normalize both into the
 * flat display shape the native confirmation panel consumes.
 */
export function normalizePptMasterRecommendations(
  raw: PptMasterRecommendations
): PptMasterRecommendations {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const nested = raw.recommend
  const flat: Record<string, unknown> = { ...raw }
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      flat[key] = value
    }
  }
  delete flat.recommend
  delete flat.candidates
  delete flat.options
  delete flat.lang
  delete flat.stage

  const candidateGroups = (raw.candidates ?? raw.options) as Record<string, unknown> | undefined
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(flat)) {
    const display = unwrapChoiceValue(value)
    const group = candidateGroups?.[key]
    if (Array.isArray(group)) {
      const base =
        display && typeof display === 'object' && !Array.isArray(display)
          ? (display as Record<string, unknown>)
          : {}
      const selectedId =
        typeof display === 'string' || typeof display === 'number' || typeof display === 'boolean'
          ? String(display)
          : (base.id ?? base.name ?? base.label)
      normalized[key] = {
        ...base,
        ...(selectedId !== undefined ? { id: selectedId } : {}),
        candidates: group
      }
    } else {
      normalized[key] = display
    }
  }
  return normalized
}

function unwrapChoiceValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    if (
      typeof record.value === 'string' ||
      typeof record.value === 'number' ||
      typeof record.value === 'boolean'
    ) {
      if (keys.length === 1) return record.value
    }
  }
  return value
}

/**
 * Decide which result stage a confirmation should persist. Upstream stage
 * files map 1:1 to stage names; a WorkWise single-pass
 * `recommendations.stage1.json` that already carries the complete solution
 * (mode + style + page count + production flags) confirms directly to final.
 */
export function classifyPptMasterStage(
  fileName: string,
  recommendations: PptMasterRecommendations
): PptMasterStage {
  if (fileName === 'recommendations.stage3.json') return 'final'
  if (fileName === 'recommendations.stage2.json') return 'stage2'
  if (fileName === 'recommendations.json') return 'final'
  const hasSolution =
    recommendations.mode !== undefined &&
    recommendations.visual_style !== undefined &&
    recommendations.page_count !== undefined
  const hasProduction =
    recommendations.proactive_speaker_notes !== undefined ||
    recommendations.generation_mode !== undefined ||
    recommendations.formula_policy !== undefined
  if (hasSolution && hasProduction) return 'final'
  return 'stage1'
}

export const PPT_CONFIRM_DISPLAY_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'mode', label: '模式' },
  { key: 'visual_style', label: '视觉风格' },
  { key: 'canvas', label: '画布' },
  { key: 'color', label: '配色' },
  { key: 'typography', label: '字体' },
  { key: 'icons', label: '图标库' },
  { key: 'image_usage', label: '图片来源' },
  { key: 'page_count', label: '页数' },
  { key: 'audience', label: '受众' },
  { key: 'communication_intent', label: '沟通意图' },
  { key: 'delivery_context', label: '交付场景' },
  { key: 'content_divergence', label: '内容与源材料差异' },
  { key: 'generation_mode', label: '生成模式' },
  { key: 'formula_policy', label: '公式策略' },
  { key: 'image_ai_path', label: 'AI 图片路径' },
  { key: 'refine_spec', label: '细化规格' },
  { key: 'proactive_speaker_notes', label: '自动演讲备注' },
  { key: 'proactive_custom_animations', label: '自动自定义动画' },
  { key: 'proactive_narration_audio', label: '自动旁白音频' },
  { key: 'core_message', label: '核心信息' },
  { key: 'audience_outcome', label: '受众行动' },
  { key: 'artifact_afterlife', label: '交付物后续用途' }
]

function choiceLabel(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          return String(record.label ?? record.name ?? record.id ?? '')
        }
        return String(item)
      })
      .filter(Boolean)
      .join('、')
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const candidate = record.label ?? record.name ?? record.id ?? record.value
    if (candidate !== undefined && candidate !== null) return String(candidate)
    return JSON.stringify(record)
  }
  return String(value)
}

export function describePptMasterConfirmation(
  result: PptMasterConfirmedResult
): string {
  const parts = PPT_CONFIRM_DISPLAY_FIELDS
    .map(({ key, label }) => {
      const raw = result[key]
      if (raw === undefined || raw === null || raw === '') return null
      const value = choiceLabel(raw)
      if (!value) return null
      return `${label}：${value}`
    })
    .filter((part): part is string => part !== null)
  const stageLabel =
    result.stage === 'stage1'
      ? 'Stage 1'
      : result.stage === 'stage2'
        ? 'Stage 2'
        : ''
  return [
    `已确认 PPT Master 方案${stageLabel ? `（${stageLabel}）` : ''}${result.projectDir ? `（${result.projectDir}）` : ''}：`,
    parts.length > 0 ? parts.join('；') : '按推荐方案执行',
    '确认结果已写入 confirm_ui/result.json，请继续按已确认方案生成 PPTX。'
  ].join(' ')
}

export type PptMasterPendingConfirmation = {
  projectDir: string
  confirmDir: string
  stageFile: string
  stage: PptMasterStage
  recommendations: PptMasterRecommendations
}

const STAGE_RECOMMENDATION_FILES = [
  'recommendations.stage1.json',
  'recommendations.stage2.json',
  'recommendations.stage3.json',
  'recommendations.json'
] as const

export async function findPptMasterPendingConfirmation(
  workspaceRoot: string,
  listDir: (path: string) => Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>>,
  readFile: (path: string) => Promise<string>
): Promise<PptMasterPendingConfirmation | null> {
  const scanned = new Set<string>()

  async function checkConfirmDir(projectDir: string, confirmDir: string): Promise<PptMasterPendingConfirmation | null> {
    if (scanned.has(confirmDir)) return null
    scanned.add(confirmDir)
    let entries: Array<{ name: string; path: string; type: 'file' | 'directory' }> = []
    try {
      entries = await listDir(confirmDir)
    } catch {
      return null
    }
    const resultEntry = entries.find((entry) => entry.type === 'file' && entry.name === 'result.json')
    let confirmedStages = new Set<string>()
    if (resultEntry) {
      try {
        const result = JSON.parse(await readFile(resultEntry.path)) as Record<string, unknown>
        if (result?.status === 'stage1-confirmed') confirmedStages.add('stage1')
        else if (result?.status === 'stage2-confirmed') {
          confirmedStages.add('stage1')
          confirmedStages.add('stage2')
        } else if (result?.status === 'confirmed') {
          confirmedStages.add('stage1')
          confirmedStages.add('stage2')
          confirmedStages.add('stage3')
          confirmedStages.add('final')
        }
      } catch {
        // unreadable result.json is treated as pending below
      }
    }
    for (const fileName of STAGE_RECOMMENDATION_FILES) {
      if (confirmedStages.has(fileName === 'recommendations.json' ? 'final' : fileName.replace('recommendations.', '').replace('.json', ''))) {
        continue
      }
      const stageFile = entries.find((entry) => entry.type === 'file' && entry.name === fileName)
      if (!stageFile) continue
      try {
        const content = await readFile(stageFile.path)
        const raw = JSON.parse(content) as PptMasterRecommendations
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
        const recommendations = normalizePptMasterRecommendations(raw)
        const stage = classifyPptMasterStage(fileName, recommendations)
        return { projectDir, confirmDir, stageFile: fileName, stage, recommendations }
      } catch {
        // continue to the next stage file
      }
    }
    return null
  }

  // Depth 1: <root>/confirm_ui and <root>/<project>/confirm_ui
  let rootEntries: Array<{ name: string; path: string; type: 'file' | 'directory' }> = []
  try {
    rootEntries = await listDir(workspaceRoot)
  } catch {
    return null
  }
  const direct = rootEntries.find((entry) => entry.type === 'directory' && entry.name === 'confirm_ui')
  if (direct) {
    const found = await checkConfirmDir(workspaceRoot, direct.path)
    if (found) return found
  }

  // Depth 2: any subdirectory may contain confirm_ui; prefer projects/<name> first.
  const projectsDir = rootEntries.find((entry) => entry.type === 'directory' && entry.name === 'projects')
  const candidates: string[] = []
  if (projectsDir) {
    try {
      const projectEntries = await listDir(projectsDir.path)
      for (const entry of projectEntries) {
        if (entry.type === 'directory') candidates.push(entry.path)
      }
    } catch {
      // ignore
    }
  }
  for (const entry of rootEntries) {
    if (entry.type === 'directory' && entry.name !== 'projects' && entry.name !== 'confirm_ui') {
      candidates.push(entry.path)
    }
  }
  for (const projectPath of candidates) {
    let entries: Array<{ name: string; path: string; type: 'file' | 'directory' }> = []
    try {
      entries = await listDir(projectPath)
    } catch {
      continue
    }
    const confirmEntry = entries.find((entry) => entry.type === 'directory' && entry.name === 'confirm_ui')
    if (confirmEntry) {
      const found = await checkConfirmDir(projectPath, confirmEntry.path)
      if (found) return found
    }
  }
  return null
}
