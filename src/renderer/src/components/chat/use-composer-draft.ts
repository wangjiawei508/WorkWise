import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'

type UseComposerDraftOptions = {
  input: string
  canCompose: boolean
  minHeight?: number
  maxHeight?: number
}

export function resolveComposerTextareaLayout(
  scrollHeight: number,
  minHeight = 36,
  maxHeight = 176
): { height: number; overflowY: 'auto' | 'hidden' } {
  const safeMinHeight = Math.max(1, Math.min(minHeight, maxHeight))
  const safeMaxHeight = Math.max(safeMinHeight, maxHeight)
  const contentHeight = Math.max(0, scrollHeight)
  return {
    height: Math.max(safeMinHeight, Math.min(contentHeight, safeMaxHeight)),
    overflowY: contentHeight > safeMaxHeight ? 'auto' : 'hidden'
  }
}

export function useComposerDraft({
  input,
  canCompose,
  minHeight = 36,
  maxHeight = 176
}: UseComposerDraftOptions): {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  focused: boolean
  focusComposer: () => void
  onFocus: () => void
  onBlur: () => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
  isComposingEvent: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean
} {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composingRef = useRef(false)
  const [focused, setFocused] = useState(false)

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return

    el.style.height = '0px'
    const layout = resolveComposerTextareaLayout(el.scrollHeight, minHeight, maxHeight)
    el.style.height = `${layout.height}px`
    el.style.overflowY = layout.overflowY
  }, [maxHeight, minHeight])

  useLayoutEffect(() => {
    resizeTextarea()
  }, [canCompose, input, resizeTextarea])

  useEffect(() => {
    const el = textareaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    let frame = 0
    let previousWidth = el.getBoundingClientRect().width
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width ?? el.getBoundingClientRect().width
      if (Math.abs(nextWidth - previousWidth) < 0.5) return
      previousWidth = nextWidth
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(resizeTextarea)
    })

    observer.observe(el)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [resizeTextarea])

  const focusComposer = useCallback(() => {
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  return {
    textareaRef,
    focused,
    focusComposer,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onCompositionStart: () => {
      composingRef.current = true
    },
    onCompositionEnd: () => {
      composingRef.current = false
    },
    isComposingEvent: (event) =>
      event.nativeEvent.isComposing || composingRef.current || event.keyCode === 229
  }
}
