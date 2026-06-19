/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { callOsApi, first, list, num, obj, prettyJson, type Obj } from "../lib/os_api"

function compactFile(file: Obj) {
  return {
    id: first(file, ["id"]),
    name: first(file, ["name", "title", "fileName"]),
    groupName: first(file, ["groupName"]),
    category: first(file, ["category", "type"]),
    exists: Boolean(file.exists),
    size: num(file.fileSize || file.size),
    createdAt: first(file, ["createdAt"]),
    remark: first(file, ["remark"]),
    previewUrl: first(file, ["previewUrl"]),
    downloadUrl: first(file, ["downloadUrl"]),
  }
}

function compactProject(project: Obj) {
  return {
    id: first(project, ["id"]),
    name: first(project, ["name", "projectName"]),
    code: first(project, ["code"]),
    status: first(project, ["status"]),
    lineName: first(project, ["lineName", "line_name"]),
    section: first(project, ["section"]),
  }
}

export default tool({
  description: "List dibao project files so agents can preview or reference project materials, including Yongfeng Bridge.",
  args: {
    projectId: tool.schema.string().optional().describe("Dibao project id."),
    projectName: tool.schema.string().optional().describe("Project name keyword, for example Yongfeng Bridge / 永丰桥."),
    groupName: tool.schema.string().optional().describe("Optional archive group filter."),
    limit: tool.schema.number().int().min(1).max(80).optional().describe("Maximum file count."),
  },
  async execute(args) {
    let projectId = args.projectId || ""
    let project: Obj | null = null

    if (!projectId) {
      const projectList = await callOsApi("/dibao/task-orders", {
        query: { keyword: args.projectName || "永丰桥", size: 10 },
      })
      const root = obj(projectList)
      const projects = root ? list(root.items).concat(list(root.list)) : list(projectList)
      project = projects[0] || null
      projectId = first(project, ["id"])
    }

    if (!projectId) {
      return prettyJson({
        project: null,
        files: [],
        note: "No dibao project matched the given query.",
      })
    }

    const production = await callOsApi(`/dibao/task-orders/${encodeURIComponent(projectId)}/production`)
    const root = obj(production)
    const files = list(root?.files)
    const filtered = args.groupName
      ? files.filter((file) => first(file, ["groupName", "type"]).includes(String(args.groupName)))
      : files

    return prettyJson({
      project: compactProject(obj(root?.project) || project || { id: projectId, name: args.projectName || "" }),
      fileCount: filtered.length,
      files: filtered.slice(0, args.limit || 30).map(compactFile),
      note: "Use os_file_preview with dibaoProjectId + fileId to read text preview, or os_file_download_ref to create a download reference.",
    })
  },
})
