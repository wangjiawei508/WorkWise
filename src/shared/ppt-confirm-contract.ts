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

export type PptMasterConfirmedResult = {
  stage: 'final'
  status: 'confirmed'
  confirmedAt: string
  projectDir?: string
  source: 'workwise-native-panel'
} & Record<string, unknown>

const INTERNAL_RESULT_KEYS = new Set(['stage', 'status', 'confirmedAt', 'projectDir', 'source'])

export function buildPptMasterResult(
  recommendations: PptMasterRecommendations,
  edits: PptMasterConfirmEdits = {},
  projectDir?: string,
  confirmedAt = new Date().toISOString()
): PptMasterConfirmedResult {
  const merged: Record<string, unknown> = { ...recommendations }
  for (const [key, value] of Object.entries(edits)) {
    if (INTERNAL_RESULT_KEYS.has(key)) continue
    if (value === undefined) continue
    merged[key] = value
  }
  return {
    ...merged,
    stage: 'final',
    status: 'confirmed',
    confirmedAt,
    ...(projectDir ? { projectDir } : {}),
    source: 'workwise-native-panel'
  }
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
  return [
    `已确认 PPT Master 方案${result.projectDir ? `（${result.projectDir}）` : ''}：`,
    parts.length > 0 ? parts.join('；') : '按推荐方案执行',
    '确认结果已写入 confirm_ui/result.json，请继续按已确认方案生成 PPTX。'
  ].join(' ')
}

export type PptMasterPendingConfirmation = {
  projectDir: string
  confirmDir: string
  recommendations: PptMasterRecommendations
}

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
    const stageFile = entries.find((entry) => entry.type === 'file' && entry.name === 'recommendations.stage1.json')
    const resultExists = entries.some((entry) => entry.type === 'file' && entry.name === 'result.json')
    if (!stageFile || resultExists) return null
    try {
      const content = await readFile(stageFile.path)
      const recommendations = JSON.parse(content) as PptMasterRecommendations
      if (!recommendations || typeof recommendations !== 'object' || Array.isArray(recommendations)) return null
      return { projectDir, confirmDir, recommendations }
    } catch {
      return null
    }
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
