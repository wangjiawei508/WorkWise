import { modelCapabilitiesForModel } from '../loop/model-context-profile.js'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_KUN_MODEL, expandHomePath } from './kun-config.js'

describe('expandHomePath', () => {
  it('expands Windows-style home-relative paths', () => {
    expect(expandHomePath('~\\kun\\config.json')).toBe(join(homedir(), 'kun', 'config.json'))
  })

  it('leaves non-home tilde prefixes untouched', () => {
    expect(expandHomePath('~other/config.json')).toBe('~other/config.json')
  })
})

describe('default model capabilities', () => {
  it('uses the official V4.1 Flash id with vision and its documented context window', () => {
    expect(DEFAULT_KUN_MODEL).toBe('deepseek-flash')
    expect(modelCapabilitiesForModel(DEFAULT_KUN_MODEL)).toMatchObject({
      inputModalities: ['text', 'image'],
      supportsToolCalling: true,
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 384_000,
      messageParts: ['text', 'image_url']
    })
  })
})
