/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { callOsApi, prettyJson } from "../lib/os_api"

export default tool({
  description: "Load structured OS project context: project profile, monitor points, latest data, alerts and reports.",
  args: {
    projectId: tool.schema.string().optional().describe("OS project id."),
    projectName: tool.schema.string().optional().describe("Project name fuzzy filter."),
    pointCode: tool.schema.string().optional().describe("Optional monitor point code."),
    limit: tool.schema.number().int().min(1).max(30).optional().describe("Maximum records per section."),
  },
  async execute(args) {
    const data = await callOsApi("/agent-runtime/context/project", {
      query: {
        projectId: args.projectId,
        projectName: args.projectName,
        pointCode: args.pointCode,
        limit: args.limit || 8,
      },
    })
    return prettyJson(data)
  },
})
