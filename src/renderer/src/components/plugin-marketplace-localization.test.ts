import { describe, expect, it } from 'vitest'
import { friendlyMarketplaceError, marketplaceText } from './PluginMarketplaceView'

const missing = (key: string): string => key

describe('plugin marketplace localization fallbacks', () => {
  it('uses readable built-in fallbacks instead of unresolved translation keys', () => {
    expect(marketplaceText(missing, 'pluginCliLarkTitle')).toBe('Lark CLI')
    expect(marketplaceText(missing, 'pluginSkillAgentReachTitle')).toBe('Agent Reach')
  })

  it('turns technical Skill and network failures into concise messages', () => {
    expect(
      friendlyMarketplaceError(
        'Unsafe Skill package: file exceeds 1 MiB: assets/reference.pptx.',
        missing
      )
    ).toContain('oversized file')
    expect(friendlyMarketplaceError('TypeError: fetch failed', missing)).toContain(
      'could not be reached'
    )
  })
})
