import { useState, type ReactElement } from 'react'
import { Calculator, CheckCircle2, FileUp, Play, ShieldAlert } from 'lucide-react'
import { rendererRuntimeClient } from '../../agent/runtime-client'

type Project = { id: string; revision: number }
type Network = { id: string; revision: number; networkType: string; knownPoints: unknown[]; unknownPoints: unknown[]; observations: unknown[]; qualityStatus: string; findings: Array<{ severity: string; message: string }> }
type Adjustment = { run: { id: string; status: string; revision: number }; result: { id: string; validation: string; observationCount: number; unknownCount: number; redundancy: number; unitWeightStdDev: number; precision: { maxPointStdDev: number; passed: boolean }; qualityFindings: Array<{ severity: string; message: string }> } }

const sampleNetwork = JSON.stringify({
  networkType: 'leveling',
  knownPoints: [{ id: 'BM-01', pointClass: 'known', height: 100, known: true }],
  unknownPoints: [{ id: 'P-01', pointClass: 'unknown', height: 100.2, known: false }],
  observations: [{ id: 'obs-1', type: 'height-difference', from: 'BM-01', to: 'P-01', value: 0.2, unit: 'm', sigma: 0.002 }]
}, null, 2)

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await rendererRuntimeClient.runtimeRequest(path, method, body === undefined ? undefined : JSON.stringify(body))
  if (!response.ok) throw new Error(response.body || `Runtime request failed (${response.status})`)
  return JSON.parse(response.body) as T
}

export function SurveyAdjustmentPanel({ project, runtimeReady, onAdjustmentComplete }: { project: Project; runtimeReady: boolean; onAdjustmentComplete?: (id: string) => void }): ReactElement {
  const [networkType, setNetworkType] = useState('leveling')
  const [payload, setPayload] = useState(sampleNetwork)
  const [network, setNetwork] = useState<Network | null>(null)
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const readFile = (file: File): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error ?? new Error('无法读取测量文件')); reader.onload = () => { const value = typeof reader.result === 'string' ? reader.result : ''; const comma = value.indexOf(','); resolve(comma >= 0 ? value.slice(comma + 1) : value) }; reader.readAsDataURL(file) })
  const importNetwork = async (): Promise<void> => {
    setBusy(true); setMessage('')
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      const result = await request<{ network: Network }>('/v1/engineering/survey/networks/import', 'POST', { projectId: project.id, networkType, network: parsed, expectedRevision: project.revision, idempotencyKey: `survey-import-${project.id}-${Date.now()}` })
      setNetwork(result.network); setAdjustment(null); setMessage('测量网络已导入，请执行质量校核。')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const importFile = async (file: File): Promise<void> => {
    setBusy(true); setMessage('')
    try { const dataBase64 = await readFile(file); const result = await request<{ network: Network }>('/v1/engineering/survey/networks/import', 'POST', { projectId: project.id, networkType, name: file.name, dataBase64, expectedRevision: project.revision, idempotencyKey: `survey-file-import-${project.id}-${file.name}-${file.size}-${file.lastModified}` }); setNetwork(result.network); setAdjustment(null); setMessage(`${file.name} 已导入，支持 CSV/XLSX/JSON 结构化观测。`) }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false); setFileInputKey((value) => value + 1) }
  }
  const validate = async (): Promise<void> => {
    if (!network) return
    setBusy(true); setMessage('')
    try { const result = await request<{ network: Network }>(`/v1/engineering/survey/networks/${network.id}/validate`, 'POST', { expectedRevision: network.revision, idempotencyKey: `survey-validate-${network.id}-${network.revision}` }); setNetwork(result.network); setMessage(result.network.qualityStatus === 'blocked' ? '网络存在阻断项，请修正观测或基准后再平差。' : '质量校核通过，可以运行平差。') }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const adjust = async (): Promise<void> => {
    if (!network) return
    setBusy(true); setMessage('')
    try { const result = await request<Adjustment>('/v1/engineering/adjustments', 'POST', { networkId: network.id, expectedRevision: network.revision, idempotencyKey: `survey-adjust-${network.id}-${network.revision}`, method: 'weighted-least-squares' }); setAdjustment(result); onAdjustmentComplete?.(result.run.id); setMessage(result.run.status === 'completed' ? '平差完成，结果已锁定输入哈希和算法版本。' : '平差未完成，请查看质量问题。') }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  return <section className="p-5" aria-label="测量与平差工作台">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="border border-ds-border-muted bg-ds-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border-muted px-4 py-3"><div><p className="flex items-center gap-2 text-[13px] font-semibold"><Calculator className="h-4 w-4 text-accent" />测量与平差工作台</p><p className="mt-1 text-[11px] text-ds-muted">AI 负责识别网型与解释结果，数值由 Runtime 确定性计算。</p></div><select value={networkType} onChange={(event) => setNetworkType(event.target.value)} className="h-8 rounded-md border border-ds-border bg-ds-card px-2 text-[12px] text-ds-ink"><option value="leveling">水准/高程控制网</option><option value="traverse">附合/闭合导线</option><option value="plane-control">平面控制网</option><option value="triangulation">三角网</option><option value="cpiii-free-station">CPIII 自由测站</option><option value="cpiii-resection">CPIII 后方交会</option><option value="gnss">GNSS 基线</option></select></div>
        <div className="space-y-3 p-4"><label className="block text-[11px] font-medium text-ds-muted" htmlFor="survey-network-json">网络 JSON / 结构化观测</label><textarea id="survey-network-json" value={payload} onChange={(event) => setPayload(event.target.value)} className="min-h-[260px] w-full rounded-md border border-ds-border bg-ds-main p-3 font-mono text-[11px] leading-5 text-ds-ink outline-none focus:border-accent" spellCheck={false} /><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void importNetwork()} disabled={!runtimeReady || busy} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-semibold text-white disabled:opacity-50"><FileUp className="h-3.5 w-3.5" />导入测量网络</button><label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-ds-border px-3 text-[12px] font-medium text-ds-ink hover:bg-ds-hover"><FileUp className="h-3.5 w-3.5" />选择 CSV/XLSX/JSON<input key={fileInputKey} type="file" accept=".csv,.xlsx,.json,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={!runtimeReady || busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file) }} /></label><button type="button" onClick={() => void validate()} disabled={!network || busy} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ds-border px-3 text-[12px] font-medium text-ds-ink disabled:opacity-50"><ShieldAlert className="h-3.5 w-3.5" />质量校核</button><button type="button" onClick={() => void adjust()} disabled={!network || busy || network.qualityStatus === 'blocked'} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-3 text-[12px] font-semibold text-green-800 disabled:opacity-50 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200"><Play className="h-3.5 w-3.5" />运行平差</button></div>{message ? <p role="status" className="rounded-md border border-ds-border-muted bg-ds-subtle px-3 py-2 text-[11px] text-ds-muted">{message}</p> : null}</div>
      </div>
      <aside className="border border-ds-border-muted bg-ds-card"><div className="border-b border-ds-border-muted px-4 py-3"><p className="text-[13px] font-semibold">结果与证据</p><p className="mt-1 text-[11px] text-ds-faint">项目修订 {project.revision} · 结果不可覆盖，只能生成新运行。</p></div>{network ? <div className="space-y-2 px-4 py-3 text-[11px]"><p><span className="text-ds-faint">网络：</span><span className="font-mono">{network.id}</span></p><p><span className="text-ds-faint">点/观测：</span>{network.knownPoints.length + network.unknownPoints.length} / {network.observations.length}</p><p><span className="text-ds-faint">状态：</span>{network.qualityStatus}</p>{network.findings.slice(0, 4).map((finding, index) => <p key={`${finding.message}-${index}`} className="flex gap-1.5 text-amber-800 dark:text-amber-200"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{finding.message}</p>)}</div> : <p className="px-4 py-8 text-center text-[11px] text-ds-faint">导入网络后显示质量和来源信息。</p>}{adjustment ? <div className="space-y-2 border-t border-ds-border-muted px-4 py-3 text-[11px]"><p className="flex items-center gap-1.5 font-semibold text-ds-ink"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" />{adjustment.run.status}</p><p>观测 {adjustment.result.observationCount} · 未知数 {adjustment.result.unknownCount} · 多余观测 {adjustment.result.redundancy}</p><p>单位权中误差 {adjustment.result.unitWeightStdDev.toFixed(6)}</p><p>最大点位中误差 {adjustment.result.precision.maxPointStdDev.toFixed(6)} · {adjustment.result.precision.passed ? '精度通过' : '需要复核'}</p></div> : null}</aside>
    </div>
  </section>
}
