import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { CosaIn1MappingRequestV1 } from '../../../../../kun/src/contracts/survey'

export type CosaIn1Mapping = CosaIn1MappingRequestV1
const knownFields = ['point', 'height'] as const
const observationFields = ['from', 'to', 'value', 'routeLengthKm'] as const
const labels = {
  point: 'surveyMappingPoint', height: 'surveyMappingHeight', from: 'surveyMappingFrom',
  to: 'surveyMappingTo', value: 'surveyMappingDifference', routeLengthKm: 'surveyMappingLength'
} as const

/** Explicit choices only: neither a filename nor its content selects column semantics. */
export function CosaIn1MappingForm({ fileName, disabled, onConfirm, onCancel }: {
  fileName: string
  disabled: boolean
  onConfirm: (mapping: CosaIn1Mapping) => void
  onCancel: () => void
}): ReactElement {
  const { t } = useTranslation('common')
  const [encoding, setEncoding] = useState<'ascii' | 'gb18030'>('ascii')
  const [delimiter, setDelimiter] = useState<'csv' | 'csv-fullwidth-comma' | 'whitespace'>('csv')
  const [knownCount, setKnownCount] = useState('')
  const [columns, setColumns] = useState({ point: 0, height: 1, from: 0, to: 1, value: 2, routeLengthKm: 3 })
  const countValid = knownCount === '' || (/^\d+$/.test(knownCount) && Number(knownCount) >= 1 && Number(knownCount) <= 10_000)
  const columnsValid = new Set(knownFields.map((field) => columns[field])).size === knownFields.length
    && new Set(observationFields.map((field) => columns[field])).size === observationFields.length
  const valid = countValid && columnsValid
  const controlClass = 'h-9 w-full rounded-md border border-ds-border bg-ds-card px-2 text-[12px] text-ds-ink outline-none focus:border-accent'
  const section = (kind: 'knownPoints' | 'observations', fields: readonly (keyof typeof columns)[]): CosaIn1Mapping['knownPoints'] => ({
    schemaVersion: 'survey-column-mapping/v1', mappingId: `cosa-in1-ui-${kind}-${delimiter}-${fields.map((field) => columns[field]).join('-')}`, revision: 1,
    formatId: 'cosa-in1', delimiter, bindings: fields.map((field) => ({ field, columnIndex: columns[field] }))
  })
  return <form aria-label={t('surveyCosaMappingTitle')} className="mb-3 space-y-3 rounded-md border border-ds-border bg-ds-main p-4" onSubmit={(event) => {
    event.preventDefault()
    if (disabled || !valid) return
    onConfirm({
      schemaVersion: 'cosa-in1-mapping/v1', heightUnit: 'm', routeLengthUnit: 'km', textEncoding: encoding,
      ...(knownCount === '' ? {} : { knownPointRecordCount: Number(knownCount) }),
      knownPoints: section('knownPoints', knownFields), observations: section('observations', observationFields)
    })
  }}>
    <div><h4 className="text-[13px] font-semibold">{t('surveyCosaMappingTitle')}</h4><p className="mt-1 break-all text-[12px] text-ds-muted">{fileName}</p></div>
    <fieldset disabled={disabled} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-[12px]">{t('surveyMappingEncoding')}<select className={controlClass} value={encoding} onChange={(event) => setEncoding(event.target.value as typeof encoding)}><option value="ascii">ASCII</option><option value="gb18030">GB18030</option></select></label>
        <label className="space-y-1 text-[12px]">{t('surveyMappingDelimiter')}<select className={controlClass} value={delimiter} onChange={(event) => setDelimiter(event.target.value as typeof delimiter)}><option value="csv">{t('surveyMappingComma')}</option><option value="csv-fullwidth-comma">{t('surveyMappingFullwidthComma')}</option><option value="whitespace">{t('surveyMappingWhitespace')}</option></select></label>
        <label className="space-y-1 text-[12px]">{t('surveyMappingKnownCount')}<input className={controlClass} type="number" min={1} max={10000} step={1} value={knownCount} placeholder={t('surveyMappingBlankSeparator')} onChange={(event) => setKnownCount(event.target.value)} /></label>
      </div>
      {([['surveyMappingKnownColumns', knownFields], ['surveyMappingObservationColumns', observationFields]] as const).map(([title, fields]) => <fieldset key={title}>
        <legend className="mb-2 text-[12px] font-medium">{t(title)}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{fields.map((field) => <label key={field} className="space-y-1 text-[12px] text-ds-muted">{t(labels[field])}<select className={controlClass} value={columns[field]} onChange={(event) => setColumns((current) => ({ ...current, [field]: Number(event.target.value) }))}>{fields.map((_, index) => <option key={index} value={index}>{t('surveyMappingColumn', { column: index + 1 })}</option>)}</select></label>)}</div>
      </fieldset>)}
    </fieldset>
    {!valid ? <p role="alert" className="text-[12px] text-red-700 dark:text-red-300">{t(!countValid ? 'surveyMappingCountInvalid' : 'surveyMappingColumnsInvalid')}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[12px] text-ds-muted">{t('surveyMappingUnits')}</p><div className="flex gap-2"><button type="button" disabled={disabled} onClick={onCancel} className="h-9 rounded-md border border-ds-border px-3 text-[12px] disabled:opacity-50">{t('surveyMappingCancel')}</button><button type="submit" disabled={disabled || !valid} className="h-9 rounded-md bg-accent px-3 text-[12px] text-white disabled:opacity-50">{t('surveyMappingConfirm')}</button></div></div>
  </form>
}
