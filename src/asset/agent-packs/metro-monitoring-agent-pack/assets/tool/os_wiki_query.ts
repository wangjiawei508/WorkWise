/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { callOsApi, prettyJson } from "../lib/os_api"

export default tool({
  description: "Search the OS enterprise wiki and gbrain index for relevant knowledge snippets.",
  args: {
    query: tool.schema.string().describe("Search question or keyword."),
    limit: tool.schema.number().int().min(1).max(20).optional().describe("Maximum result count."),
    domain: tool.schema.string().optional().describe("Optional wiki domain filter."),
    pageType: tool.schema.string().optional().describe("Optional wiki page type filter."),
    searchMode: tool.schema.enum(["fast", "balanced", "deep"]).optional().describe("Search depth."),
  },
  async execute(args) {
    const data = await callOsApi("/knowledge/gbrain/search", {
      query: {
        q: args.query,
        limit: args.limit || 8,
        domain: args.domain,
        pageType: args.pageType,
        searchMode: args.searchMode || "balanced",
      },
    })
    return prettyJson(data)
  },
})
