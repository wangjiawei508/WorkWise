type ElectronNetModule = {
  net?: {
    fetch: typeof fetch
  }
}

/**
 * Electron's Chromium network stack follows the operating-system proxy
 * configuration. Node's built-in fetch does not, which makes downloads fail
 * in packaged desktop builds even though the same URL works in a browser.
 */
export async function systemFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  if (process.versions.electron) {
    const electron = await import('electron') as ElectronNetModule
    if (electron.net?.fetch) return electron.net.fetch(input, init)
  }
  return fetch(input, init)
}

export function describeNetworkFailure(error: unknown, target = 'GitHub'): string {
  const value = error as { message?: unknown; cause?: { code?: unknown; message?: unknown } }
  const message = typeof value?.message === 'string' ? value.message.trim() : String(error)
  const causeCode = typeof value?.cause?.code === 'string' ? value.cause.code.trim() : ''
  const causeMessage = typeof value?.cause?.message === 'string' ? value.cause.message.trim() : ''
  const detail = [causeCode, causeMessage || message].filter(Boolean).join(': ')
  return `${target} connection failed through the system network settings${detail ? ` (${detail})` : ''}. Check the macOS/Windows proxy and try again.`
}
