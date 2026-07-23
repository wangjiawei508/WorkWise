import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  pageToSvgString
} from '../../shared/design-svg-serializer'
import {
  createDesignDocument,
  createDesignElement,
  type DesignPage
} from '../../shared/design-document'

/**
 * C1 导出链路集成测试。
 * 实际把 DesignDocument 序列化为 SVG → 用 svg_quality_checker.py 校验。
 */
const PPT_MASTER_SCRIPTS = join(process.cwd(), 'src', 'asset', 'skills', 'ppt-master', 'scripts')
const QUALITY_CHECKER = join(PPT_MASTER_SCRIPTS, 'svg_quality_checker.py')
const PYTHON = process.env.WORKWISE_PYTHON?.trim() || 'python3'

const skipIfNoScripts = !existsSync(QUALITY_CHECKER) ? describe.skip : describe

skipIfNoScripts('C1 导出集成：svg_quality_checker 验证', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'design-export-check-'))
    // A newly downloaded/quarantined script tree can make the first macOS
    // Python native-module load unusually slow. Warm the exact checker once
    // at suite scope so individual assertions do not time out and overlap.
    execFileSync(PYTHON, [QUALITY_CHECKER, '--help'], {
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 1024 * 1024
    })
  }, 190_000)

  afterAll(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  function writeSvgAndCheck(svgContent: string, useFormat = 'ppt169'): { errors: number; warnings: number } {
    const svgPath = join(tempDir, `slide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.svg`)
    const reportPath = join(tempDir, `report_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`)
    writeFileSync(svgPath, svgContent, 'utf8')
    // PPT Master 4.0's default `final` stage validates a complete multi-page
    // project roster. These cases intentionally validate one serializer page,
    // so use the documented partial-roster stage instead of relying on stale
    // pre-4.0 bytecode left in __pycache__.
    const args = [
      QUALITY_CHECKER,
      svgPath,
      '--stage',
      'first-page',
      '--json',
      '--json-output',
      reportPath
    ]
    if (useFormat) args.push('--format', useFormat)
    let executionError: unknown
    try {
      execFileSync(PYTHON, args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 })
    } catch (error) {
      // checker 非 0 退出也有 JSON 报告
      executionError = error
    }
    if (!existsSync(reportPath)) {
      throw new Error(
        `svg_quality_checker did not produce a report: ${
          executionError instanceof Error ? executionError.message : String(executionError ?? 'unknown error')
        }`
      )
    }
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    return {
      errors: report.summary?.errors ?? 0,
      warnings: report.summary?.warnings ?? 0
    }
  }

  it('空白文档通过 quality_checker', () => {
    const doc = createDesignDocument({ format: 'ppt169' })
    const result = writeSvgAndCheck(pageToSvgString(doc.pages[0]))
    expect(result.errors).toBe(0)
  })

  it('矩形元素通过 quality_checker', () => {
    const doc = createDesignDocument({ format: 'ppt169' })
    const page = doc.pages[0] as DesignPage
    page.elements.push(createDesignElement('rect', { x: 100, y: 100, w: 300, h: 200, fill: '1E3A5F', zIndex: 0 }))
    const result = writeSvgAndCheck(pageToSvgString(page))
    expect(result.errors).toBe(0)
  })

  it('文字元素通过 quality_checker', () => {
    const doc = createDesignDocument({ format: 'ppt169' })
    const page = doc.pages[0] as DesignPage
    page.elements.push(createDesignElement('text', { x: 100, y: 200, w: 400, h: 60, text: '设计文档标题', fontSize: 36, fill: '1A1A2E', zIndex: 0 }))
    const result = writeSvgAndCheck(pageToSvgString(page))
    expect(result.errors).toBe(0)
  })

  it('混合元素通过 quality_checker', () => {
    const doc = createDesignDocument({ format: 'ppt169' })
    const page = doc.pages[0] as DesignPage
    page.elements.push(createDesignElement('rect', { x: 50, y: 50, w: 200, h: 100, fill: 'F5F7FA', zIndex: 0 }))
    page.elements.push(createDesignElement('ellipse', { x: 300, y: 50, w: 150, h: 150, fill: '4A90D9', zIndex: 1 }))
    page.elements.push(createDesignElement('text', { x: 50, y: 250, w: 400, h: 50, text: '综合测试', fontSize: 28, fill: '1A1A2E', zIndex: 2 }))
    page.elements.push(createDesignElement('line', { x: 50, y: 350, w: 500, h: 0, stroke: '888888', strokeWidth: 2, zIndex: 3 }))
    const result = writeSvgAndCheck(pageToSvgString(page))
    expect(result.errors).toBe(0)
  })

  it('不透明度通过 quality_checker', () => {
    const doc = createDesignDocument({ format: 'ppt169' })
    const page = doc.pages[0] as DesignPage
    page.elements.push(createDesignElement('rect', { x: 100, y: 100, w: 200, h: 150, fill: 'FF0000', opacity: 0.5, zIndex: 0 }))
    const result = writeSvgAndCheck(pageToSvgString(page))
    expect(result.errors).toBe(0)
  })

  it('自定义尺寸通过 quality_checker（不传 format）', () => {
    const doc = createDesignDocument({ format: 'custom', customSize: { width: 800, height: 600 } })
    const page = doc.pages[0] as DesignPage
    page.elements.push(createDesignElement('rect', { x: 50, y: 50, w: 200, h: 100, fill: '1E3A5F', zIndex: 0 }))
    const result = writeSvgAndCheck(pageToSvgString(page), '')
    expect(result.errors).toBe(0)
  })
})
