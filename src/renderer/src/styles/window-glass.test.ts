import { describe, expect, it } from 'vitest'

describe('native glass surface contract', () => {
  it('limits transparency to chrome while keeping working surfaces opaque', async () => {
    const nodeFs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ nodeFs)
    const css = await readFile(new URL('./surfaces-write.css', import.meta.url), 'utf8')

    expect(css).toContain(":root[data-window-transparency='enabled'] .ds-sidebar-shell")
    expect(css).toContain(":root[data-window-transparency='disabled'] .ds-sidebar-shell")
    expect(css).toContain(":root[data-window-transparency='enabled'] .ds-windows-titlebar")
    expect(css).toContain(":root[data-window-transparency='enabled'] .ds-topbar-surface")
    expect(css).toContain('.ds-opaque-work-surface')
    expect(css).toContain('.write-codemirror-host')
    expect(css).toContain('prefers-reduced-transparency: reduce')
    expect(css).toContain('forced-colors: active')
    expect(css).toContain('prefers-contrast: more')
  })
})
