import { useEffect, useRef, type MutableRefObject, type ReactElement } from 'react'

export type WriteRichEditorHandle = {
  getProjectionText: () => string
  applyProjectedReplacement: (
    range: { from: number; to: number },
    expected: string,
    replacement: string,
    _label?: string
  ) => boolean
}

type Props = {
  value: string
  onChange: (value: string) => void
  handleRef?: MutableRefObject<WriteRichEditorHandle | null>
  fallback: ReactElement
  requirementBadges?: boolean
  [key: string]: unknown
}

/**
 * Compatibility boundary for the former rich editor.
 *
 * WorkWise uses its maintained Markdown editor for rendering and exposes only
 * the small projection API required by inline edits and infographic insertion.
 */
export function WriteRichEditor({ value, onChange, handleRef, fallback }: Props): ReactElement {
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  valueRef.current = value
  onChangeRef.current = onChange

  useEffect(() => {
    if (!handleRef) return
    handleRef.current = {
      getProjectionText: () => valueRef.current,
      applyProjectedReplacement: (range, expected, replacement) => {
        const source = valueRef.current
        const from = Math.max(0, Math.min(source.length, Math.trunc(range.from)))
        const to = Math.max(from, Math.min(source.length, Math.trunc(range.to)))
        if (source.slice(from, to) !== expected) return false
        const next = `${source.slice(0, from)}${replacement}${source.slice(to)}`
        valueRef.current = next
        onChangeRef.current(next)
        return true
      }
    }
    return () => {
      handleRef.current = null
    }
  }, [handleRef])

  return fallback
}
