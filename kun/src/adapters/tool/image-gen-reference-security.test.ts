import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildImageGenToolProviders,
  collectReferenceImages,
  normalizedImageOutputPath
} from './image-gen-tool-provider.js'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

let roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('image generation reference path security', () => {
  it('accepts a regular image inside the workspace', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'workwise-image-reference-'))
    roots.push(workspace)
    await mkdir(join(workspace, 'references'))
    await writeFile(join(workspace, 'references', 'source.png'), PNG_1X1)

    const result = await collectReferenceImages(['references/source.png'], workspace, 3)
    expect('images' in result && result.images).toHaveLength(1)
  })

  it('rejects a symlink to an image outside the workspace before reading it', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'workwise-image-workspace-'))
    const outside = await mkdtemp(join(tmpdir(), 'workwise-image-outside-'))
    roots.push(workspace, outside)
    await writeFile(join(outside, 'secret.png'), PNG_1X1)
    await symlink(join(outside, 'secret.png'), join(workspace, 'reference.png'))

    const result = await collectReferenceImages(['reference.png'], workspace, 3)
    expect('error' in result).toBe(true)
    expect(JSON.stringify(result)).toContain('symbolic link')
  })

  it('rejects a path that traverses a symlinked directory', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'workwise-image-workspace-'))
    const outside = await mkdtemp(join(tmpdir(), 'workwise-image-outside-'))
    roots.push(workspace, outside)
    await writeFile(join(outside, 'secret.png'), PNG_1X1)
    await symlink(outside, join(workspace, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')

    const result = await collectReferenceImages(['linked/secret.png'], workspace, 3)
    expect('error' in result).toBe(true)
    expect(JSON.stringify(result)).toContain('symbolic link')
  })
})

describe('image generation output path normalization', () => {
  it('normalizes an allowed requested path to the actual returned image format', () => {
    expect(normalizedImageOutputPath('illustrations/assets/cover.png', 'webp'))
      .toBe('illustrations/assets/cover.webp')
    expect(normalizedImageOutputPath('illustrations/assets/diagram', 'png'))
      .toBe('illustrations/assets/diagram.png')
  })

  it('rejects absolute, escaping, empty-segment and non-image paths', () => {
    expect(normalizedImageOutputPath('/tmp/cover.png', 'png')).toBeNull()
    expect(normalizedImageOutputPath('../cover.png', 'png')).toBeNull()
    expect(normalizedImageOutputPath('illustrations//cover.png', 'png')).toBeNull()
    expect(normalizedImageOutputPath('illustrations/cover.svg', 'png')).toBeNull()
  })

  it('writes a real image to the requested document insertion path', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'workwise-image-output-'))
    roots.push(workspace)
    const controller = new AbortController()
    const built = buildImageGenToolProviders({
      enabled: true,
      protocol: 'openai-images',
      baseUrl: 'https://images.invalid/v1',
      apiKey: 'test-only',
      model: 'fixture-image',
      timeoutMs: 5_000,
      maxReferenceImages: 2
    }, {
      client: {
        id: 'fixture',
        async generate() {
          return { data: PNG_1X1, mimeType: 'image/png' }
        },
        async edit() {
          return { data: PNG_1X1, mimeType: 'image/png' }
        }
      },
      nowIso: () => '2026-07-25T00:00:00.000Z'
    })
    const tool = built.providers[0]?.tools[0]
    expect(tool?.name).toBe('generate_image')

    const result = await tool!.execute({
      prompt: '一张用于投标报告封面的工程监测插图',
      output_path: 'illustrations/assets/cover.png'
    }, {
      threadId: 'thread-image',
      turnId: 'turn-image',
      workspace,
      approvalPolicy: 'auto',
      sandboxMode: 'workspace-write',
      abortSignal: controller.signal,
      awaitApproval: async () => 'allow'
    })

    expect(result.isError).not.toBe(true)
    const output = result.output as {
      files: Array<{ relativePath: string; absolutePath: string; byteSize: number }>
    }
    expect(output.files).toHaveLength(1)
    expect(output.files[0]?.relativePath).toBe('illustrations/assets/cover.png')
    expect(output.files[0]?.absolutePath).toBe(join(workspace, 'illustrations', 'assets', 'cover.png'))
    expect((await stat(output.files[0]!.absolutePath)).size).toBe(PNG_1X1.byteLength)
    expect(await readFile(output.files[0]!.absolutePath)).toEqual(PNG_1X1)
  })
})
