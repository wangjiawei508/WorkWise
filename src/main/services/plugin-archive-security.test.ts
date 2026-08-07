import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, it } from 'vitest'
import { extractPluginArchive, inspectPluginArchive } from './plugin-archive-security'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function target(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workwise-plugin-archive-'))
  roots.push(root)
  return join(root, 'extracted')
}

async function archive(configure: (zip: JSZip) => void): Promise<Buffer> {
  const zip = new JSZip()
  configure(zip)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' })
}

describe('plugin archive security', () => {
  it('inspects and extracts a bounded portable archive', async () => {
    const bytes = await archive((zip) => {
      zip.file('workwise.plugin.json', '{}')
      zip.file('skills/example/SKILL.md', '# Example')
      zip.file('bin/tool.sh', '#!/bin/sh\n', { unixPermissions: 0o100755 })
    })
    const inspection = inspectPluginArchive(bytes)
    const output = await target()

    await expect(extractPluginArchive(bytes, output)).resolves.toEqual(inspection)
    expect(inspection.entryCount).toBe(inspection.entries.length)
    expect(inspection.entries.filter((entry) => !entry.directory)).toHaveLength(3)
    await expect(readFile(join(output, 'skills/example/SKILL.md'), 'utf8'))
      .resolves.toBe('# Example')
  })

  it('rejects path traversal, absolute paths, and case-folding collisions', async () => {
    const traversal = await archive((zip) => zip.file('../outside', 'x'))
    expect(() => inspectPluginArchive(traversal)).toThrow(/traversal|unsafe path/i)

    const absolute = await archive((zip) => zip.file('/outside', 'x'))
    expect(() => inspectPluginArchive(absolute)).toThrow(/unsafe path/i)

    const collision = await archive((zip) => {
      zip.file('Skills/Example.md', 'one')
      zip.file('skills/example.md', 'two')
    })
    expect(() => inspectPluginArchive(collision)).toThrow(/colliding/i)
  })

  it('rejects symbolic links and non-portable Windows names', async () => {
    const linked = await archive((zip) => {
      zip.file('target', 'elsewhere', { unixPermissions: 0o120777 })
    })
    expect(() => inspectPluginArchive(linked)).toThrow(/links/i)

    const reserved = await archive((zip) => zip.file('assets/CON.txt', 'x'))
    expect(() => inspectPluginArchive(reserved)).toThrow(/portable/i)
  })

  it('rejects declared decompression bombs before inflation', async () => {
    const bytes = await archive((zip) => zip.file('payload.txt', 'small'))
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    expect(central).toBeGreaterThanOrEqual(0)
    bytes.writeUInt32LE(33 * 1024 * 1024, central + 24)

    expect(() => inspectPluginArchive(bytes)).toThrow(/32 MiB/)
  })

  it('rejects encrypted entries and file-directory conflicts', async () => {
    const encrypted = await archive((zip) => zip.file('payload.txt', 'x'))
    const central = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 0x1, central + 8)
    expect(() => inspectPluginArchive(encrypted)).toThrow(/encrypted/i)

    const conflict = await archive((zip) => {
      zip.file('plugin', 'file')
      zip.file('plugin/child.txt', 'child')
    })
    expect(() => inspectPluginArchive(conflict)).toThrow(/conflict/i)
  })
})
