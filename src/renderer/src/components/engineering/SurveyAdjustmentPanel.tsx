import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { Activity, AlertTriangle, Bot, CheckCircle2, CircleDot, FileCode2, FileUp, GitBranch, Grid3X3, Play, Ruler, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { rendererRuntimeClient } from '../../agent/runtime-client'
import { buildSurveyTopology } from './survey-topology'

type Project = { id: string; revision: number }
type SurveyPoint = { id: string; pointClass?: string; x?: number; y?: number; height?: number; latitude?: number; longitude?: number; known?: boolean }
type SurveyObservation = { id: string; type?: string; from?: string; to?: string; station?: string; target?: string; left?: string; right?: string; value?: number; unit?: string; vectorX?: number; vectorY?: number; vectorZ?: number; covariance?: number[]; sigma?: number; sigmaUnit?: string; stationHeightOffset?: number; targetHeightOffset?: number; distance?: number; direction?: number }
type Network = { id: string; revision: number; networkType: string; transformType?: string; coordinateSystem?: string; verticalDatum?: string; heightDatum?: string; knownPoints: SurveyPoint[]; unknownPoints: SurveyPoint[]; observations: SurveyObservation[]; qualityStatus: string; findings: Array<{ severity: string; message: string }> }
type Adjustment = { observationEpoch?: string; networkType?: string; coordinateSystem?: string; verticalDatum?: string; run: { id: string; networkId: string; status: string; revision: number; createdAt?: string }; result: { id: string; validation: string; strategyId?: string; transformType?: string; algorithmVersion?: string; observationCount: number; unknownCount: number; redundancy: number; linearUnit?: 'm'; angularUnit?: 'rad'; unitWeightStdDev: number; unitWeightStdDevUnit?: 'dimensionless'; varianceFactor?: number; varianceFactorUnit?: 'dimensionless'; varianceFactorEstimated?: boolean; degreesOfFreedom?: number; closure?: { horizontal?: number; angular?: number; vertical?: number; heightDifference?: number; fx?: number; fy?: number; relativeClosure?: number; baseline?: number; baselineX?: number; baselineY?: number; baselineZ?: number; translationX?: number; translationY?: number; scalePpm?: number; rotationRad?: number }; closureUnits?: Record<string, 'm' | 'rad' | 'ppm' | 'ratio'>; parameters?: Record<string, number>; parameterUnits?: Record<string, 'm' | 'rad' | 'ppm' | 'ratio'>; precision: { maxPointStdDev: number; relativePrecision?: number; passed: boolean }; qualityFindings: Array<{ severity: string; message: string }>; covariance?: number[][]; points?: Array<{ id: string; x?: number; y?: number; height?: number; latitude?: number; longitude?: number; correctionX?: number; correctionY?: number; correctionHeight?: number; standardError?: number }>; observations?: Array<{ observationId: string; correction?: number; residual: number; unit?: 'm' | 'rad'; standardizedResidual?: number; standardizedResidualUnit?: 'sigma'; outlier?: boolean; sourceRow?: number }> } }
type Deformation = { id: string; referenceAdjustmentId: string; currentAdjustmentId: string; referenceEpoch: string; currentEpoch: string; durationDays: number; algorithmVersion: string; inputHash: string; points: Array<{ pointId: string; dX?: number; dY?: number; dH?: number; settlement?: number; horizontalDisplacement?: number; spatialDisplacement: number; rates: { spatialPerDay: number }; trend: string; significant?: boolean; unit: 'm'; rateUnit: 'm/day' }>; pairs: Array<{ id: string; kind: 'tilt' | 'convergence'; firstPointId: string; secondPointId: string; convergence?: number; convergenceRatePerDay?: number; differentialSettlement?: number; tilt?: number; linearUnit: 'm'; rateUnit: 'm/day'; tiltUnit: 'ratio' }> }

const sampleNetwork = JSON.stringify({
  networkType: 'leveling',
  coordinateSystem: '工程独立坐标系',
  heightDatum: '项目高程基准',
  knownPoints: [{ id: 'BM-01', pointClass: 'known', height: 100, known: true }],
  unknownPoints: [{ id: 'P-01', pointClass: 'unknown', height: 100.2, known: false }],
  observations: [{ id: 'obs-1', type: 'height-difference', from: 'BM-01', to: 'P-01', value: 0.2, unit: 'm', sigma: 0.002 }]
}, null, 2)

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await rendererRuntimeClient.runtimeRequest(path, method, body === undefined ? undefined : JSON.stringify(body))
  if (!response.ok) throw new Error(response.body || `Runtime request failed (${response.status})`)
  return JSON.parse(response.body) as T
}

export function numberLabel(value: number | undefined, digits = 4): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value !== 0 && Math.abs(value) < 10 ** -digits) {
    return value.toExponential(Math.max(0, digits - 1)).replace(/\.0+(?=e)/, '')
  }
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits })
}

function measurementLabel(value: number | undefined, unit: string | undefined, digits = 4): string {
  const number = numberLabel(value, digits)
  return number === '—' ? number : `${number} ${unit ?? '单位未记录'}`
}

function observationValueLabel(observation: SurveyObservation): string {
  if (observation.type === 'gnss-baseline' && observation.vectorX !== undefined && observation.vectorY !== undefined && observation.vectorZ !== undefined) {
    return `ΔX ${numberLabel(observation.vectorX, 6)} · ΔY ${numberLabel(observation.vectorY, 6)} · ΔZ ${numberLabel(observation.vectorZ, 6)}`
  }
  return numberLabel(observation.value, 6)
}

function pointLabel(point: SurveyPoint): string {
  return point.known || point.pointClass === 'known' ? '已知' : '未知'
}

function networkTypeLabel(value: string): string {
  return ({ leveling: '水准 / 高程控制网', traverse: '附合 / 闭合导线', 'plane-control': '平面控制网', triangulation: '三角网', 'cpiii-free-station': 'CPIII 自由测站', 'cpiii-resection': 'CPIII 后方交会', gnss: 'GNSS 基线', 'coordinate-transform': '坐标 / 高程转换' } as Record<string, string>)[value] ?? value
}

function Stat({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'neutral' | 'good' | 'warn' | 'danger' }): ReactElement {
  const color = tone === 'good' ? 'text-green-700 dark:text-green-300' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : tone === 'danger' ? 'text-red-700 dark:text-red-300' : 'text-ds-ink'
  return <div className="border border-ds-border-muted bg-ds-main px-3 py-2.5"><p className="text-[10px] text-ds-faint">{label}</p><p className={`mt-0.5 tabular-nums text-[17px] font-semibold ${color}`}>{value}</p><p className="mt-0.5 truncate text-[10px] text-ds-faint">{detail}</p></div>
}

export function SurveyAdjustmentPanel({ project, runtimeReady, onAdjustmentComplete, onDeformationComplete, onOpenAi }: { project: Project; runtimeReady: boolean; onAdjustmentComplete?: (id: string) => void; onDeformationComplete?: (id: string) => void; onOpenAi?: () => void }): ReactElement {
  const [networkType, setNetworkType] = useState('leveling')
  const [transformType, setTransformType] = useState('similarity-2d')
  const [payload, setPayload] = useState(sampleNetwork)
  const [networks, setNetworks] = useState<Network[]>([])
  const [network, setNetwork] = useState<Network | null>(null)
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [section, setSection] = useState<'network' | 'observations' | 'points' | 'result' | 'deformation'>('network')
  const [showRaw, setShowRaw] = useState(false)
  const [adjustmentMethod, setAdjustmentMethod] = useState<'weighted-least-squares' | 'conditional' | 'helmert-seven-parameter' | 'height-fit'>('weighted-least-squares')
  const [constraintMode, setConstraintMode] = useState<'fixed-known-points' | 'minimum-constraint' | 'free'>('fixed-known-points')
  const [adjustmentHistory, setAdjustmentHistory] = useState<Adjustment[]>([])
  const [referenceAdjustmentId, setReferenceAdjustmentId] = useState('')
  const [currentAdjustmentId, setCurrentAdjustmentId] = useState('')
  const [pairPayload, setPairPayload] = useState('[]')
  const [deformation, setDeformation] = useState<Deformation | null>(null)

  const points = useMemo(() => [...(network?.knownPoints ?? []), ...(network?.unknownPoints ?? [])], [network])
  const topology = useMemo(() => buildSurveyTopology(points, network?.observations ?? []), [network, points])
  const blockers = network?.findings.filter((finding) => finding.severity === 'blocking').length ?? 0
  const selectedType = network ? networkTypeLabel(network.networkType) : networkTypeLabel(networkType)
  const completedAdjustments = useMemo(() => adjustmentHistory.filter((item) => item.run.status === 'completed' && item.result.validation === 'valid' && Boolean(item.observationEpoch)), [adjustmentHistory])

  const refreshAdjustments = useCallback(async (): Promise<void> => {
    if (!runtimeReady || !project.id) return
    const result = await request<{ adjustments: Adjustment[] }>(`/v1/engineering/adjustments?projectId=${encodeURIComponent(project.id)}`, 'GET')
    setAdjustmentHistory(result.adjustments)
    const eligible = result.adjustments
      .filter((item) => item.run.status === 'completed' && item.result.validation === 'valid' && Boolean(item.observationEpoch))
      .sort((left, right) => Date.parse(left.observationEpoch!) - Date.parse(right.observationEpoch!))
    setReferenceAdjustmentId((current) => eligible.some((item) => item.run.id === current) ? current : eligible[0]?.run.id ?? '')
    setCurrentAdjustmentId((current) => eligible.some((item) => item.run.id === current) ? current : eligible.at(-1)?.run.id ?? '')
  }, [project.id, runtimeReady])

  useEffect(() => {
    if (!runtimeReady || !project.id) return
    void Promise.all([
      request<{ networks: Network[] }>(`/v1/engineering/survey/networks?projectId=${encodeURIComponent(project.id)}`, 'GET'),
      request<{ adjustments: Adjustment[] }>(`/v1/engineering/adjustments?projectId=${encodeURIComponent(project.id)}`, 'GET')
    ]).then(([networkResult, adjustmentResult]) => {
      setNetworks(networkResult.networks)
      setAdjustmentHistory(adjustmentResult.adjustments)
      const eligible = adjustmentResult.adjustments
        .filter((item) => item.run.status === 'completed' && item.result.validation === 'valid' && Boolean(item.observationEpoch))
        .sort((left, right) => Date.parse(left.observationEpoch!) - Date.parse(right.observationEpoch!))
      setReferenceAdjustmentId(eligible[0]?.run.id ?? '')
      setCurrentAdjustmentId(eligible.at(-1)?.run.id ?? '')
      const restoredNetwork = networkResult.networks[0] ?? null
      const restoredAdjustment = restoredNetwork
        ? adjustmentResult.adjustments.find((item) => item.run.networkId === restoredNetwork.id) ?? null
        : null
      setNetwork(restoredNetwork)
      setAdjustment(restoredAdjustment)
      if (restoredNetwork) {
        setNetworkType(restoredNetwork.networkType)
        if (restoredNetwork.transformType) setTransformType(restoredNetwork.transformType)
      }
      setSection(restoredAdjustment ? 'result' : 'network')
    }).catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
  }, [project.id, runtimeReady])

  const selectExistingNetwork = (networkId: string): void => {
    const selected = networks.find((item) => item.id === networkId)
    if (!selected) return
    setNetwork(selected)
    setNetworkType(selected.networkType)
    if (selected.transformType) setTransformType(selected.transformType)
    const restoredAdjustment = adjustmentHistory.find((item) => item.run.networkId === selected.id) ?? null
    setAdjustment(restoredAdjustment)
    setSection(restoredAdjustment ? 'result' : 'network')
    setMessage(restoredAdjustment ? '已恢复该网络的最近一次平差结果。' : '已恢复测量网络，尚无平差结果。')
  }

  const readFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('无法读取测量文件'))
    reader.onload = () => { const value = typeof reader.result === 'string' ? reader.result : ''; const comma = value.indexOf(','); resolve(comma >= 0 ? value.slice(comma + 1) : value) }
    reader.readAsDataURL(file)
  })

  const importNetwork = async (): Promise<void> => {
    setBusy(true); setMessage('')
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      const result = await request<{ network: Network }>('/v1/engineering/survey/networks/import', 'POST', { projectId: project.id, networkType, ...(networkType === 'coordinate-transform' ? { transformType } : {}), network: parsed, expectedRevision: project.revision, idempotencyKey: `survey-import-${project.id}-${Date.now()}` })
      setNetworks((current) => [result.network, ...current.filter((item) => item.id !== result.network.id)]); setNetwork(result.network); setAdjustment(null); setSection('network'); setMessage('测量网络已导入。先确认基准、点号和观测表，再执行质量校核。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }

  const importFile = async (file: File): Promise<void> => {
    setBusy(true); setMessage('')
    try {
      const dataBase64 = await readFile(file)
      const result = await request<{ network: Network }>('/v1/engineering/survey/networks/import', 'POST', { projectId: project.id, networkType, ...(networkType === 'coordinate-transform' ? { transformType } : {}), name: file.name, dataBase64, expectedRevision: project.revision, idempotencyKey: `survey-file-import-${project.id}-${file.name}-${file.size}-${file.lastModified}` })
      setNetworks((current) => [result.network, ...current.filter((item) => item.id !== result.network.id)]); setNetwork(result.network); setAdjustment(null); setSection('network'); setMessage(`${file.name} 已导入，保留源行号和文件哈希。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false); setFileInputKey((value) => value + 1) }
  }

  const validate = async (): Promise<void> => {
    if (!network) return
    setBusy(true); setMessage('')
    try {
      const result = await request<{ network: Network }>(`/v1/engineering/survey/networks/${network.id}/validate`, 'POST', { expectedRevision: network.revision, idempotencyKey: `survey-validate-${network.id}-${network.revision}` })
      setNetworks((current) => current.map((item) => item.id === result.network.id ? result.network : item)); setNetwork(result.network); setMessage(result.network.qualityStatus === 'blocked' ? '质量校核发现阻断项。请处理基准、单位或断网问题后再平差。' : '质量校核通过，可以运行平差。'); setSection('network')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }

  const adjust = async (): Promise<void> => {
    if (!network) return
    setBusy(true); setMessage('')
    try {
      const result = await request<Adjustment>('/v1/engineering/adjustments', 'POST', { networkId: network.id, expectedRevision: network.revision, idempotencyKey: `survey-adjust-${network.id}-${network.revision}-${adjustmentMethod}-${constraintMode}`, method: adjustmentMethod, constraint: constraintMode })
      setAdjustment(result); onAdjustmentComplete?.(result.run.id); await refreshAdjustments(); setSection('result'); setMessage(result.run.status === 'completed' ? '平差完成。结果已锁定输入哈希和算法版本，可进入成果审查。' : '平差未完成，请查看结果页的质量问题。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }

  const compareDeformation = async (): Promise<void> => {
    if (!referenceAdjustmentId || !currentAdjustmentId || referenceAdjustmentId === currentAdjustmentId) {
      setMessage('请选择两个不同的已完成平差期次。')
      return
    }
    setBusy(true); setMessage('')
    try {
      const parsedPairs = JSON.parse(pairPayload) as unknown
      if (!Array.isArray(parsedPairs)) throw new Error('构形对必须是 JSON 数组')
      const currentRun = completedAdjustments.find((item) => item.run.id === currentAdjustmentId)?.run
      if (!currentRun) throw new Error('当前期次平差结果不可用')
      const result = await request<{ deformation: Deformation }>('/v1/engineering/deformations', 'POST', {
        projectId: project.id,
        adjustmentIds: [referenceAdjustmentId, currentAdjustmentId],
        pairs: parsedPairs,
        stabilityRateMPerDay: 0.0001,
        expectedRevision: currentRun.revision,
        idempotencyKey: `survey-deformation-${referenceAdjustmentId}-${currentAdjustmentId}-${JSON.stringify(parsedPairs)}`.slice(0, 200)
      })
      setDeformation(result.deformation)
      onDeformationComplete?.(result.deformation.id)
      setSection('deformation')
      setMessage('期次比较完成。结果已绑定两个平差输入哈希，可进入成果审查。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }

  return <section className="survey-adjustment-panel p-4 sm:p-5" aria-label="测量与平差工作台">
    <div className="survey-workbench-surface overflow-hidden border border-ds-border-muted bg-ds-card">
      <div className="survey-workbench-header flex flex-wrap items-start justify-between gap-4 border-b border-ds-border-muted px-4 py-4"><div className="min-w-0"><div className="flex items-center gap-2"><Ruler className="h-4 w-4 text-accent" /><h3 className="text-[15px] font-semibold">测量与平差控制台</h3><span className="border border-accent/25 bg-accent/5 px-2 py-0.5 text-[10px] font-medium text-accent">Runtime 确定性计算</span></div><p className="mt-1 max-w-2xl text-[11.5px] leading-5 text-ds-muted">按测量软件的工作顺序确认网型、基准、约束和权模型。测绘专业 AI Agent 只负责解释、追问与复核，不改写任何观测或精度数字。</p></div><div className="flex shrink-0 flex-wrap items-center justify-end gap-2"><button type="button" onClick={onOpenAi} disabled={!onOpenAi} className="inline-flex h-8 items-center gap-1.5 border border-accent/40 bg-accent/5 px-2.5 text-[11px] font-semibold text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"><Bot className="h-3.5 w-3.5" />让测绘专业 AI Agent 解读</button>{networks.length ? <><label className="sr-only" htmlFor="survey-existing-network">已有测量网络</label><select id="survey-existing-network" aria-label="已有测量网络" value={network?.id ?? ''} onChange={(event) => selectExistingNetwork(event.target.value)} className="h-8 max-w-52 rounded-md border border-ds-border bg-ds-card px-2 text-[11px] text-ds-ink outline-none focus:border-accent">{networks.map((item) => <option key={item.id} value={item.id}>{networkTypeLabel(item.networkType)} · {item.id.slice(-8)}</option>)}</select></> : null}<label className="sr-only" htmlFor="survey-network-type">网络类型</label><select id="survey-network-type" aria-label="网络类型" value={networkType} onChange={(event) => setNetworkType(event.target.value)} className="h-8 rounded-md border border-ds-border bg-ds-card px-2 text-[11px] text-ds-ink outline-none focus:border-accent"><option value="leveling">水准 / 高程控制网</option><option value="traverse">附合 / 闭合导线</option><option value="plane-control">平面控制网</option><option value="triangulation">三角网</option><option value="cpiii-free-station">CPIII 自由测站</option><option value="cpiii-resection">CPIII 后方交会</option><option value="gnss">GNSS 基线</option><option value="coordinate-transform">坐标 / 高程转换</option></select>{networkType === 'coordinate-transform' ? <><label className="sr-only" htmlFor="survey-transform-type">转换类型</label><select id="survey-transform-type" aria-label="转换类型" value={transformType} onChange={(event) => setTransformType(event.target.value)} className="h-8 rounded-md border border-ds-border bg-ds-card px-2 text-[11px] text-ds-ink outline-none focus:border-accent"><option value="similarity-2d">二维相似</option><option value="helmert-7">三维七参数</option><option value="gauss-kruger-forward">高斯正算</option><option value="gauss-kruger-inverse">高斯反算</option><option value="height-fit">高程拟合</option></select></> : null}<span className={`inline-flex h-8 items-center gap-1.5 px-2.5 text-[10.5px] font-medium ${runtimeReady ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${runtimeReady ? 'bg-green-600' : 'bg-amber-500'}`} />{runtimeReady ? 'Runtime 在线' : '等待 Runtime'}</span></div></div>

      <div className="survey-instrument-strip grid grid-cols-2 border-b border-ds-border-muted bg-ds-subtle sm:grid-cols-4" aria-label="测量计算状态"><div className="border-r border-ds-border-muted px-4 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ds-faint">网型</p><p className="mt-0.5 truncate text-[11px] font-medium text-ds-ink">{selectedType}</p></div><div className="border-r border-ds-border-muted px-4 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ds-faint">约束模式</p><label className="sr-only" htmlFor="survey-constraint-mode">约束模式</label><select id="survey-constraint-mode" value={constraintMode} onChange={(event) => setConstraintMode(event.target.value as typeof constraintMode)} className="mt-0.5 max-w-full bg-transparent text-[11px] font-medium text-ds-ink outline-none"><option value="fixed-known-points">固定已知点</option><option value="minimum-constraint">最小约束</option><option value="free">自由网</option></select></div><div className="border-r border-ds-border-muted px-4 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ds-faint">平差方法 / 权模型</p><label className="sr-only" htmlFor="survey-adjustment-method">平差方法</label><select id="survey-adjustment-method" value={adjustmentMethod} onChange={(event) => setAdjustmentMethod(event.target.value as typeof adjustmentMethod)} className="mt-0.5 max-w-full bg-transparent text-[11px] font-medium text-ds-ink outline-none"><option value="weighted-least-squares">加权最小二乘</option><option value="conditional">条件平差</option><option value="height-fit">高程拟合</option><option value="helmert-seven-parameter">七参数转换</option></select></div><div className="px-4 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ds-faint">可解性</p><p className={`mt-0.5 truncate text-[11px] font-medium ${blockers ? 'text-red-700 dark:text-red-300' : network?.qualityStatus === 'validated' ? 'text-green-700 dark:text-green-300' : 'text-ds-ink'}`}>{blockers ? `${blockers} 个阻断` : network?.qualityStatus === 'validated' ? '已通过校核' : '尚未校核'}</p></div></div>

      <div className="survey-workbench-grid grid min-h-0 lg:grid-cols-[190px_minmax(0,1fr)] 2xl:grid-cols-[190px_minmax(0,1fr)_260px]">
        <nav className="survey-workbench-nav border-b border-ds-border-muted bg-ds-main p-2 lg:border-b-0 lg:border-r" aria-label="平差工作区导航"><p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ds-faint">工作区</p>{([['network', '网形与基准', GitBranch], ['observations', '观测表', Grid3X3], ['points', '点位与坐标', CircleDot], ['result', '平差结果', CheckCircle2], ['deformation', '期次变形', Activity]] as const).map(([value, label, Icon]) => <button key={value} type="button" aria-current={section === value ? 'page' : undefined} onClick={() => setSection(value)} className={`flex min-h-10 w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] ${section === value ? 'bg-accent/10 font-semibold text-accent' : 'text-ds-muted hover:bg-ds-hover hover:text-ds-ink'}`}><Icon className="h-3.5 w-3.5 shrink-0" />{label}<span className="ml-auto text-[9px] text-ds-faint">{value === 'observations' ? network?.observations.length ?? 0 : value === 'points' ? points.length : value === 'deformation' ? completedAdjustments.length : ''}</span></button>)}</nav>

        <div className="survey-workbench-main min-w-0 bg-ds-card">

          {section === 'network' ? <div className="p-4"><div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_260px]"><div className="border border-ds-border-muted bg-ds-main p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-[12px] font-semibold">导入测量网络</p><p className="mt-0.5 text-[10.5px] text-ds-muted">支持 CSV / XLSX / JSON，原始文件由 Attachment Store 托管。</p></div><FileUp className="h-4 w-4 text-accent" /></div><div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex h-8 cursor-pointer items-center gap-1.5 border border-ds-border bg-ds-card px-2.5 text-[11px] font-medium text-ds-ink hover:bg-ds-hover"><FileUp className="h-3.5 w-3.5" />选择文件<input key={fileInputKey} type="file" accept=".csv,.xlsx,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={!runtimeReady || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file) }} /></label><button type="button" onClick={() => void importNetwork()} disabled={!runtimeReady || busy} className="inline-flex h-8 items-center gap-1.5 bg-accent px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"><FileCode2 className="h-3.5 w-3.5" />导入结构化网络</button><button type="button" onClick={() => setShowRaw((value) => !value)} className="inline-flex h-8 items-center gap-1.5 border border-ds-border px-2.5 text-[11px] font-medium text-ds-muted hover:bg-ds-hover">{showRaw ? '收起 JSON' : '高级 JSON'}</button></div>{showRaw ? <><label className="mt-3 block text-[10px] font-medium text-ds-muted" htmlFor="survey-network-json">结构化网络输入（高级）</label><textarea id="survey-network-json" value={payload} onChange={(event) => setPayload(event.target.value)} className="mt-1 min-h-[180px] w-full rounded-md border border-ds-border bg-ds-card p-3 font-mono text-[10.5px] leading-5 text-ds-ink outline-none focus:border-accent" spellCheck={false} /></> : <div className="mt-3 border border-dashed border-ds-border-muted px-3 py-3 text-[10.5px] leading-4 text-ds-muted">先选文件导入，或打开高级 JSON 粘贴网络。导入后这里会变成可扫描的点位、观测和基准表。</div>}</div><div className="border border-ds-border-muted bg-ds-main p-3"><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-accent" /><p className="text-[12px] font-semibold">项目基准</p></div><dl className="mt-3 space-y-2 text-[10.5px]"><div className="flex justify-between gap-3"><dt className="text-ds-faint">网络类型</dt><dd className="text-right font-medium text-ds-ink">{selectedType}</dd></div><div className="flex justify-between gap-3"><dt className="text-ds-faint">平面坐标系</dt><dd className="text-right text-ds-ink">{network?.coordinateSystem ?? '待确认'}</dd></div><div className="flex justify-between gap-3"><dt className="text-ds-faint">高程基准</dt><dd className="text-right text-ds-ink">{network?.verticalDatum ?? network?.heightDatum ?? '待确认'}</dd></div><div className="flex justify-between gap-3"><dt className="text-ds-faint">输入修订</dt><dd className="font-mono text-ds-ink">{network?.revision ?? '—'}</dd></div></dl></div></div><div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4"><Stat label="点位" value={`${points.length}`} detail={`${network?.knownPoints.length ?? 0} 已知 · ${network?.unknownPoints.length ?? 0} 未知`} /><Stat label="观测" value={`${network?.observations.length ?? 0}`} detail={network ? '已保留单位与权' : '等待导入'} /><Stat label="质量状态" value={network?.qualityStatus ?? '—'} detail={blockers ? `${blockers} 个阻断项` : '未校核'} tone={blockers ? 'danger' : network?.qualityStatus === 'validated' ? 'good' : 'neutral'} /><Stat label="运行状态" value={adjustment?.run.status ?? '—'} detail={adjustment?.run.id ?? '尚未平差'} tone={adjustment?.run.status === 'completed' ? 'good' : 'neutral'} /></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void validate()} disabled={!network || busy} className="inline-flex h-8 items-center gap-1.5 border border-ds-border px-3 text-[11px] font-medium text-ds-ink disabled:opacity-50"><ShieldAlert className="h-3.5 w-3.5" />质量校核</button><button type="button" onClick={() => void adjust()} disabled={!network || busy || network.qualityStatus === 'blocked'} className="inline-flex h-8 items-center gap-1.5 bg-green-700 px-3 text-[11px] font-semibold text-white disabled:opacity-50"><Play className="h-3.5 w-3.5" />运行加权最小二乘</button></div></div> : null}

          {section === 'observations' ? <div className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-[13px] font-semibold">观测表</h4><p className="mt-0.5 text-[10.5px] text-ds-muted">每条观测都显示测站、目标、单位和先验中误差；GNSS 显示三分量基线和完整协方差状态。</p></div><button type="button" onClick={() => void validate()} disabled={!network || busy} className="inline-flex h-8 items-center gap-1.5 border border-ds-border px-2.5 text-[11px] font-medium disabled:opacity-50"><ShieldAlert className="h-3.5 w-3.5" />重新校核</button></div>{network ? <div className="mt-4 overflow-x-auto border border-ds-border-muted"><table className="min-w-full text-left text-[11px]"><thead className="bg-ds-subtle text-ds-muted"><tr><th className="px-3 py-2 font-semibold">观测 ID</th><th className="px-3 py-2 font-semibold">类型</th><th className="px-3 py-2 font-semibold">测站 → 目标</th><th className="px-3 py-2 font-semibold">观测值</th><th className="px-3 py-2 font-semibold">单位</th><th className="px-3 py-2 font-semibold">权 / 协方差</th></tr></thead><tbody className="divide-y divide-ds-border-muted">{network.observations.map((observation) => <tr key={observation.id} className="hover:bg-ds-hover"><td className="px-3 py-2.5 font-mono text-ds-ink">{observation.id}</td><td className="px-3 py-2.5 text-ds-muted">{observation.type ?? '—'}</td><td className="px-3 py-2.5 text-ds-ink">{observation.station ?? observation.from ?? '—'} <span className="text-ds-faint">→</span> {observation.target ?? observation.to ?? '—'}</td><td className="px-3 py-2.5 tabular-nums font-medium text-ds-ink">{observationValueLabel(observation)}</td><td className="px-3 py-2.5 text-ds-muted">{observation.unit ?? '—'}</td><td className="px-3 py-2.5 tabular-nums text-ds-muted">{observation.type === 'gnss-baseline' ? (observation.covariance?.length === 9 ? '3×3 已提供' : '3×3 缺失') : numberLabel(observation.sigma, 6)}</td></tr>)}</tbody></table></div> : <div className="mt-4 border border-dashed border-ds-border-muted px-4 py-10 text-center text-[11px] text-ds-muted">导入网络后显示观测表。</div>}</div> : null}

          {section === 'points' ? <div className="p-4"><div><h4 className="text-[13px] font-semibold">点位与网形</h4><p className="mt-0.5 text-[10.5px] text-ds-muted">已知点是约束，未知点是待估参数。连线严格来自观测的起点/终点；没有完整坐标时才使用标注过的示意布局。</p></div>{network ? <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]"><div className="border border-ds-border-muted bg-[#f8fafc] p-3 dark:bg-ds-main"><svg viewBox="0 0 520 230" className="h-[230px] w-full" role="img" aria-label={`测量网络关系图（${topology.hasCoordinateLayout ? '按坐标绘制' : '示意布局'}）`}><g stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5">{topology.edges.map((edge) => { const from = topology.nodes.find((node) => node.id === edge.from); const to = topology.nodes.find((node) => node.id === edge.to); return from && to ? <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} /> : null })}</g>{topology.nodes.map((point) => <g key={point.id} transform={`translate(${point.x},${point.y})`}><circle r="14" fill={pointLabel(point) === '已知' ? '#2563eb' : '#fff'} stroke="#2563eb" strokeWidth="2" /><text y="4" textAnchor="middle" fontSize="9" fill={pointLabel(point) === '已知' ? '#fff' : '#2563eb'}>{point.index + 1}</text><text y="29" textAnchor="middle" fontSize="10" fill="currentColor">{point.id}</text></g>)}</svg><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ds-muted"><span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />已知点</span><span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white dark:bg-ds-main" />未知点</span><span className="text-ds-faint">{topology.hasCoordinateLayout ? '按 X/Y 坐标归一化' : '示意布局，连线仍按真实点号'}</span></div></div><div className="overflow-hidden border border-ds-border-muted"><table className="min-w-full text-left text-[10.5px]"><thead className="bg-ds-subtle text-ds-muted"><tr><th className="px-2.5 py-2 font-semibold">点号</th><th className="px-2.5 py-2 font-semibold">角色</th><th className="px-2.5 py-2 font-semibold">初始高程</th></tr></thead><tbody className="divide-y divide-ds-border-muted">{points.map((point) => <tr key={point.id}><td className="px-2.5 py-2 font-medium text-ds-ink">{point.id}</td><td className="px-2.5 py-2 text-ds-muted">{pointLabel(point)}</td><td className="px-2.5 py-2 tabular-nums text-ds-muted">{numberLabel(point.height, 4)}</td></tr>)}</tbody></table></div></div> : <div className="mt-4 border border-dashed border-ds-border-muted px-4 py-10 text-center text-[11px] text-ds-muted">导入网络后显示点位和拓扑关系。</div>}</div> : null}

          {section === 'result' ? <div className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-[13px] font-semibold">平差结果与精度评定</h4><p className="mt-0.5 text-[10.5px] text-ds-muted">结果来自 Runtime 的加权最小二乘计算，AI 只解释，不改写数字。</p></div>{adjustment ? <div className="flex flex-wrap items-center justify-end gap-2"><span className="border border-ds-border-muted bg-ds-subtle px-2 py-1 font-mono text-[10px] text-ds-muted">策略 {adjustment.result.strategyId ?? 'legacy'}{adjustment.result.transformType ? `/${adjustment.result.transformType}` : ''} · {adjustment.result.algorithmVersion ?? 'unknown'}</span><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-medium ${adjustment.result.precision.passed ? 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'}`}><CheckCircle2 className="h-3.5 w-3.5" />{adjustment.result.precision.passed ? '精度通过' : '需要复核'}</span></div> : null}</div>
            {adjustment ? <>
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4"><Stat label="观测 / 未知数" value={`${adjustment.result.observationCount} / ${adjustment.result.unknownCount}`} detail={`多余观测 ${adjustment.result.redundancy}`} /><Stat label="自由度" value={`${adjustment.result.degreesOfFreedom ?? adjustment.result.redundancy}`} detail="法方程可解性" /><Stat label="单位权中误差 σ₀" value={numberLabel(adjustment.result.unitWeightStdDev, 6)} detail={`σ₀/方差因子均为无量纲 · ${numberLabel(adjustment.result.varianceFactor, 6)}`} /><Stat label="最大点位中误差" value={measurementLabel(adjustment.result.precision.maxPointStdDev, adjustment.result.linearUnit ?? 'm', 6)} detail={adjustment.result.precision.passed ? '满足项目精度' : '超出项目精度'} tone={adjustment.result.precision.passed ? 'good' : 'warn'} /></div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]"><div className="overflow-hidden border border-ds-border-muted"><div className="border-b border-ds-border-muted bg-ds-subtle px-3 py-2 text-[11px] font-semibold text-ds-muted">残差与粗差候选</div>{adjustment.result.observations?.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-[10.5px]"><thead className="text-ds-muted"><tr><th className="px-3 py-2 font-semibold">观测</th><th className="px-3 py-2 font-semibold">残差（规范化单位）</th><th className="px-3 py-2 font-semibold">标准化残差（σ）</th></tr></thead><tbody className="divide-y divide-ds-border-muted">{adjustment.result.observations.map((residual) => <tr key={residual.observationId}><td className="px-3 py-2 font-mono text-ds-ink">{residual.observationId}</td><td className="px-3 py-2 tabular-nums text-ds-ink">{measurementLabel(residual.residual, residual.unit, 7)}</td><td className={`px-3 py-2 tabular-nums ${Math.abs(residual.standardizedResidual ?? 0) > 3 ? 'font-semibold text-red-700 dark:text-red-300' : 'text-ds-muted'}`}>{measurementLabel(residual.standardizedResidual, 'σ', 4)}</td></tr>)}</tbody></table></div> : <p className="px-3 py-6 text-[10.5px] text-ds-muted">当前 Runtime 未返回逐条残差，完整结果仍保存在运行记录中。</p>}</div>
                <div className="border border-ds-border-muted bg-ds-main p-3"><p className="text-[11px] font-semibold text-ds-ink">闭合与复核</p><dl className="mt-3 space-y-2 text-[10.5px]"><div className="flex justify-between gap-2"><dt className="text-ds-faint">水平残差范数</dt><dd className="tabular-nums text-ds-ink">{measurementLabel(adjustment.result.closure?.horizontal, adjustment.result.closureUnits?.horizontal ?? 'm', 6)}</dd></div><div className="flex justify-between gap-2"><dt className="text-ds-faint">角度残差范数</dt><dd className="tabular-nums text-ds-ink">{measurementLabel(adjustment.result.closure?.angular, adjustment.result.closureUnits?.angular ?? 'rad', 8)}</dd></div><div className="flex justify-between gap-2"><dt className="text-ds-faint">高程闭合差</dt><dd className="tabular-nums text-ds-ink">{measurementLabel(adjustment.result.closure?.vertical ?? adjustment.result.closure?.heightDifference, adjustment.result.closureUnits?.vertical ?? adjustment.result.closureUnits?.heightDifference ?? 'm', 6)}</dd></div><div className="flex justify-between gap-2"><dt className="text-ds-faint">导线 fx / fy</dt><dd className="tabular-nums text-ds-ink">{adjustment.result.closure?.fx === undefined ? '—' : `${measurementLabel(adjustment.result.closure.fx, adjustment.result.closureUnits?.fx ?? 'm', 6)} / ${measurementLabel(adjustment.result.closure.fy, adjustment.result.closureUnits?.fy ?? 'm', 6)}`}</dd></div><div className="flex justify-between gap-2"><dt className="text-ds-faint">相对闭合差</dt><dd className="tabular-nums text-ds-ink">{measurementLabel(adjustment.result.closure?.relativeClosure, adjustment.result.closureUnits?.relativeClosure ?? 'ratio', 8)}</dd></div><div className="flex justify-between gap-2"><dt className="text-ds-faint">GNSS 基线残差范数</dt><dd className="tabular-nums text-ds-ink">{measurementLabel(adjustment.result.closure?.baseline, adjustment.result.closureUnits?.baseline ?? 'm', 6)}</dd></div>{adjustment.result.closure?.baseline !== undefined ? <div className="flex justify-between gap-2"><dt className="text-ds-faint">GNSS X / Y / Z</dt><dd className="tabular-nums text-ds-ink">{[adjustment.result.closure.baselineX, adjustment.result.closure.baselineY, adjustment.result.closure.baselineZ].map((value) => numberLabel(value, 6)).join(' / ')} m</dd></div> : null}{Object.entries(adjustment.result.parameters ?? {}).map(([key, value]) => <div key={key} className="flex justify-between gap-2"><dt className="text-ds-faint">{key.startsWith('orientation:') ? `测站定向 ${key.slice(12)}` : key}</dt><dd className="tabular-nums text-ds-ink">{measurementLabel(value, adjustment.result.parameterUnits?.[key], 8)}</dd></div>)}</dl><div className="mt-3 border-t border-ds-border-muted pt-3"><p className="font-mono text-[9.5px] text-ds-faint">运行 {adjustment.run.id}</p><p className="mt-1 text-[10px] text-ds-muted">{adjustment.result.validation}</p></div></div></div>
              {adjustment.result.qualityFindings.length ? <div className="mt-4 space-y-2">{adjustment.result.qualityFindings.map((finding, index) => <div key={`${finding.message}-${index}`} className="flex gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[10.5px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{finding.message}</div>)}</div> : null}
            </> : <div className="mt-4 border border-dashed border-ds-border-muted px-4 py-12 text-center text-[11px] text-ds-muted">运行平差后显示闭合差、残差、协方差、方差因子和精度评定。</div>}
          </div> : null}

          {section === 'deformation' ? <div className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-[13px] font-semibold">不可变期次变形比较</h4><p className="mt-0.5 max-w-2xl text-[10.5px] leading-4 text-ds-muted">只比较已完成且有效的确定性平差结果。Runtime 校验网型、坐标系、投影、椭球、高程基准和观测期次后，计算位移、沉降、速率与趋势。</p></div><button type="button" onClick={() => void refreshAdjustments()} disabled={!runtimeReady || busy} className="inline-flex h-8 items-center gap-1.5 border border-ds-border px-2.5 text-[11px] font-medium text-ds-ink disabled:opacity-50"><Activity className="h-3.5 w-3.5" />刷新期次</button></div>
            {completedAdjustments.length < 2 ? <div className="mt-4 border border-dashed border-ds-border-muted px-4 py-10 text-center text-[11px] text-ds-muted">至少需要两个带有效 observationEpoch 的已完成平差期次。当前可用 {completedAdjustments.length} 个。</div> : <><div className="mt-4 grid gap-3 border border-ds-border-muted bg-ds-main p-3 lg:grid-cols-2"><label className="text-[10.5px] font-medium text-ds-muted">参考期次<select aria-label="参考平差期次" value={referenceAdjustmentId} onChange={(event) => setReferenceAdjustmentId(event.target.value)} className="mt-1 h-9 w-full border border-ds-border bg-ds-card px-2 text-[11px] text-ds-ink outline-none focus:border-accent">{completedAdjustments.map((item) => <option key={item.run.id} value={item.run.id}>{item.observationEpoch} · {item.result.strategyId ?? 'legacy'} · {item.coordinateSystem}/{item.verticalDatum}</option>)}</select></label><label className="text-[10.5px] font-medium text-ds-muted">当前期次<select aria-label="当前平差期次" value={currentAdjustmentId} onChange={(event) => setCurrentAdjustmentId(event.target.value)} className="mt-1 h-9 w-full border border-ds-border bg-ds-card px-2 text-[11px] text-ds-ink outline-none focus:border-accent">{completedAdjustments.map((item) => <option key={item.run.id} value={item.run.id}>{item.observationEpoch} · {item.result.strategyId ?? 'legacy'} · {item.coordinateSystem}/{item.verticalDatum}</option>)}</select></label><label className="lg:col-span-2 text-[10.5px] font-medium text-ds-muted">倾斜 / 收敛构形对（JSON）<textarea aria-label="倾斜和收敛构形对" value={pairPayload} onChange={(event) => setPairPayload(event.target.value)} spellCheck={false} className="mt-1 min-h-20 w-full border border-ds-border bg-ds-card p-2 font-mono text-[10px] leading-4 text-ds-ink outline-none focus:border-accent" placeholder={'[{"id":"断面1","firstPointId":"L","secondPointId":"R","kind":"convergence","distanceMode":"horizontal"}]'} /><span className="mt-1 block font-normal text-ds-faint">倾斜使用参考期水平基线；收敛可选 horizontal、spatial 或 vertical。没有构形对时填 []。</span></label><div className="lg:col-span-2 flex items-center justify-between gap-3 border-t border-ds-border-muted pt-3"><p className="text-[10px] text-ds-faint">稳定速率判据：0.0001 m/day；正沉降表示高程降低。</p><button type="button" onClick={() => void compareDeformation()} disabled={busy || referenceAdjustmentId === currentAdjustmentId} className="inline-flex h-8 items-center gap-1.5 bg-green-700 px-3 text-[11px] font-semibold text-white disabled:opacity-50"><Play className="h-3.5 w-3.5" />运行期次比较</button></div></div>
              {deformation ? <div className="mt-4"><div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><Stat label="比较周期" value={`${numberLabel(deformation.durationDays, 3)} d`} detail={`${deformation.referenceEpoch} → ${deformation.currentEpoch}`} /><Stat label="共同测点" value={`${deformation.points.length}`} detail="每个期次均存在且坐标可比" /><Stat label="构形结果" value={`${deformation.pairs.length}`} detail="倾斜与收敛" /><Stat label="显著位移" value={`${deformation.points.filter((point) => point.significant).length}`} detail="组合中误差超过 3σ" tone={deformation.points.some((point) => point.significant) ? 'warn' : 'good'} /></div><div className="mt-4 overflow-x-auto border border-ds-border-muted"><table className="min-w-full text-left text-[10.5px]"><thead className="bg-ds-subtle text-ds-muted"><tr><th className="px-3 py-2 font-semibold">测点</th><th className="px-3 py-2 font-semibold">dX / dY / dH（m）</th><th className="px-3 py-2 font-semibold">沉降（m）</th><th className="px-3 py-2 font-semibold">水平 / 三维位移（m）</th><th className="px-3 py-2 font-semibold">速率（m/day）</th><th className="px-3 py-2 font-semibold">趋势</th></tr></thead><tbody className="divide-y divide-ds-border-muted">{deformation.points.map((point) => <tr key={point.pointId} className="hover:bg-ds-hover"><td className="px-3 py-2.5 font-medium text-ds-ink">{point.pointId}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{[point.dX, point.dY, point.dH].map((value) => numberLabel(value, 7)).join(' / ')}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{numberLabel(point.settlement, 7)}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{numberLabel(point.horizontalDisplacement, 7)} / {numberLabel(point.spatialDisplacement, 7)}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{numberLabel(point.rates.spatialPerDay, 8)}</td><td className={`px-3 py-2.5 ${point.significant ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-ds-muted'}`}>{point.trend}{point.significant ? ' · >3σ' : ''}</td></tr>)}</tbody></table></div>{deformation.pairs.length ? <div className="mt-4 overflow-x-auto border border-ds-border-muted"><table className="min-w-full text-left text-[10.5px]"><thead className="bg-ds-subtle text-ds-muted"><tr><th className="px-3 py-2 font-semibold">构形</th><th className="px-3 py-2 font-semibold">点对</th><th className="px-3 py-2 font-semibold">差异沉降 / 收敛（m）</th><th className="px-3 py-2 font-semibold">倾斜（ratio）</th><th className="px-3 py-2 font-semibold">收敛速率（m/day）</th></tr></thead><tbody className="divide-y divide-ds-border-muted">{deformation.pairs.map((pair) => <tr key={pair.id}><td className="px-3 py-2.5 font-medium text-ds-ink">{pair.id} · {pair.kind}</td><td className="px-3 py-2.5 text-ds-muted">{pair.firstPointId} ↔ {pair.secondPointId}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{numberLabel(pair.differentialSettlement ?? pair.convergence, 7)}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{numberLabel(pair.tilt, 9)}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{numberLabel(pair.convergenceRatePerDay, 8)}</td></tr>)}</tbody></table></div> : null}<p className="mt-3 break-all font-mono text-[9.5px] text-ds-faint">{deformation.algorithmVersion} · {deformation.inputHash}</p></div> : null}</>}
          </div> : null}
        </div>

        <aside className="survey-workbench-aside border-t border-ds-border-muted bg-ds-main p-3 lg:col-span-2 2xl:col-span-1 2xl:border-l 2xl:border-t-0"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ds-faint">质量门禁</p><div className="mt-3 space-y-2">{network?.findings.length ? network.findings.slice(0, 6).map((finding, index) => <div key={`${finding.message}-${index}`} className={`flex gap-2 border px-2.5 py-2 text-[10.5px] leading-4 ${finding.severity === 'blocking' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'}`}><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{finding.message}</div>) : <div className="border border-dashed border-ds-border-muted px-2.5 py-3 text-[10.5px] leading-4 text-ds-muted">导入后这里会列出缺点、断网、单位冲突、秩亏和闭合差超限。</div>}</div><div className="mt-4 border-t border-ds-border-muted pt-3"><p className="text-[10px] font-semibold text-ds-ink">当前输入</p><dl className="mt-2 space-y-2 text-[10px]"><div className="flex justify-between gap-2"><dt className="text-ds-faint">来源</dt><dd className="max-w-[145px] truncate text-right text-ds-ink">{network?.id ?? '尚未导入'}</dd></div><div className="flex justify-between gap-2"><dt className="text-ds-faint">单位</dt><dd className="text-right text-ds-ink">项目配置</dd></div><div className="flex justify-between gap-2"><dt className="text-ds-faint">阻断项</dt><dd className={blockers ? 'font-semibold text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}>{blockers}</dd></div></dl></div><div className="mt-4 border-t border-ds-border-muted pt-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-ds-ink"><FileCode2 className="h-3.5 w-3.5 text-accent" />结果可追溯</p><p className="mt-1 text-[10px] leading-4 text-ds-muted">运行记录带输入哈希、算法版本和复核状态，不能原地覆盖。</p></div></aside>
      </div>
    </div>
    <SurveyResultSummary adjustment={adjustment} />
    {message ? <p role="status" className="mt-3 border border-ds-border-muted bg-ds-subtle px-3 py-2 text-[11px] text-ds-muted">{message}</p> : null}
    {busy ? <p className="mt-2 text-[10.5px] text-ds-faint">Runtime 正在处理测量网络…</p> : null}
  </section>
}

function SurveyResultSummary({ adjustment }: { adjustment: Adjustment | null }): ReactElement | null {
  // 粗差候选判定采用标准化残差 > 3σ，并同时尊重 Runtime 返回的 outlier 标记。
  if (!adjustment || !adjustment.result.points?.length) return null
  const pointRows = adjustment.result.points
  const outlierCount = adjustment.result.observations?.filter((item) => item.outlier || Math.abs(item.standardizedResidual ?? 0) > 3).length ?? 0
  const linearUnit = adjustment.result.linearUnit ?? 'm'
  return <section className="survey-result-summary mt-3 border border-ds-border-muted bg-ds-card" aria-label="平差点位成果">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ds-border-muted px-4 py-3"><div><h4 className="text-[12.5px] font-semibold text-ds-ink">点位成果与复核摘要</h4><p className="mt-0.5 text-[10.5px] text-ds-muted">平差后的坐标/高程、改正数和点位中误差；这是可写入成果包的确定性结果。</p></div><div className="flex items-center gap-3 text-[10.5px] text-ds-faint"><span>长度单位 {linearUnit}</span><span>协方差 {adjustment.result.covariance?.length ? '已返回' : '未返回'}</span><span className={outlierCount ? 'font-semibold text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}>粗差候选 {outlierCount}</span></div></div>
    <div className="overflow-x-auto"><table className="min-w-full text-left text-[10.5px]"><thead className="bg-ds-subtle text-ds-muted"><tr><th className="px-3 py-2 font-semibold">点号</th><th className="px-3 py-2 font-semibold">平差 X（{linearUnit}）</th><th className="px-3 py-2 font-semibold">平差 Y（{linearUnit}）</th><th className="px-3 py-2 font-semibold">纬度 / 经度（°）</th><th className="px-3 py-2 font-semibold">平差高程（{linearUnit}）</th><th className="px-3 py-2 font-semibold">改正数（{linearUnit}）</th><th className="px-3 py-2 font-semibold">点位中误差（{linearUnit}）</th></tr></thead><tbody className="divide-y divide-ds-border-muted">{pointRows.map((point) => <tr key={point.id} className="hover:bg-ds-hover"><td className="px-3 py-2.5 font-medium text-ds-ink">{point.id}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{numberLabel(point.x, 6)}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{numberLabel(point.y, 6)}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{point.latitude === undefined && point.longitude === undefined ? '—' : `${numberLabel(point.latitude, 8)} / ${numberLabel(point.longitude, 8)}`}</td><td className="px-3 py-2.5 tabular-nums text-ds-ink">{numberLabel(point.height, 6)}</td><td className="px-3 py-2.5 tabular-nums text-ds-muted">{numberLabel(point.correctionHeight ?? point.correctionX ?? point.correctionY, 7)}</td><td className="px-3 py-2.5 tabular-nums text-ds-muted">{numberLabel(point.standardError, 6)}</td></tr>)}</tbody></table></div>
  </section>
}
