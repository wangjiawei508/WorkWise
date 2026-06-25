import { describe, expect, it } from 'vitest'
import {
  AGNES_IMAGE_DEFAULT_MODEL,
  AGNES_IMAGE_PROMPT_TEMPLATES,
  AGNES_IMAGE_SIZES,
  fillAgnesImagePrompt,
  isAgnesImageSize,
  variableDefaultsForTemplate
} from './agnes-image'

describe('Agnes image prompt templates', () => {
  it('ships multiple editable prompt templates for writing assets', () => {
    expect(AGNES_IMAGE_DEFAULT_MODEL).toBe('agnes-image-2.1-flash')
    expect(AGNES_IMAGE_PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(5)
    expect(AGNES_IMAGE_PROMPT_TEMPLATES.map((template) => template.id)).toEqual(expect.arrayContaining([
      'engineering-report-cover',
      'monitoring-data-background',
      'construction-ops-diagram',
      'business-writing-illustration',
      'iconic-illustration'
    ]))
  })

  it('fills template variables with defaults or user values', () => {
    const template = AGNES_IMAGE_PROMPT_TEMPLATES[0]!
    const prompt = fillAgnesImagePrompt(template, {
      ...variableDefaultsForTemplate(template),
      主题: '运营期结构长期监测',
      颜色: '白色、蓝绿色、少量金色'
    })

    expect(prompt).toContain('运营期结构长期监测')
    expect(prompt).toContain('白色、蓝绿色、少量金色')
    expect(prompt).not.toMatch(/\{[^}]+\}/)
  })

  it('limits selectable output sizes to supported presets', () => {
    expect(AGNES_IMAGE_SIZES).toContain('1536x1024')
    expect(isAgnesImageSize('1024x1024')).toBe(true)
    expect(isAgnesImageSize('2048x2048')).toBe(false)
  })
})
