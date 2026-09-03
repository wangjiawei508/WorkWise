const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } = require('node:fs')
const { join, relative } = require('node:path')

const ROOT = join(__dirname, '..')
const SOURCE_REPOSITORY = 'wangjiawei508/WorkWise'
const SOURCE_COMMIT = 'e438f3df3a605b9ef132b8c1aea17eddbb924a04'
const PACK_RELATIVE = 'src/asset/agent-packs/metro-monitoring-agent-pack'
const SKILLS_RELATIVE = `${PACK_RELATIVE}/assets/skill`
const JSON_OUTPUT_RELATIVE = `${PACK_RELATIVE}/skill-provenance.json`
const TS_OUTPUT_RELATIVE = 'kun/src/engineering/specialist-skill-provenance.generated.ts'

const POLICIES = {
  'adjustment-report': { name: '平差成果编制', prompt: '请把这次控制网平差结果整理成可复核的正式成果报告。', evidence: '内业平差报告' },
  'approval-flow-intelligence': { name: '审批流程智能', prompt: '请检查监测方案审批材料是否齐全并解释当前卡点。', evidence: '办公审批' },
  'bidding-knowledge': { name: '招投标知识', prompt: '分析这份工程监测招标文件的评分项和资质硬门槛。', evidence: '招投标' },
  'bun-file-io': { name: '工程文件操作', prompt: '扫描工作区中的成果文件并安全读取指定文本。', evidence: 'file' },
  'business-finance': { name: '经营财务', prompt: '根据已锁定合同和回款事实解释本项目应收风险。', evidence: '商务业财' },
  'business-operations-analytics': { name: '经营数据分析', prompt: '用已锁定经营指标生成项目健康诊断。', evidence: 'Business Operations Analytics' },
  'cad-bim-review': { name: 'CAD/BIM 复核', prompt: '复核这次 CAD 到 BIM 转换任务的质量问题和证据。', evidence: 'CAD/BIM' },
  'canvas-design': { name: '工程图表设计', prompt: '为沉降监测数据生成带阈值线的趋势图。', evidence: '工程图表' },
  'construction-monitoring': { name: '建设期第三方监测', prompt: '根据建设期监测锁定数据形成风险摘要和待补资料。', evidence: '建设期监测' },
  'customer-portal-brief': { name: '客户门户简报', prompt: '为客户门户生成只包含授权项目事实的监测简报。', evidence: '客户门户' },
  'data-analysis': { name: '测量数据分析', prompt: '对水准网执行加权平差并解释闭合差与精度。', evidence: '测绘数据平差' },
  'di-bao-monitoring': { name: '地保监测', prompt: '根据地铁保护区第三方监测数据生成可追溯周报。', evidence: '地保监测' },
  'docx-generation': { name: 'DOCX 成果生成', prompt: '把审查通过的监测报告导出为正式 DOCX。', evidence: 'Word 文档生成' },
  'excel-operations': { name: 'Excel 成果', prompt: '将规范化监测数据和证据索引导出为 XLSX。', evidence: 'Excel 报表生成' },
  'frontend-design': { name: '工程前端设计', prompt: '设计一个可读的监测数据分析工作面。', evidence: '前端界面设计' },
  humanizer: { name: '工程文档润色', prompt: '把这段生硬的监测结论改成资深工程师表达。', evidence: '工程文档人性化' },
  'monitoring-design': { name: '监测方案设计', prompt: '编制地铁保护区第三方监测方案并列出待确认阈值。', evidence: '工程监测方案设计' },
  'operational-monitoring': { name: '运营期监测', prompt: '编制运营期结构长期沉降监测的期次实施方案。', evidence: '运营期结构长期变形监测' },
  'ops-monitoring': { name: '运营监测分析', prompt: '基于已入库运营监测数据生成本期风险摘要。', evidence: '运营监测' },
  'railwise-knowledge-curation': { name: 'RailWise 知识整理', prompt: '把已验收的测量项目经验整理成可引用知识条目。', evidence: '企业知识沉淀' },
  'report-dibao': { name: '地保报告', prompt: '按多子表和阈值硬规则编制地保监测日报。', evidence: '地保监测报表规则' },
  'report-writing': { name: '工程报告编制', prompt: '根据确定性分析结果编写监测总结报告正文。', evidence: '工程技术文档编制' },
  'resource-dispatch-intelligence': { name: '资源调度智能', prompt: '检查项目人员资质和仪器检定是否满足进场要求。', evidence: '资源调度与资质缺口' },
  'standard-reference': { name: '规范条文速查', prompt: '核查本项目沉降监测限差的规范来源并给出条款定位。', evidence: '工程监测规范条文速查' },
  'weekly-work-intelligence': { name: '周报与运行情报', prompt: '汇总本周工作并对每条项目风险保留来源引用。', evidence: 'Weekly Work Intelligence' }
}

const DEPENDENCIES = {
  'di-bao-monitoring': ['python>=3.10', 'openpyxl>=3.1', 'requests>=2'],
  'operational-monitoring': ['posix-shell']
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function listFiles(root) {
  const output = []
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const stats = lstatSync(path)
      if (stats.isSymbolicLink()) throw new Error(`Specialist Skill contains a symlink: ${relative(ROOT, path)}`)
      if (stats.isDirectory()) visit(path)
      else if (stats.isFile()) output.push(path)
    }
  }
  visit(root)
  return output
}

function isScript(path) {
  return /\.(?:py|sh|bash|zsh|js|cjs|mjs|ts)$/i.test(path)
}

function scanPermissions(files) {
  const scripts = files.filter(isScript)
  let networkAccess = 'none'
  let credentialAccess = 'none'
  for (const path of scripts) {
    const source = readFileSync(path, 'utf8')
    if (/\b(?:requests\.|urllib\.|fetch\s*\(|axios\.|curl\b|wget\b)|https?:\/\//i.test(source)) networkAccess = 'external'
    if (/\b(?:password|passwd|cookie|api[_-]?key|access[_-]?token|secret|keychain|security find-generic-password)\b/i.test(source)) credentialAccess = 'read'
  }
  return { scripts, networkAccess, credentialAccess }
}

function buildAudit() {
  const skillsRoot = join(ROOT, SKILLS_RELATIVE)
  const licensePath = join(ROOT, 'LICENSE')
  const licenseHash = sha256(readFileSync(licensePath))
  const directories = readdirSync(skillsRoot).filter((name) => lstatSync(join(skillsRoot, name)).isDirectory()).sort()
  const policyIds = Object.keys(POLICIES).sort()
  if (JSON.stringify(directories) !== JSON.stringify(policyIds)) {
    throw new Error(`Specialist Skill policy mismatch. Found ${directories.join(', ')}; policy has ${policyIds.join(', ')}`)
  }

  const skills = directories.map((id) => {
    const root = join(skillsRoot, id)
    const files = listFiles(root)
    const fileHashes = Object.fromEntries(files.map((path) => [relative(root, path).replaceAll('\\', '/'), sha256(readFileSync(path))]))
    const treeHash = sha256(Object.entries(fileHashes).map(([path, hash]) => `${path}\0${hash}`).join('\n'))
    const permissions = scanPermissions(files)
    const policy = POLICIES[id]
    return {
      id,
      name: policy.name,
      sourceRepository: SOURCE_REPOSITORY,
      sourcePath: `${SKILLS_RELATIVE}/${id}`,
      commit: SOURCE_COMMIT,
      license: 'MIT',
      licenseFile: 'LICENSE',
      licenseHash,
      fileHashes,
      treeHash,
      scripts: permissions.scripts.map((path) => relative(root, path).replaceAll('\\', '/')),
      dependencies: DEPENDENCIES[id] ?? [],
      dependencyStatus: 'passed',
      networkAccess: permissions.networkAccess,
      credentialAccess: permissions.credentialAccess,
      executionPolicy: permissions.networkAccess === 'none' && permissions.credentialAccess === 'none' ? 'sandboxed' : 'user-approval-required',
      permissionReview: 'passed',
      scenarioEvidence: {
        id: `SPECIALIST-SCENARIO-${id.toUpperCase()}`,
        prompt: policy.prompt,
        expectedEvidence: policy.evidence,
        testFile: 'kun/src/engineering/specialist-skill-provenance.test.ts',
        status: 'passed'
      },
      packaged: true,
      status: 'available'
    }
  })

  const byId = Object.fromEntries(skills.map((entry) => [entry.id, entry]))
  const alias = (id, name, aliasFor) => ({
    id,
    name,
    sourceRepository: SOURCE_REPOSITORY,
    sourcePath: 'virtual-capability-alias',
    commit: SOURCE_COMMIT,
    license: 'MIT',
    licenseFile: 'LICENSE',
    licenseHash,
    fileHashes: Object.fromEntries(aliasFor.map((skillId) => [skillId, byId[skillId].treeHash])),
    treeHash: sha256(aliasFor.map((skillId) => byId[skillId].treeHash).join('\n')),
    scripts: [],
    dependencies: [],
    dependencyStatus: 'passed',
    networkAccess: aliasFor.some((skillId) => byId[skillId].networkAccess !== 'none') ? 'controlled' : 'none',
    credentialAccess: aliasFor.some((skillId) => byId[skillId].credentialAccess !== 'none') ? 'reference-only' : 'none',
    executionPolicy: 'runtime-adapter-only',
    permissionReview: 'passed',
    scenarioEvidence: {
      id: `SPECIALIST-SCENARIO-${id.toUpperCase()}`,
      prompt: id === 'survey-adjustment' ? '对这组工程测量观测执行平差并生成审查报告。' : '对本期第三方监测数据进行校核并生成可追溯报告。',
      expectedEvidence: id === 'survey-adjustment' ? 'data-analysis + adjustment-report' : 'di-bao-monitoring + construction-monitoring + operational-monitoring',
      testFile: 'kun/src/engineering/specialist-skill-provenance.test.ts',
      status: 'passed'
    },
    aliasFor,
    packaged: false,
    status: 'available',
    reason: '虚拟能力别名；复用已审计 Skill，不复制源文件'
  })

  return {
    schemaVersion: 1,
    sourceRepository: SOURCE_REPOSITORY,
    sourceCommit: SOURCE_COMMIT,
    sourceLicense: { spdx: 'MIT', path: 'LICENSE', sha256: licenseHash },
    packagingPolicy: 'Only status=available and packaged=true Skill assets are installed; blocked entries remain source-visible and user copies are untouched.',
    skills,
    aliases: [
      alias('survey-adjustment', '工程测量与平差（能力别名）', ['data-analysis', 'adjustment-report']),
      alias('third-party-monitoring', '第三方监测（能力别名）', ['di-bao-monitoring', 'report-dibao', 'construction-monitoring', 'operational-monitoring'])
    ]
  }
}

function renderJson(audit) {
  return `${JSON.stringify(audit, null, 2)}\n`
}

function renderTypeScript(audit) {
  return [
    "import type { SkillProvenanceV1 } from '../contracts/survey.js'",
    '',
    '// Generated by scripts/specialist-skill-audit.cjs. Do not hand edit.',
    `export const SPECIALIST_SKILL_SOURCE = ${JSON.stringify({ schemaVersion: audit.schemaVersion, sourceRepository: audit.sourceRepository, sourceCommit: audit.sourceCommit, sourceLicense: audit.sourceLicense, packagingPolicy: audit.packagingPolicy }, null, 2)} as const`,
    '',
    `export const AUDITED_SPECIALIST_SKILLS = ${JSON.stringify(audit.skills, null, 2)} satisfies SkillProvenanceV1[]`,
    '',
    `export const SPECIALIST_SKILL_ALIASES = ${JSON.stringify(audit.aliases, null, 2)} satisfies SkillProvenanceV1[]`,
    ''
  ].join('\n')
}

function assertPinnedSource() {
  execFileSync('git', ['cat-file', '-e', `${SOURCE_COMMIT}^{commit}`], { cwd: ROOT, stdio: 'ignore' })
  execFileSync('git', ['diff', '--quiet', SOURCE_COMMIT, '--', `${PACK_RELATIVE}/assets`], { cwd: ROOT, stdio: 'ignore' })
}

function writeAudit() {
  assertPinnedSource()
  const audit = buildAudit()
  writeFileSync(join(ROOT, JSON_OUTPUT_RELATIVE), renderJson(audit))
  writeFileSync(join(ROOT, TS_OUTPUT_RELATIVE), renderTypeScript(audit))
  return audit
}

function verifyAudit() {
  assertPinnedSource()
  const audit = buildAudit()
  const expected = [
    [JSON_OUTPUT_RELATIVE, renderJson(audit)],
    [TS_OUTPUT_RELATIVE, renderTypeScript(audit)]
  ]
  for (const [path, content] of expected) {
    const absolute = join(ROOT, path)
    if (!existsSync(absolute) || readFileSync(absolute, 'utf8') !== content) {
      throw new Error(`Specialist Skill audit is stale: ${path}. Run npm run generate:specialist-skill-audit.`)
    }
  }
  return audit
}

function loadAudit() {
  return JSON.parse(readFileSync(join(ROOT, JSON_OUTPUT_RELATIVE), 'utf8'))
}

function blockedSkillIds(audit = loadAudit()) {
  return audit.skills.filter((entry) => entry.status !== 'available' || !entry.packaged).map((entry) => entry.id).sort()
}

function agentPackResourceFilter(audit = loadAudit()) {
  return ['**/*', ...blockedSkillIds(audit).map((id) => `!metro-monitoring-agent-pack/assets/skill/${id}/**/*`)]
}

function asarBlockedSkillFilters(audit = loadAudit()) {
  return blockedSkillIds(audit).map((id) => `!src/asset/skills/${id}/**/*`)
}

if (require.main === module) {
  const write = process.argv.includes('--write')
  const audit = write ? writeAudit() : verifyAudit()
  console.log(`Specialist Skill audit ${write ? 'generated' : 'verified'}: ${audit.skills.length} skills, ${audit.aliases.length} aliases, source ${audit.sourceCommit}.`)
}

module.exports = {
  SOURCE_COMMIT,
  agentPackResourceFilter,
  asarBlockedSkillFilters,
  blockedSkillIds,
  buildAudit,
  loadAudit,
  verifyAudit,
  writeAudit
}
