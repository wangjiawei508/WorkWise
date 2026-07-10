import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultWriteSettings } from '../../shared/app-settings'
import type { WriteInlineCompletionRequest } from '../../shared/write-inline-completion'
import {
  buildKnowledgeQuery,
  clearWriteKnowledgeCache,
  retrieveWriteKnowledgeContext
} from './write-knowledge-service'

function request(): WriteInlineCompletionRequest {
  return {
    prefix: '# 监测方案\n\n本项目沉降监测频率',
    suffix: '',
    currentFilePath: '/客户/秘密项目/方案.md',
    cursor: { line: 3, column: 10 },
    context: {
      language: 'markdown',
      currentLinePrefix: '本项目沉降监测频率',
      currentLineSuffix: '',
      previousLine: '# 监测方案',
      previousNonEmptyLine: '# 监测方案',
      nextLine: '',
      indentation: '',
      signals: {
        list: false, quote: false, heading: false, table: false, atLineEnd: true,
        endsWithSentencePunctuation: false, previousLineEndsWithSentencePunctuation: false,
        prefersNewLineCompletion: false, paragraphBreakOpportunity: false
      }
    },
    policy: { name: 'test', instruction: '', acceptanceCriteria: [], rejectionCriteria: [] },
    preview: { local: '请说明沉降监测频率', documentTail: '此处包含不应上传的完整正文' }
  }
}

let cachePath = ''

beforeEach(() => {
  cachePath = join(tmpdir(), `workwise-kb-${randomUUID()}.json`)
  vi.stubEnv('WORKWISE_KB_CACHE_PATH', cachePath)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  clearWriteKnowledgeCache()
  await rm(cachePath, { force: true })
})

describe('write-knowledge-service', () => {
  it('uses the minimal public API contract and keeps paths and full documents out of the request', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      results: [{
        title: '沉降监测',
        url: 'https://kb.railwise.cn/monitoring/settlement',
        snippet: '监测频率应结合风险和工况确定。',
        score: 0.91
      }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await retrieveWriteKnowledgeContext(request(), defaultWriteSettings().knowledgeBase)

    expect(result.source).toBe('api')
    expect(result.snippets).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.railwise.cn/v1/kb/search')
    const body = String(init.body)
    expect(JSON.parse(body)).toMatchObject({ limit: 3, visibility: 'public' })
    expect(body).not.toContain('/客户/秘密项目')
    expect(body).not.toContain('不应上传的完整正文')
  })

  it('falls back to the static index when the API response violates the contract', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/v1/kb/search')) {
        return new Response(JSON.stringify({ results: [{ title: 'bad', url: 'https://evil.example/x' }] }), { status: 200 })
      }
      return new Response([
        '# RailWise',
        '- [沉降监测方法](https://kb.railwise.cn/monitoring/settlement) (工程监测) - 介绍沉降监测频率和复核要求。',
        '- [其他内容](https://kb.railwise.cn/other) (知识) - 与当前查询无关。'
      ].join('\n'), { status: 200, headers: { ETag: '"kb-v1"' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await retrieveWriteKnowledgeContext(request(), defaultWriteSettings().knowledgeBase)

    expect(result.source).toBe('static')
    expect(result.snippets[0]).toMatchObject({
      title: '沉降监测方法',
      source: 'railwise-static'
    })
    expect(fetchMock.mock.calls.slice(0, 2).map(([url]) => String(url))).toEqual([
      'https://api.railwise.cn/v1/kb/search',
      'https://kb.railwise.cn/llms-full.txt'
    ])
  })

  it('builds a bounded keyword query without file metadata', () => {
    const keywords = buildKnowledgeQuery(request())
    expect(keywords.length).toBeLessThanOrEqual(12)
    expect(keywords.join(' ')).not.toContain('客户')
    expect(keywords.join(' ')).not.toContain('方案.md')
  })
})
