/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { callOsApi, prettyJson } from "../lib/os_api"

export default tool({
  description: "Create a PPT generation task through the OS PPT service and return OS task references.",
  args: {
    content: tool.schema.string().describe("Structured PPT outline or markdown content."),
    title: tool.schema.string().optional().describe("PPT title."),
    template: tool.schema.string().optional().describe("Template id, for example railwise_standard or railwise_monitoring."),
    format: tool.schema.enum(["PPT", "Social", "Poster"]).optional().describe("Output format."),
    style: tool.schema.string().optional().describe("Visual style, for example consulting, analytical or professional."),
  },
  async execute(args) {
    const data = await callOsApi("/ppt/custom/generate", {
      body: {
        content: args.content,
        title: args.title || "RAILWISE Agent PPT",
        template: args.template || "railwise_standard",
        format: args.format || "PPT",
        style: args.style || "consulting",
      },
      timeoutMs: 120_000,
    })
    const statusUrl = typeof data?.statusUrl === "string"
      ? data.statusUrl.replace(/^\/api\/ppt\//, "/api/v1/ppt/")
      : data?.taskId
        ? `/api/v1/ppt/tasks/${encodeURIComponent(data.taskId)}/status`
        : ""
    return prettyJson({
      ...data,
      statusUrl,
      downloadUrl: data?.taskId ? `/api/v1/ppt/tasks/${encodeURIComponent(data.taskId)}/download` : "",
      note: "Poll statusUrl in OS. Register the final PPT with os_report_publish after download/upload is available.",
    })
  },
})
