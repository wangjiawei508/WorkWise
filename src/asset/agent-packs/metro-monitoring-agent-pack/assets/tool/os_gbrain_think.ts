/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { callOsApi, prettyJson } from "../lib/os_api"

export default tool({
  description: "Ask OS gbrain to synthesize an answer with citations from the governed wiki knowledge base.",
  args: {
    question: tool.schema.string().describe("Question for gbrain."),
    limit: tool.schema.number().int().min(1).max(20).optional().describe("Maximum evidence count."),
    domain: tool.schema.string().optional().describe("Optional wiki domain filter."),
    pageType: tool.schema.string().optional().describe("Optional wiki page type filter."),
    model: tool.schema.string().optional().describe("Optional model override."),
    searchMode: tool.schema.enum(["fast", "balanced", "deep"]).optional().describe("Search depth."),
    answerStyle: tool.schema.enum(["concise", "standard", "detailed"]).optional().describe("Answer style."),
  },
  async execute(args) {
    const data = await callOsApi("/knowledge/gbrain/think", {
      body: {
        question: args.question,
        limit: args.limit || 8,
        domain: args.domain,
        pageType: args.pageType,
        model: args.model || process.env.DEEPSEEK_MODEL,
        searchMode: args.searchMode || "balanced",
        answerStyle: args.answerStyle || "standard",
      },
      timeoutMs: 120_000,
    })
    return prettyJson(data)
  },
})
