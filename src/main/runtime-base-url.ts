/**
 * Base URL resolution for the WorkWise Runtime local HTTP server. The
 * server is always bound to localhost; the GUI reads the port from
 * settings (default 8899).
 */
export function getManagedRuntimeBaseUrl(port: number, host = '127.0.0.1'): string {
  return `http://${host}:${port}`
}
