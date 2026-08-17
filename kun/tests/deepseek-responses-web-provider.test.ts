import { describe, expect, it, vi } from 'vitest'
import {
  DeepSeekResponsesWebProvider,
  isDeepSeekResponsesWebSearchConfig
} from '../src/adapters/tool/deepseek-responses-web-provider.js'

function request() {
  return {
    query: '今天 AI 圈有哪些资讯',
    limit: 3,
    timeoutMs: 5_000,
    signal: new AbortController().signal
  }
}

describe('DeepSeek Responses web provider', () => {
  it('uses the official Responses web_search tool and parses URL citations', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      id: 'resp_1',
      status: 'completed',
      output: [{
        type: 'message',
        content: [{
          type: 'output_text',
          text: '今日资讯摘要',
          annotations: [
            { type: 'url_citation', url: 'https://news.example.com/a', title: '资讯 A' },
            { type: 'url_citation', url: 'https://news.example.com/b', title: '资讯 B' }
          ]
        }]
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const provider = new DeepSeekResponsesWebProvider({
      baseUrl: 'https://api.deepseek.com/beta',
      apiKey: 'sk-sensitive',
      model: 'deepseek-v4-pro',
      fetchImpl: fetchImpl as typeof fetch,
      nowIso: () => '2026-08-13T00:00:00.000Z'
    })

    const results = await provider.search(request())

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/v1/responses')
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: 'deepseek-v4-pro',
      input: '今天 AI 圈有哪些资讯',
      tools: [{ type: 'web_search' }],
      tool_choice: { type: 'web_search' },
      stream: false
    })
    expect(JSON.stringify(body)).not.toContain('sk-sensitive')
    expect(results).toEqual([
      expect.objectContaining({ url: 'https://news.example.com/a', title: '资讯 A', rank: 1 }),
      expect.objectContaining({ url: 'https://news.example.com/b', title: '资讯 B', rank: 2 })
    ])
  })

  it('rejects unofficial providers, retired models, and uncited responses', async () => {
    expect(isDeepSeekResponsesWebSearchConfig({
      baseUrl: 'https://third-party.example/v1', apiKey: 'sk-test', model: 'deepseek-v4-pro'
    })).toBe(false)
    expect(isDeepSeekResponsesWebSearchConfig({
      baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', model: 'deepseek-chat'
    })).toBe(false)

    const provider = new DeepSeekResponsesWebProvider({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-v4-flash',
      fetchImpl: async () => new Response(JSON.stringify({ output_text: '没有引用的回答' }), { status: 200 })
    })
    await expect(provider.search(request())).rejects.toThrow('no cited results')
  })

  it('uses completed open_page calls when DeepSeek omits URL citation annotations', async () => {
    const provider = new DeepSeekResponsesWebProvider({
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-sensitive',
      model: 'deepseek-v4-flash',
      fetchImpl: async () => new Response(JSON.stringify({
        status: 'completed',
        output: [
          {
            type: 'web_search_call',
            status: 'completed',
            action: {
              type: 'open_page',
              url: 'https://news.example.com/current#ws_call_id=call_123'
            }
          },
          {
            type: 'web_search_call',
            status: 'failed',
            action: {
              type: 'open_page',
              url: 'https://failed.example.com/ignored#ws_call_id=call_456'
            }
          },
          {
            type: 'message',
            status: 'completed',
            content: [{
              type: 'output_text',
              annotations: [],
              text: '这是 DeepSeek 联网检索生成的资讯摘要。'
            }]
          }
        ]
      }), { status: 200 }),
      nowIso: () => '2026-08-13T00:00:00.000Z'
    })

    await expect(provider.search(request())).resolves.toEqual([
      expect.objectContaining({
        url: 'https://news.example.com/current',
        snippet: '这是 DeepSeek 联网检索生成的资讯摘要。',
        provider: 'deepseek-responses',
        rank: 1
      })
    ])
  })
})
