import { describe, expect, it } from 'vitest'
import { createDesignPage } from '@shared/design-document'
import {
  designExportFileStem,
  designPageToSvg,
  encodeUtf8Base64
} from './design-export'

describe('Design Phase E export helpers', () => {
  it('creates safe, useful file names', () => {
    expect(designExportFileStem(' 汇报 / 封面:*? ')).toBe('汇报-封面')
    expect(designExportFileStem('...')).toBe('design')
  })

  it('encodes UTF-8 SVG without corrupting Chinese text', () => {
    const source = '<svg><text>中文</text></svg>'
    const encoded = encodeUtf8Base64(source)
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe(source)
  })

  it('serializes the active page as a complete SVG', () => {
    const page = createDesignPage({ format: 'ppt169' })
    expect(designPageToSvg(page)).toContain('viewBox="0 0 1280 720"')
  })

  it('rejects invalid canvas dimensions before SVG or PNG work starts', () => {
    const page = createDesignPage({ format: 'ppt169' })
    page.width = Number.POSITIVE_INFINITY
    expect(() => designPageToSvg(page)).toThrow('positive finite integers')
  })
})
