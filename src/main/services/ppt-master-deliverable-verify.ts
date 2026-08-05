import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import JSZip from 'jszip'
import type {
  PptMasterDeliverableVerifyRequest,
  PptMasterDeliverableVerifyResult
} from '../../shared/ppt-master-services'

function assertInsideWorkspace(target: string, workspaceRoot: string): void {
  const rel = relative(resolve(workspaceRoot), resolve(target))
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`projectDir escapes the workspace: ${target}`)
  }
}

export async function verifyPptMasterDeliverable(
  request: PptMasterDeliverableVerifyRequest
): Promise<PptMasterDeliverableVerifyResult> {
  const { workspaceRoot, projectDir } = request
  assertInsideWorkspace(projectDir, workspaceRoot)
  const issues: string[] = []

  if (!existsSync(join(projectDir, 'design_spec.md'))) {
    issues.push('缺少 design_spec.md（设计规范）')
  }
  if (!existsSync(join(projectDir, 'spec_lock.md'))) {
    issues.push('缺少 spec_lock.md（执行锁）')
  }

  const svgDir = join(projectDir, 'svg_output')
  const slides = existsSync(svgDir)
    ? (await readdir(svgDir)).filter((name) => /^slide_\d+\.svg$/i.test(name)).sort()
    : []
  const notesDir = join(projectDir, 'notes')
  const noteFiles = existsSync(notesDir)
    ? (await readdir(notesDir)).filter((name) => /^slide_\d+\.md$/i.test(name)).sort()
    : []

  let speakerNotesEnabled = true
  const resultPath = join(projectDir, 'confirm_ui', 'result.json')
  if (existsSync(resultPath)) {
    try {
      const confirmed = JSON.parse(await readFile(resultPath, 'utf8')) as Record<string, unknown>
      if (confirmed.proactive_speaker_notes === false) speakerNotesEnabled = false
    } catch {
      issues.push('confirm_ui/result.json 无法解析')
    }
  } else {
    issues.push('缺少 confirm_ui/result.json（方案未确认）')
  }

  const expectedSlides = slides.length
  const expectedNotes = speakerNotesEnabled ? slides.length : 0
  if (slides.length === 0) issues.push('svg_output 中没有页面 SVG')
  if (speakerNotesEnabled) {
    const missingNotes = slides.filter(
      (slide) => !noteFiles.includes(slide.replace(/\.svg$/i, '.md'))
    )
    if (missingNotes.length > 0) issues.push(`缺少演讲备注：${missingNotes.slice(0, 3).join(', ')}${missingNotes.length > 3 ? ' 等' : ''}`)
  }

  const pptxCandidates: Array<{ name: string; path: string }> = []
  for (const dir of [projectDir, join(projectDir, 'exports')]) {
    if (!existsSync(dir)) continue
    for (const name of await readdir(dir)) {
      if (/\.pptx$/i.test(name) && !name.startsWith('~$')) {
        pptxCandidates.push({ name, path: join(dir, name) })
      }
    }
  }
  let latest: { path: string; size: number; mtimeMs: number } | null = null
  for (const candidate of pptxCandidates) {
    const info = await stat(candidate.path)
    if (!latest || info.mtimeMs > latest.mtimeMs) {
      latest = { path: candidate.path, size: info.size, mtimeMs: info.mtimeMs }
    }
  }

  let slideCount: number | undefined
  let notesCount: number | undefined
  if (latest) {
    try {
      const zip = await JSZip.loadAsync(await readFile(latest.path))
      slideCount = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length
      notesCount = Object.keys(zip.files).filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)).length
    } catch {
      issues.push('最新 .pptx 无法解析（可能不是有效 PPTX）')
    }
    if (slideCount !== undefined && expectedSlides > 0 && slideCount !== expectedSlides) {
      issues.push(`PPTX 页数不匹配：期望 ${expectedSlides}，实际 ${slideCount}`)
    }
    if (speakerNotesEnabled && notesCount !== undefined && notesCount !== (slideCount ?? 0)) {
      issues.push(`演讲备注不完整：PPTX 内 ${notesCount ?? 0} 页备注，共 ${slideCount ?? 0} 页`)
    }
  } else {
    issues.push('项目中没有 .pptx 交付文件')
  }

  return {
    ok: issues.length === 0 && Boolean(latest),
    projectDir,
    verifiedAt: new Date().toISOString(),
    ...(latest
      ? {
          file: {
            path: latest.path,
            size: latest.size,
            modifiedAt: new Date(latest.mtimeMs).toISOString()
          }
        }
      : {}),
    ...(slideCount !== undefined ? { slideCount } : {}),
    ...(notesCount !== undefined ? { notesCount } : {}),
    ...(expectedSlides > 0 ? { expectedSlides } : {}),
    ...(expectedNotes > 0 ? { expectedNotes } : {}),
    issues
  }
}
