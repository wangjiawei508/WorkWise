import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { saveDesignAssetToWrite } from './design-write-service'

const tempRoots: string[] = []
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

describe('saveDesignAssetToWrite', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('saves a validated PNG inside the Write workspace and returns a Markdown path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-design-write-'))
    tempRoots.push(root)
    await mkdir(join(root, 'reports'))
    const currentFilePath = join(root, 'reports', 'weekly.md')
    await writeFile(currentFilePath, '# Weekly\n')

    const result = await saveDesignAssetToWrite({
      workspaceRoot: root,
      currentFilePath,
      fileName: '../unsafe cover.png',
      dataBase64: ONE_PIXEL_PNG.toString('base64')
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.markdownPath).toMatch(/^\.\.\/img\/unsafe-cover-[a-f0-9]{8}\.png$/)
    expect(await readFile(result.path)).toEqual(ONE_PIXEL_PNG)
  })

  it('rejects non-PNG data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workwise-design-write-'))
    tempRoots.push(root)
    const currentFilePath = join(root, 'report.md')
    await writeFile(currentFilePath, '# Report\n')

    await expect(saveDesignAssetToWrite({
      workspaceRoot: root,
      currentFilePath,
      fileName: 'bad.png',
      dataBase64: Buffer.from('not a png').toString('base64')
    })).resolves.toEqual({
      ok: false,
      message: 'Design output is not a valid PNG image.'
    })
  })
})
