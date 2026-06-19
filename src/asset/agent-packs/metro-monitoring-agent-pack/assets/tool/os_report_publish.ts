/// <reference path="../env.d.ts" />
import { tool, type ToolContext } from "nb-railwise/tool"
import { callOsApi, prettyJson } from "../lib/os_api"

export default tool({
  description: "Register a generated report or artifact back into OS agent runtime history.",
  args: {
    runtimeSessionId: tool.schema.string().optional().describe("Runtime session id. Defaults to current RAILWISE session."),
    name: tool.schema.string().describe("Artifact display name."),
    artifactType: tool.schema.string().optional().describe("Artifact type, for example markdown, docx, xlsx or json."),
    path: tool.schema.string().optional().describe("Artifact path in the agent workspace."),
    fileId: tool.schema.string().optional().describe("Optional OS file id if already uploaded."),
    size: tool.schema.number().int().min(0).optional().describe("Artifact size in bytes."),
  },
  async execute(args, context: ToolContext) {
    const data = await callOsApi("/agent-runtime/artifacts", {
      body: {
        runtimeSessionId: args.runtimeSessionId || context.sessionID,
        name: args.name,
        artifactType: args.artifactType || "artifact",
        path: args.path || "",
        fileId: args.fileId || "",
        size: args.size || 0,
      },
    })
    return prettyJson(data)
  },
})
