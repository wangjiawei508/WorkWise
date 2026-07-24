import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const scriptsRoot = resolve(process.cwd(), 'src', 'asset', 'skills', 'tender-master', 'scripts')
const python = process.env.WORKWISE_PYTHON ?? 'python3'
let tempRoot = ''

function run(script: string, args: string[]) {
  return spawnSync(python, [join(scriptsRoot, script), ...args], {
    cwd: tempRoot,
    encoding: 'utf8'
  })
}

beforeAll(() => {
  const version = spawnSync(python, ['--version'], { encoding: 'utf8' })
  if (version.status !== 0) {
    throw new Error(`Python is required for Tender Master script tests: ${version.stderr}`)
  }
  tempRoot = mkdtempSync(join(tmpdir(), 'workwise-tender-master-'))
})

afterAll(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
})

describe('Tender Master local helper scripts', () => {
  it('retains mandatory technical requirements and excludes price scoring', () => {
    const source = join(tempRoot, '招标文件.md')
    const requirementsOut = join(tempRoot, 'key_requirements.json')
    const scoringOut = join(tempRoot, 'scoring_criteria.json')
    writeFileSync(source, [
      '# 招标要求',
      '系统存储容量必须≥500TB，验收时须提供检测报告。',
      '投标人应提供信息安全认证证书。',
      '技术实施方案内容完整得20分。',
      '价格分30分。'
    ].join('\n'), 'utf8')

    expect(run('extract_requirements.py', [source, '--out', requirementsOut]).status).toBe(0)
    const requirements = JSON.parse(readFileSync(requirementsOut, 'utf8')) as Record<string, string[]>
    expect(requirements['技术要求']).toContainEqual(expect.stringContaining('≥500TB'))
    expect(requirements['商务要求']).toContainEqual(expect.stringContaining('验收'))
    expect(requirements['废标风险']).toContainEqual(expect.stringContaining('必须≥500TB'))

    expect(run('extract_scoring.py', [source, '--out', scoringOut]).status).toBe(0)
    const scoring = JSON.parse(readFileSync(scoringOut, 'utf8')) as {
      技术评分项数: number
      分值合计: number
      评分项: Array<{ 原文行: string }>
    }
    expect(scoring.技术评分项数).toBe(1)
    expect(scoring.分值合计).toBe(20)
    expect(scoring.评分项[0]?.原文行).toContain('技术实施方案')
  })

  it('returns a blocker status for unresolved placeholders', () => {
    const requirements = join(tempRoot, 'requirements.md')
    const proposal = join(tempRoot, 'proposal-with-placeholder.md')
    const report = join(tempRoot, 'quality-report.md')
    writeFileSync(requirements, '系统存储容量必须≥500TB，并提供检测报告。', 'utf8')
    writeFileSync(proposal, `${'# 技术响应\n系统存储容量必须≥500TB。\n待补充检测报告。\n'.repeat(30)}`, 'utf8')

    const result = run('bid_quality_check.py', [
      '--workspace', tempRoot,
      '--requirements', requirements,
      '--proposal', proposal,
      '--out', report
    ])
    expect(result.status).toBe(2)
    expect(readFileSync(report, 'utf8')).toContain('**BLOCKER**')
    expect(readFileSync(report, 'utf8')).toContain('待补充')
  })

  it('calculates monitoring fees from supplied values without inventing rates', () => {
    const config = join(tempRoot, 'fee-config.json')
    const output = join(tempRoot, 'fee-output.md')
    writeFileSync(config, JSON.stringify({
      项目名称: '回归测试',
      技术工作费率: 0.2,
      折扣率: 0.5,
      备注: '测试输入',
      监测项目: [{
        项目: '沉降监测',
        计量单位: '点·次',
        数量基准: 2,
        监测次数: 3,
        单价: 100
      }]
    }), 'utf8')

    const result = run('monitoring_fee_estimate.py', ['--config', config, '--out', output])
    expect(result.status).toBe(0)
    const rendered = readFileSync(output, 'utf8')
    expect(rendered).toContain('基础费合计：**600.00** 元')
    expect(rendered).toContain('技术工作费（×20%）：120.00 元')
    expect(rendered).toContain('最终估算报价：360.00 元')
  })

  it('converts text deterministically and produces a real DOCX or an explicit dependency error', async () => {
    const text = join(tempRoot, 'source.txt')
    const markdown = join(tempRoot, 'source.md')
    const docx = join(tempRoot, 'source.docx')
    writeFileSync(text, '# 投标技术方案\n系统存储容量明确响应为500TB。', 'utf8')

    expect(run('convert_to_md.py', [text, '--output', markdown]).status).toBe(0)
    expect(readFileSync(markdown, 'utf8')).toBe(readFileSync(text, 'utf8'))

    const result = run('build_docx.py', [
      markdown,
      '--out', docx,
      '--title', '回归测试投标文件',
      '--company', '测试单位'
    ])
    const hasDocxDependency = spawnSync(python, ['-c', 'import docx'], { encoding: 'utf8' }).status === 0
    if (!hasDocxDependency) {
      expect(result.status).toBe(1)
      expect(`${result.stdout}${result.stderr}`).toContain('缺少 python-docx')
      expect(existsSync(docx)).toBe(false)
      return
    }

    expect(result.status).toBe(0)
    const archive = await JSZip.loadAsync(readFileSync(docx))
    expect(Object.keys(archive.files)).toContain('[Content_Types].xml')
    expect(Object.keys(archive.files)).toContain('word/document.xml')
    expect(readFileSync(docx).byteLength).toBeGreaterThan(1_000)
    expect(basename(docx)).toBe('source.docx')
  })

  it('does not pass a legacy binary DOC file to python-docx when no compatible converter exists', () => {
    const legacyDoc = join(tempRoot, 'legacy.doc')
    const markdown = join(tempRoot, 'legacy.md')
    writeFileSync(legacyDoc, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))

    const result = run('convert_to_md.py', [legacyDoc, '--output', markdown])
    expect(result.status).toBe(1)
    expect(`${result.stdout}${result.stderr}`).toContain('不能由 python-docx 安全解析')
    expect(existsSync(markdown)).toBe(false)
  })

  it('never uses sample prices implicitly and rejects unsafe numeric values', () => {
    const implicitOutput = join(tempRoot, 'implicit-sample.md')
    const implicit = run('monitoring_fee_estimate.py', ['--out', implicitOutput])
    expect(implicit.status).toBe(1)
    expect(`${implicit.stdout}${implicit.stderr}`).toContain('必须提供 --config')
    expect(existsSync(implicitOutput)).toBe(false)

    const config = join(tempRoot, 'unsafe-fee-config.json')
    const output = join(tempRoot, 'unsafe-fee-output.md')
    writeFileSync(config, JSON.stringify({
      项目名称: '无效报价',
      技术工作费率: 0.2,
      折扣率: Number.POSITIVE_INFINITY,
      监测项目: [{
        项目: '沉降监测',
        数量基准: -1,
        监测次数: 3,
        单价: 100
      }]
    }), 'utf8')
    const invalid = run('monitoring_fee_estimate.py', ['--config', config, '--out', output])
    expect(invalid.status).toBe(1)
    expect(`${invalid.stdout}${invalid.stderr}`).toContain('报价配置无效')
    expect(existsSync(output)).toBe(false)
  })

  it('reports missing chapter input instead of silently succeeding', () => {
    const missing = join(tempRoot, 'missing-chapters')
    mkdirSync(missing)
    const result = run('check_word_count.py', ['--chapters', missing])
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('未找到章节文件')
  })

  it.each([
    {
      id: 'goods',
      source: [
        '核心设备存储容量必须≥500TB，须提供原厂检测报告。',
        '项目交付期不超过30日，质保期不少于三年。',
        '货物技术参数响应完整得20分。',
        '价格分30分。'
      ].join('\n'),
      expectedTechnical: '≥500TB',
      expectedBusiness: '交付期',
      expectedScore: 20
    },
    {
      id: 'software-service',
      source: [
        '平台必须支持统一身份认证、审计留痕和不少于1000用户并发。',
        '服务期内应提供7×24小时支持，故障恢复不超过4小时。',
        '软件功能与实施服务方案得25分。',
        '商务评分10分。'
      ].join('\n'),
      expectedTechnical: '1000用户并发',
      expectedBusiness: '服务期',
      expectedScore: 25
    },
    {
      id: 'engineering-monitoring',
      source: [
        '地铁保护区监测必须包含沉降、水平位移和巡视，报警后不得延迟上报。',
        '监测服务期12个月，成果须通过专家验收。',
        '工程监测技术方案得35分。',
        '报价评分25分。'
      ].join('\n'),
      expectedTechnical: '地铁保护区监测',
      expectedBusiness: '服务期',
      expectedScore: 35
    }
  ])('keeps representative $id requirements and technical scoring traceable', ({
    id,
    source,
    expectedTechnical,
    expectedBusiness,
    expectedScore
  }) => {
    const sourcePath = join(tempRoot, `${id}-tender.md`)
    const requirementsOut = join(tempRoot, `${id}-requirements.json`)
    const scoringOut = join(tempRoot, `${id}-scoring.json`)
    const proposalPath = join(tempRoot, `${id}-proposal.md`)
    const qualityOut = join(tempRoot, `${id}-quality.md`)
    writeFileSync(sourcePath, source, 'utf8')

    expect(run('extract_requirements.py', [sourcePath, '--out', requirementsOut]).status).toBe(0)
    const requirements = JSON.parse(readFileSync(requirementsOut, 'utf8')) as Record<string, string[]>
    expect(Object.values(requirements).flat()).toContainEqual(expect.stringContaining(expectedTechnical))
    expect(requirements['商务要求']).toContainEqual(expect.stringContaining(expectedBusiness))

    expect(run('extract_scoring.py', [sourcePath, '--out', scoringOut]).status).toBe(0)
    const scoring = JSON.parse(readFileSync(scoringOut, 'utf8')) as {
      分值合计: number
      评分项: Array<{ 原文行: string }>
    }
    expect(scoring.分值合计).toBe(expectedScore)
    expect(scoring.评分项).toHaveLength(1)

    const technicalRequirements = requirements['技术要求'] ?? []
    const businessRequirements = requirements['商务要求'] ?? []
    writeFileSync(sourcePath, [...technicalRequirements, ...businessRequirements].join('\n'), 'utf8')
    writeFileSync(
      proposalPath,
      [
        '# 技术响应',
        ...technicalRequirements.map((requirement) =>
          `我方满足并逐条响应：${requirement}。已提供检测报告、参数证明、承诺函、人员资质和验收记录作为证据。`
        ),
        ...businessRequirements.map((requirement) =>
          `我方承诺按要求执行：${requirement}。已提供合同、承诺函、人员证书、服务记录和验收材料作为证据。`
        ),
        '本方案按招标条款建立逐项检查记录，并在交付和验收阶段复核全部证据。',
        '本方案所有关键结论均绑定证书、认证、授权、案例、合同和检测报告。'
      ].join('\n\n').repeat(4),
      'utf8'
    )
    const quality = run('bid_quality_check.py', [
      '--workspace', tempRoot,
      '--requirements', sourcePath,
      '--proposal', proposalPath,
      '--out', qualityOut
    ])
    expect(quality.status).toBe(0)
    expect(readFileSync(qualityOut, 'utf8')).toContain('- Blockers: 0')
  })
})
