/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { callOsApi, clipText, prettyJson } from "../lib/os_api"

export default tool({
  description: "Preview OS wiki files or file metadata before using them as agent evidence.",
  args: {
    wikiPath: tool.schema.string().optional().describe("Relative path in the governed wiki."),
    fileId: tool.schema.string().optional().describe("OS file id for archive/NAS metadata."),
    dibaoProjectId: tool.schema.string().optional().describe("Dibao project id when previewing a dibao project file."),
    maxChars: tool.schema.number().int().min(500).max(30000).optional().describe("Maximum preview text length."),
  },
  async execute(args) {
    if (!args.wikiPath && !args.fileId) {
      throw new Error("wikiPath or fileId is required")
    }

    if (args.wikiPath) {
      const data = await callOsApi("/knowledge/wiki/files/content", {
        query: { path: args.wikiPath },
      })
      return clipText(data, args.maxChars || 12000)
    }

    if (args.dibaoProjectId && args.fileId) {
      const data = await callOsApi(
        `/dibao/task-orders/${encodeURIComponent(args.dibaoProjectId)}/files/${encodeURIComponent(args.fileId)}/preview-text`,
      )
      return clipText({
        source: "dibao_project_file",
        dibaoProjectId: args.dibaoProjectId,
        fileId: args.fileId,
        ...data,
        downloadUrl: `/api/v1/dibao/task-orders/${encodeURIComponent(args.dibaoProjectId)}/files/${encodeURIComponent(args.fileId)}/download`,
        previewUrl: `/api/v1/dibao/task-orders/${encodeURIComponent(args.dibaoProjectId)}/files/${encodeURIComponent(args.fileId)}/preview`,
      }, args.maxChars || 12000)
    }

    const data = await callOsApi(`/files/nas-info/${encodeURIComponent(args.fileId || "")}`)
    return prettyJson({
      fileId: args.fileId,
      metadata: data,
      note: "Use the OS UI or the file download endpoint for binary preview/download.",
    })
  },
})
