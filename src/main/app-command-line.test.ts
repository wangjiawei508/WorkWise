import { beforeEach, describe, expect, it, vi } from 'vitest'

const appendSwitch = vi.fn()
const removeSwitch = vi.fn()
const hasSwitch = vi.fn()

vi.mock('electron', () => ({
  app: {
    commandLine: {
      hasSwitch,
      appendSwitch,
      removeSwitch
    }
  }
}))

describe('app command line bootstrap', () => {
  beforeEach(() => {
    appendSwitch.mockReset()
    removeSwitch.mockReset()
    hasSwitch.mockReset()
    hasSwitch.mockReturnValue(false)
    vi.resetModules()
  })

  it('enables Wayland IME switches on Linux', async () => {
    const { configureLinuxWaylandImeSwitches } = await import('./app-command-line')

    configureLinuxWaylandImeSwitches('linux')

    expect(appendSwitch).toHaveBeenCalledTimes(2)
    expect(appendSwitch).toHaveBeenNthCalledWith(1, 'ozone-platform-hint', 'auto')
    expect(appendSwitch).toHaveBeenNthCalledWith(2, 'enable-wayland-ime')
  })

  it('passes isolated candidate userData to Chromium child processes', async () => {
    const { configureChromiumUserDataPath } = await import('./app-command-line')

    configureChromiumUserDataPath('/private/tmp/workwise-candidate/user-data')

    expect(removeSwitch).toHaveBeenCalledWith('user-data-dir')
    expect(appendSwitch).toHaveBeenCalledWith(
      'user-data-dir',
      '/private/tmp/workwise-candidate/user-data'
    )
  })

  it('rejects an empty Chromium userData path', async () => {
    const { configureChromiumUserDataPath } = await import('./app-command-line')

    expect(() => configureChromiumUserDataPath('  ')).toThrow('must not be empty')
  })

  it('keeps user-provided switches unchanged', async () => {
    hasSwitch.mockImplementation((name: string) => name === 'ozone-platform-hint')
    const { configureLinuxWaylandImeSwitches } = await import('./app-command-line')

    configureLinuxWaylandImeSwitches('linux')

    expect(appendSwitch).toHaveBeenCalledTimes(1)
    expect(appendSwitch).toHaveBeenCalledWith('enable-wayland-ime')
  })

  it('does not add Wayland IME switches on other platforms', async () => {
    const { configureLinuxWaylandImeSwitches } = await import('./app-command-line')

    configureLinuxWaylandImeSwitches('win32')
    configureLinuxWaylandImeSwitches('darwin')

    expect(appendSwitch).not.toHaveBeenCalled()
  })
})
