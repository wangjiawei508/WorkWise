import { describe, expect, it } from 'vitest'
import { identifyCosaFileGroups, type SurveyFileDescriptor } from './survey-file-groups.js'

function file(name: string, sha256: string, size: number): SurveyFileDescriptor {
  return { name, sha256, size }
}

describe('identifyCosaFileGroups', () => {
  it('associates a normal same-stem input, companion, and result set without reading source content', () => {
    const result = identifyCosaFileGroups([
      file('control.OU2', 'ou2-hash', 15),
      file('control.OU1', 'ou1-hash', 14),
      file('control.NET', 'net-hash', 12),
      file('control.XYO', 'xyo-hash', 13),
      file('control.in1', 'in1-hash', 10),
      file('control.in2', 'in2-hash', 11),
      file('unrelated.csv', 'csv-hash', 14)
    ])

    expect(result.diagnostics).toEqual([])
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]).toMatchObject({
      id: 'cosa:control',
      family: 'cosa',
      normalizedStem: 'control',
      normalizedDirectory: '',
      state: 'ready'
    })
    expect(result.groups[0]?.members).toEqual({
      in1: [file('control.in1', 'in1-hash', 10)],
      in2: [file('control.in2', 'in2-hash', 11)],
      net: [file('control.NET', 'net-hash', 12)],
      xyo: [file('control.XYO', 'xyo-hash', 13)],
      ou1: [file('control.OU1', 'ou1-hash', 14)],
      ou2: [file('control.OU2', 'ou2-hash', 15)]
    })
    expect(result.groups[0]?.memberRoles).toEqual({
      in1: 'height-observation-input',
      in2: 'plane-observation-input',
      net: 'plane-topology-companion',
      xyo: 'plane-coordinate-companion',
      ou1: 'height-result-comparison',
      ou2: 'plane-result-comparison'
    })
  })

  it('blocks an orphan NET auxiliary member and gives a recoverable action', () => {
    const result = identifyCosaFileGroups([file('level.NET', 'net-hash', 12)])

    expect(result.groups[0]).toMatchObject({ state: 'blocked' })
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'cosa_orphan_auxiliary',
        severity: 'blocking',
        memberKind: 'net',
        suggestedAction: expect.stringContaining('.in2')
      })
    ])
  })

  it('blocks duplicate companion members instead of choosing one arbitrarily', () => {
    const input = [
      file('control.in2', 'in2-hash', 11),
      file('control.NET', 'net-first', 12),
      file('CONTROL.net', 'net-second', 13)
    ]
    const result = identifyCosaFileGroups(input)

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.state).toBe('blocked')
    expect(result.groups[0]?.members.net).toEqual([
      file('CONTROL.net', 'net-second', 13),
      file('control.NET', 'net-first', 12)
    ])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'cosa_duplicate_member',
        severity: 'blocking',
        memberKind: 'net',
        files: expect.arrayContaining([file('control.NET', 'net-first', 12), file('CONTROL.net', 'net-second', 13)]),
        suggestedAction: expect.stringContaining('仅保留一个')
      })
    ])
    expect(identifyCosaFileGroups([...input].reverse())).toEqual(result)
  })

  it('normalizes case and caller-supplied path separators without touching the filesystem', () => {
    const result = identifyCosaFileGroups([
      file('Project/Control.IN1', 'in1-hash', 10),
      file('Project/Control.IN2', 'in2-hash', 11),
      file('project\\control.net', 'net-hash', 12),
      file('PROJECT/CONTROL.xYo', 'xyo-hash', 13),
      file('PROJECT/control.ou1', 'ou1-hash', 14),
      file('project/control.OU2', 'ou2-hash', 15)
    ])

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]).toMatchObject({
      id: 'cosa:project/control',
      normalizedDirectory: 'project',
      normalizedStem: 'control',
      state: 'ready'
    })
  })

  it('keeps different stems separate even when their member suffixes overlap', () => {
    const result = identifyCosaFileGroups([
      file('alpha.in2', 'alpha-in2', 11),
      file('alpha.NET', 'alpha-net', 12),
      file('beta.in2', 'beta-in2', 13),
      file('beta.XYO', 'beta-xyo', 14)
    ])

    expect(result.diagnostics).toEqual([])
    expect(result.groups.map((group) => group.id)).toEqual(['cosa:alpha', 'cosa:beta'])
    expect(result.groups[0]?.members.xyo).toEqual([])
    expect(result.groups[1]?.members.net).toEqual([])
    expect(result.groups.every((group) => group.state === 'ready')).toBe(true)
  })

  it('allows an input file without an optional result or topology companion', () => {
    const result = identifyCosaFileGroups([
      file('level.in1', 'in1-hash', 10),
      file('plane.in2', 'in2-hash', 11)
    ])

    expect(result.diagnostics).toEqual([])
    expect(result.groups.map((group) => [group.id, group.state])).toEqual([
      ['cosa:level', 'ready'],
      ['cosa:plane', 'ready']
    ])
  })

  it('blocks orphan result files and names their required input without inferring source semantics', () => {
    const result = identifyCosaFileGroups([
      file('height.ou1', 'ou1-hash', 14),
      file('plane.OU2', 'ou2-hash', 15)
    ])

    expect(result.groups.map((group) => group.state)).toEqual(['blocked', 'blocked'])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'cosa_orphan_result',
        memberKind: 'ou1',
        requiredPrimaryMemberKind: 'in1',
        suggestedAction: expect.stringContaining('.in1')
      }),
      expect.objectContaining({
        code: 'cosa_orphan_result',
        memberKind: 'ou2',
        requiredPrimaryMemberKind: 'in2',
        suggestedAction: expect.stringContaining('.in2')
      })
    ])
  })

  it('blocks duplicate input or result members instead of selecting a source or result by name', () => {
    const result = identifyCosaFileGroups([
      file('level.in1', 'in1-first', 10),
      file('LEVEL.IN1', 'in1-second', 11),
      file('level.ou1', 'ou1-first', 12),
      file('LEVEL.OU1', 'ou1-second', 13)
    ])

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.state).toBe('blocked')
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'cosa_duplicate_member', memberKind: 'in1' }),
      expect.objectContaining({ code: 'cosa_duplicate_member', memberKind: 'ou1' })
    ])
  })
})
