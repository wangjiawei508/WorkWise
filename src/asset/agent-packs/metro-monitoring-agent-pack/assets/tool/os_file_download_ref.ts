/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { callOsApi, first, list, obj, prettyJson } from "../lib/os_api"

export default tool({
  description: "Return OS file download references without exposing server filesystem paths.",
  args: {
    fileId: tool.schema.string().describe("OS file id."),
    versionId: tool.schema.string().optional().describe("Optional version id. Defaults to the latest version."),
    dibaoProjectId: tool.schema.string().optional().describe("Dibao project id when creating a dibao project file download reference."),
  },
  async execute(args) {
    if (args.dibaoProjectId) {
      return prettyJson({
        source: "dibao_project_file",
        fileId: args.fileId,
        dibaoProjectId: args.dibaoProjectId,
        downloadUrl: `/api/v1/dibao/task-orders/${encodeURIComponent(args.dibaoProjectId)}/files/${encodeURIComponent(args.fileId)}/download`,
        previewUrl: `/api/v1/dibao/task-orders/${encodeURIComponent(args.dibaoProjectId)}/files/${encodeURIComponent(args.fileId)}/preview`,
        previewTextUrl: `/api/v1/dibao/task-orders/${encodeURIComponent(args.dibaoProjectId)}/files/${encodeURIComponent(args.fileId)}/preview-text`,
        note: "This is an authenticated OS API reference. Let OS UI handle authentication and download.",
      })
    }

    const file = await callOsApi(`/files/${encodeURIComponent(args.fileId)}`)
    const versions = await callOsApi(`/files/${encodeURIComponent(args.fileId)}/versions`)
    const info = obj(file)
    const items = list(versions)
    const latest = args.versionId
      ? items.find((item) => first(item, ["id"]) === args.versionId)
      : items[0] || items.find((item) => first(item, ["id"]) === first(info, ["latest_version_id"]))

    return prettyJson({
      file: {
        id: first(info, ["id"]) || args.fileId,
        title: first(info, ["title"]),
        category: first(info, ["category"]),
        projectId: first(info, ["project_id"]),
        latestVersionId: first(info, ["latest_version_id"]),
      },
      selectedVersion: latest || null,
      downloadUrl: latest
        ? `/api/v1/files/${encodeURIComponent(args.fileId)}/versions/${encodeURIComponent(first(latest, ["id"]))}/download`
        : "",
      note: "This is an OS API download reference. Let OS UI handle authentication and download.",
    })
  },
})
