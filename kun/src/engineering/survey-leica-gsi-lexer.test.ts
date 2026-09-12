import { describe, expect, it } from 'vitest'
import { lexLeicaGsi } from './survey-leica-gsi-lexer.js'

const gsi8 = (wi: string, information: string, sign: '+' | '-', data: string): string => {
  expect(data).toHaveLength(8)
  return `${wi}${information}${sign}${data}`
}

const gsi16 = (wi: string, information: string, sign: '+' | '-', data: string): string => {
  expect(data).toHaveLength(16)
  return `${wi}${information}${sign}${data}`
}

describe('Leica GSI physical lexer', () => {
  it('lexes whitespace-separated GSI8 words with exact raw fields and byte offsets', () => {
    const first = gsi8('11', '0001', '+', '00000001')
    const attribute = gsi8('27', 'A0._', '-', 'AB_C.D12')
    const result = lexLeicaGsi(`${first}\t${attribute}\r\n`)

    expect(result).toMatchObject({ state: 'lexed', dataWidth: 8, mode: 'gsi8', diagnostics: [] })
    if (result.state !== 'lexed') throw new Error('expected lexical success')
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({ line: 1, hasGsi16LineMarker: false, rawSnippet: `${first}\t${attribute}` })
    expect(result.words).toHaveLength(2)

    const word = result.words[0]!
    expect(word).toMatchObject({
      kind: 'standard', rawLexeme: first, wi: '11', rawWi: '11', information: '0001', rawInformation: '0001',
      sign: '+', rawSign: '+', data: '00000001', rawData: '00000001', byteOffset: 0, byteLength: 15
    })
    expect(word.fields.wi).toMatchObject({ raw: '11', byteOffset: 0, byteLength: 2, column: 1 })
    expect(word.fields.information).toMatchObject({ raw: '0001', byteOffset: 2, byteLength: 4, column: 3 })
    if (word.kind !== 'standard') throw new Error('expected a standard word')
    expect(word.fields.sign).toMatchObject({ raw: '+', byteOffset: 6, byteLength: 1, column: 7 })
    expect(word.fields.data).toMatchObject({ raw: '00000001', byteOffset: 7, byteLength: 8, column: 8 })

    const nonNumericAttribute = result.words[1]!
    expect(nonNumericAttribute).toMatchObject({ kind: 'standard', rawData: 'AB_C.D12', data: 'AB_C.D12', information: 'A0._', byteOffset: 16 })
    expect('value' in nonNumericAttribute).toBe(false)
  })

  it('preserves vendor-exported question-mark placeholders as opaque payloads', () => {
    const placeholder = gsi8('41', '0001', '+', '?......4')
    const result = lexLeicaGsi(`${placeholder}\r\n`)

    expect(result).toMatchObject({ state: 'lexed', dataWidth: 8, mode: 'gsi8', diagnostics: [] })
    if (result.state !== 'lexed') throw new Error('expected lexical success')
    expect(result.words[0]).toMatchObject({ wi: '41', rawData: '?......4', data: '?......4' })
  })

  it('lexes GSI16 and preserves its legal line-start marker separately from the first word', () => {
    const first = gsi16('11', '0001', '+', '0000000000000001')
    const second = gsi16('21', '0001', '-', 'ATTR000000000001')
    const result = lexLeicaGsi(`*${first} ${second}\n`)

    expect(result).toMatchObject({ state: 'lexed', dataWidth: 16, mode: 'gsi16' })
    if (result.state !== 'lexed') throw new Error('expected lexical success')
    expect(result.records[0]).toMatchObject({ hasGsi16LineMarker: true, marker: { byteOffset: 0, byteLength: 1, rawSnippet: '*' } })
    expect(result.words.map((word) => word.rawLexeme)).toEqual([first, second])
    expect(result.words[0]).toMatchObject({ kind: 'standard', byteOffset: 1, dataWidth: 16, rawData: '0000000000000001' })
    expect(result.words[1]).toMatchObject({ kind: 'standard', dataWidth: 16, rawSign: '-', rawData: 'ATTR000000000001' })
  })

  it('represents WI51 as two opaque signed components without interpreting either value', () => {
    const result = lexLeicaGsi(`${gsi8('11', '0001', '+', '00000001')} 51....+0220+002\n`)

    expect(result).toMatchObject({ state: 'lexed', mode: 'gsi8' })
    if (result.state !== 'lexed') throw new Error('expected lexical success')
    const wi51 = result.words[1]!
    expect(wi51).toMatchObject({
      kind: 'wi51', wi: '51', rawWi: '51', information: '....', rawLexeme: '51....+0220+002',
      components: [
        { rawSign: '+', rawData: '0220', fields: { sign: { byteOffset: 22 }, data: { byteOffset: 23 } } },
        { rawSign: '+', rawData: '002', fields: { sign: { byteOffset: 27 }, data: { byteOffset: 28 } } }
      ]
    })
    expect('value' in wi51).toBe(false)
  })

  it('accepts CR-only physical record separators and preserves line/byte anchors', () => {
    const first = gsi8('11', '0001', '+', '00000001')
    const second = gsi8('21', '0001', '+', '00000002')
    const source = `${first}\r${second}\r`
    const result = lexLeicaGsi(source)

    expect(result).toMatchObject({ state: 'lexed', dataWidth: 8, mode: 'gsi8' })
    if (result.state !== 'lexed') throw new Error('expected lexical success')
    expect(result.records).toHaveLength(2)
    expect(result.records.map((record) => record.line)).toEqual([1, 2])
    expect(result.records.map((record) => record.rawOffset)).toEqual([0, first.length + 1])
    expect(result.records.map((record) => record.rawLength)).toEqual([first.length, second.length])
  })

  it('blocks a WI51 word that has only one signed component', () => {
    const result = lexLeicaGsi(`${gsi8('11', '0001', '+', '00000001')} 51....+0220\n`)

    expect(result).toMatchObject({
      state: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'invalid-word', severity: 'blocking' })]
    })
    expect(result.words).toEqual([])
    expect(result.records).toEqual([])
  })

  it('fails closed on mixed widths and never exposes a lexical prefix', () => {
    const result = lexLeicaGsi(`${gsi8('11', '0001', '+', '00000001')} ${gsi16('21', '0001', '+', '0000000000000001')}`)

    expect(result).toMatchObject({ state: 'blocked', diagnostics: [expect.objectContaining({ code: 'mixed-data-width', severity: 'blocking', recoverable: true })] })
    expect(result.words).toEqual([])
    expect(result.records).toEqual([])
  })

  it.each([
    ['truncated word', `${'110001+0000'}`, 'truncated-word'],
    ['invalid WI', `${'1X0001+00000000'}`, 'invalid-word'],
    ['illegal data character', `${'110001+0000!001'}`, 'illegal-character'],
    ['unsafe comma delimiter', `${gsi8('11', '0001', '+', '00000001')},${gsi8('21', '0001', '+', '00000002')}`, 'unsafe-separator'],
    ['standalone line marker', '* 110001+00000001', 'invalid-gsi16-marker'],
    ['middle line marker', `${gsi16('11', '0001', '+', '0000000000000001')} *${gsi16('21', '0001', '+', '0000000000000002')}`, 'invalid-gsi16-marker'],
    ['truncated measurement word', '331.08+0012613', 'truncated-word']
  ])('returns a typed blocking diagnostic for %s', (_caseName, source, code) => {
    const result = lexLeicaGsi(source)
    expect(result).toMatchObject({ state: 'blocked', diagnostics: [expect.objectContaining({ code, severity: 'blocking', recoverable: true })] })
    expect(result.words).toEqual([])
    expect(result.records).toEqual([])
  })

  it('rejects non-ASCII bytes transactionally without decoding or exposing preceding words', () => {
    const bytes = new TextEncoder().encode(`${gsi8('11', '0001', '+', '00000001')}\né`)
    const result = lexLeicaGsi(bytes)

    expect(result).toMatchObject({
      state: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'non-ascii', severity: 'blocking' })]
    })
    expect(result.diagnostics[0]?.anchor.byteOffset).toBe(Buffer.byteLength(`${gsi8('11', '0001', '+', '00000001')}\n`))
    expect(result.words).toEqual([])
    expect(result.records).toEqual([])
  })

  it('does not infer a file mode from a WI51-only source without a standard word or GSI16 marker', () => {
    const result = lexLeicaGsi('51....+0220+002\n')
    expect(result).toMatchObject({ state: 'blocked', diagnostics: [expect.objectContaining({ code: 'data-width-undetermined' })] })
    expect(result.words).toEqual([])
  })
})
