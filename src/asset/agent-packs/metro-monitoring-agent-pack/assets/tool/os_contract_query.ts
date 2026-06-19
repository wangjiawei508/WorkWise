/// <reference path="../env.d.ts" />
import { tool } from "nb-railwise/tool"
import { callOsApi, first, list, num, prettyJson, type Obj } from "../lib/os_api"

function compactContract(item: Obj) {
  const attachments = list(item.attachments)
  return {
    id: first(item, ["id"]),
    contractNo: first(item, ["contractNo", "code"]),
    projectName: first(item, ["projectName", "name"]),
    category: first(item, ["category", "contractCategory"]),
    type: first(item, ["type", "projectType"]),
    status: first(item, ["status"]),
    partyA: first(item, ["partyA"]),
    partyB: first(item, ["partyB"]),
    amount: num(item.amount ?? item.amountYuan),
    paidAmount: num(item.paidAmount),
    unpaidAmount: num(item.unpaidAmount),
    manager: first(item, ["manager"]),
    collectionOwner: first(item, ["collectionOwner"]),
    signDate: first(item, ["signDate"]),
    startDate: first(item, ["startDate"]),
    endDate: first(item, ["endDate"]),
    attachmentCount: attachments.length,
    attachments: attachments.slice(0, 5).map((attachment) => ({
      id: first(attachment, ["id", "fileId", "token"]),
      name: first(attachment, ["name", "fileName", "title"]),
      url: first(attachment, ["url", "downloadUrl"]),
    })),
  }
}

export default tool({
  description: "Query OS finance contracts, including party B, amount, collection status and attachment summaries.",
  args: {
    keyword: tool.schema.string().optional().describe("Keyword for contract number, project name, party A/B or manager."),
    year: tool.schema.string().optional().describe("Contract year filter."),
    manager: tool.schema.string().optional().describe("Manager filter."),
    contractCategory: tool.schema.string().optional().describe("Contract category filter."),
    status: tool.schema.string().optional().describe("Status filter."),
    pendingOnly: tool.schema.boolean().optional().describe("Return pending contracts only."),
    limit: tool.schema.number().int().min(1).max(100).optional().describe("Maximum result count."),
  },
  async execute(args) {
    const data = await callOsApi("/finance/contracts", {
      query: {
        keyword: args.keyword,
        year: args.year,
        manager: args.manager,
        contractCategory: args.contractCategory,
        status: args.status,
        pendingOnly: args.pendingOnly,
        size: args.limit || 20,
      },
    })
    const root = data && typeof data === "object" && !Array.isArray(data) ? data as Obj : null
    const items = root ? list(root.items) : list(data)
    return prettyJson({
      total: root?.total ?? items.length,
      items: items.map(compactContract),
    })
  },
})
