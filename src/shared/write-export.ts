import type {
  ExportElementStyle,
  ExportElementType
} from './write-export-templates'

export const WRITE_EXPORT_FORMATS = ['html', 'pdf', 'doc', 'docx'] as const

export type WriteExportFormat = (typeof WRITE_EXPORT_FORMATS)[number]

export type WriteExportPayload = {
  path: string
  workspaceRoot?: string
  format: WriteExportFormat
  content: string
  /**
   * 导出模板 id（仅 docx 格式生效）。缺省时用默认模板。
   * 内置模板以 'builtin-' 开头，用户自定义模板为其他 id。
   */
  templateId?: string
  /**
   * 本次导出的临时样式覆盖（仅 docx 格式生效）。
   * 覆盖模板中对应元素的样式字段，不持久化。
   * key 是元素类型（h1/h2/h3/p/table/code），value 是要覆盖的字段。
   */
  styleOverride?: Partial<Record<ExportElementType, Partial<ExportElementStyle>>>
}

export type WriteRichClipboardPayload = {
  path: string
  workspaceRoot?: string
  content: string
}

export type WriteExportResult =
  | {
      ok: true
      path: string
      format: WriteExportFormat
      exportedAt: string
    }
  | {
      ok: false
      canceled: true
      message?: string
    }
  | {
      ok: false
      canceled: false
      message: string
    }

export type WriteRichClipboardResult =
  | {
      ok: true
      copiedAt: string
    }
  | {
      ok: false
      message: string
    }
