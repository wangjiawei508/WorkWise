import type { TurnItem } from '../contracts/items.js'

const DELIVERABLE_EXTENSIONS = new Set([
  'csv', 'doc', 'docx', 'htm', 'html', 'md', 'markdown', 'odt', 'pdf',
  'ppt', 'pptx', 'rtf', 'txt', 'xls', 'xlsx'
])

const DELIVERY_ACTION_PATTERN =
  /(?:形成|生成|创建|制作|编写|撰写|导出|保存|输出|交付).{0,40}(?:文档|文件|报告|方案|表格|演示|幻灯片|PPT|PDF|Word|Excel|Markdown)|(?:文档|文件|报告|方案|表格|演示|幻灯片|PPT|PDF|Word|Excel|Markdown).{0,40}(?:形成|生成|创建|制作|编写|撰写|导出|保存|输出|交付)|(?:create|write|draft|generate|export|save|deliver).{0,60}(?:document|report|spreadsheet|presentation|markdown|pdf|docx|xlsx|pptx|csv)/i

const EXPLICIT_FILE_PATTERN =
  /(?:^|[\s"'`/\\])[^\s"'`/\\]+\.(?:md|markdown|txt|docx?|odt|rtf|pdf|xlsx?|csv|pptx?|html?)(?:$|[\s"'`,，。；;:：)）])/i

const PROGRESS_ONLY_PATTERN =
  /(?:我(?:先|会|将|来|再|现在|马上|继续)|让我|接下来|现在开始|继续)(?:.{0,80})(?:抓取|收集|查找|检索|查看|整理|梳理|撰写|生成|创建|处理|检查|执行|继续|补充|验证)|(?:i(?:'ll| will)|let me|next[, ]|i am going to|continuing to)(?:.{0,120})(?:fetch|collect|search|review|write|draft|generate|create|process|check|continue|verify)/is

const DELIVERED_RESULT_PATTERN =
  /(?:文档|文件|报告|方案|表格|PPT|PDF|Word|Excel|Markdown).{0,24}(?:已完成|已生成|已创建|已保存|已写入|已导出)|(?:已完成|已生成|已创建|已保存|已写入|已导出).{0,24}(?:文档|文件|报告|方案|表格|PPT|PDF|Word|Excel|Markdown)|(?:document|file|report|spreadsheet|presentation).{0,40}(?:completed|created|generated|saved|written|exported)/i

const PPT_DELIVERABLE_PATTERN =
  /(?:\bpptx?\b|powerpoint|slide deck|presentation|演示文稿|幻灯片|做\s*PPT|生成\s*PPT|PPT\s*Master)/i

const PPT_SPECIFIC_DELIVERABLE_PATTERN =
  /(?:\bpptx?\b|powerpoint|slide deck|演示文稿|幻灯片|做\s*PPT|生成\s*PPT|PPT\s*Master)/i

const HTML_DELIVERABLE_PATTERN =
  /(?:\bhtml?\b|网页演示|web presentation|browser presentation)/i

function pathExtension(value: string): string {
  const name = value.split(/[\\/]/).filter(Boolean).at(-1) ?? value
  if (!name.includes('.')) return ''
  return name.split('.').at(-1)?.toLowerCase() ?? ''
}

function outputPaths(output: unknown): string[] {
  if (!output || typeof output !== 'object') return []
  const raw = output as Record<string, unknown>
  const paths: string[] = []
  for (const key of ['path', 'file', 'absolute_path', 'absolutePath', 'relative_path', 'relativePath']) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) paths.push(value.trim())
  }
  for (const key of ['files', 'generatedFiles']) {
    const entries = raw[key]
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.trim()) {
        paths.push(entry.trim())
        continue
      }
      if (!entry || typeof entry !== 'object') continue
      paths.push(...outputPaths(entry))
    }
  }
  return paths
}

export function promptRequiresFileDeliverable(prompt: string): boolean {
  const normalized = prompt.trim()
  if (!normalized) return false
  return DELIVERY_ACTION_PATTERN.test(normalized) || EXPLICIT_FILE_PATTERN.test(normalized)
}

export function requiredFileExtensionsForPrompt(prompt: string): readonly string[] | undefined {
  if (HTML_DELIVERABLE_PATTERN.test(prompt) && !PPT_SPECIFIC_DELIVERABLE_PATTERN.test(prompt)) {
    return undefined
  }
  if (PPT_DELIVERABLE_PATTERN.test(prompt)) return ['ppt', 'pptx']
  return undefined
}

export function hasSuccessfulFileDeliverable(
  items: readonly TurnItem[],
  turnId: string,
  prompt = ''
): boolean {
  const requiredExtensions = requiredFileExtensionsForPrompt(prompt)
  return items.some((item) =>
    item.turnId === turnId &&
    item.kind === 'tool_result' &&
    item.status === 'completed' &&
    item.isError !== true &&
    outputPaths(item.output).some((path) => {
      const extension = pathExtension(path)
      return requiredExtensions
        ? requiredExtensions.includes(extension)
        : DELIVERABLE_EXTENSIONS.has(extension)
    })
  )
}

export function looksLikeProgressOnlyReply(text: string): boolean {
  const normalized = text.trim()
  if (!normalized || normalized.length > 1_200) return false
  if (DELIVERED_RESULT_PATTERN.test(normalized)) return false
  return PROGRESS_ONLY_PATTERN.test(normalized)
}

export function latestTurnAssistantText(items: readonly TurnItem[], turnId: string): string {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item?.turnId === turnId && item.kind === 'assistant_text' && item.text.trim()) {
      return item.text.trim()
    }
  }
  return ''
}

export function incompleteTurnContinuationInstruction(input: {
  requiresFileDeliverable: boolean
  hasFileDeliverable: boolean
  previousAssistantText: string
  requiredFileExtensions?: readonly string[]
}): string | null {
  if (input.requiresFileDeliverable && !input.hasFileDeliverable) {
    const requiredTypeInstruction = input.requiredFileExtensions?.length
      ? `The requested deliverable must be a ${input.requiredFileExtensions.map((extension) => `.${extension}`).join(' or ')} file. HTML, an outline, or a preview alone does not satisfy this request.`
      : ''
    return [
      'The user explicitly requested a file deliverable, but this turn has not produced one yet.',
      requiredTypeInstruction,
      'Continue the task now. Use an available file-writing tool to save the completed deliverable inside the workspace.',
      'Do not stop after announcing what you will do. After writing the file, verify it and give its exact path.'
    ].filter(Boolean).join(' ')
  }
  if (looksLikeProgressOnlyReply(input.previousAssistantText)) {
    return [
      'The previous assistant reply was only a progress announcement and did not finish the requested work.',
      'Continue executing the task now. Do not stop at another promise or status update; return a concrete result.'
    ].join(' ')
  }
  return null
}
