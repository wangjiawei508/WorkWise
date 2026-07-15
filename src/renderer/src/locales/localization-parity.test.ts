import { describe, expect, it } from 'vitest'
import enCommon from './en/common.json'
import enSettings from './en/settings.json'
import zhCommon from './zh/common.json'
import zhSettings from './zh/settings.json'

const MARKETPLACE_KEYS = [
  'pluginTabCli',
  'pluginCliTitle',
  'pluginSearchCli',
  'pluginCliLarkTitle',
  'pluginCliLarkDesc',
  'pluginCliOfficeTitle',
  'pluginCliOfficeDesc',
  'pluginCliEgoTitle',
  'pluginCliEgoDesc',
  'pluginSkillAgentReachTitle',
  'pluginSkillAgentReachDesc',
  'pluginSkillIanTitle',
  'pluginSkillIanDesc',
  'pluginSkillGuizangTitle',
  'pluginSkillGuizangDesc',
  'pluginExternalOnly'
] as const

const REQUIRED_CHINESE_NAVIGATION_COPY = {
  code: '编程',
  sidebarSkill: '技能',
  pluginTabSkill: '技能',
  pluginSearchSkill: '搜索技能',
  pluginDetailKindSkill: '技能',
  rightPanelTodo: '待办',
  writeModeLiveShort: '实时',
  writeInlineAgentAskAi: '询问 AI',
  toolActiveSkills: '已启用技能'
} as const

describe('localization resource parity', () => {
  it('keeps Chinese and English namespaces in sync', () => {
    expect(Object.keys(zhCommon).sort()).toEqual(Object.keys(enCommon).sort())
    expect(Object.keys(zhSettings).sort()).toEqual(Object.keys(enSettings).sort())
  })

  it('never exposes built-in marketplace translation keys as labels', () => {
    for (const key of MARKETPLACE_KEYS) {
      expect(zhCommon[key]).not.toBe(key)
      expect(enCommon[key]).not.toBe(key)
      expect(zhCommon[key].trim()).not.toBe('')
      expect(enCommon[key].trim()).not.toBe('')
    }
  })

  it('keeps primary Chinese navigation and actions fully localized', () => {
    for (const [key, expected] of Object.entries(REQUIRED_CHINESE_NAVIGATION_COPY)) {
      expect(zhCommon[key as keyof typeof zhCommon]).toBe(expected)
    }
  })
})
