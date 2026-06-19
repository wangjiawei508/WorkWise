/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { callOsApi, prettyJson } from "../lib/os_api"

export default tool({
  description: "Save reviewed agent conclusions or Q&A back into the governed OS gbrain wiki memory.",
  args: {
    title: tool.schema.string().optional().describe("Wiki memory title."),
    question: tool.schema.string().describe("Original question, task or knowledge gap."),
    answer: tool.schema.string().describe("Reviewed answer or conclusion to preserve."),
    sources: tool.schema.array(tool.schema.unknown()).optional().describe("Optional citation/source list from gbrain or OS tools."),
    evidenceChain: tool.schema.array(tool.schema.unknown()).optional().describe("Optional evidence chain."),
    actionItems: tool.schema.array(tool.schema.unknown()).optional().describe("Optional action items."),
    sync: tool.schema.boolean().optional().describe("Whether to sync native gbrain after saving."),
    dedupe: tool.schema.boolean().optional().describe("Whether to update an existing memory with the same question/title."),
  },
  async execute(args) {
    const data = await callOsApi("/knowledge/gbrain/memorize", {
      body: {
        title: args.title,
        question: args.question,
        answer: args.answer,
        sources: args.sources || [],
        evidenceChain: args.evidenceChain || [],
        actionItems: args.actionItems || [],
        sync: args.sync !== false,
        dedupe: args.dedupe !== false,
        workflow: {
          model: process.env.DEEPSEEK_MODEL || "unknown",
          searchMode: "agent-ingest",
          answerStyleLabel: "Agent reviewed memory",
        },
      },
      timeoutMs: 120_000,
    })
    return prettyJson(data)
  },
})
