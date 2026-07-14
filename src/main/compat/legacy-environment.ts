/** Read-only environment compatibility for releases before WorkWise 0.2.5. */
function first(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

export const legacyStartupTraceEnabled = (): boolean =>
  first('RUNTIME_STARTUP_TRACE', 'DEEPSEEK_GUI_STARTUP_TRACE') === '1'

export const legacyUpdateChannel = (): string =>
  first('KUN_UPDATE_CHANNEL', 'DEEPSEEK_GUI_UPDATE_CHANNEL')

export const legacyUpdateUrl = (channel: string): string =>
  first(`WORKGPT_UPDATE_URL_${channel.toUpperCase()}`, 'WORKGPT_UPDATE_URL')

export const legacyUpdateProvider = (): string => first('WORKGPT_UPDATE_PROVIDER')
export const legacyGithubUpdateFallbackEnabled = (): boolean =>
  first('WORKGPT_ENABLE_GITHUB_UPDATE_FALLBACK') === '1'
export const legacyGithubRepo = (): string => first('WORKGPT_GITHUB_REPO')
export const legacyDownloadUrl = (): string => first('WORKGPT_DOWNLOAD_URL')
export const legacyUnsignedUpdatesEnabled = (): boolean =>
  first('DEEPSEEK_GUI_ALLOW_UNSIGNED_UPDATES') === '1'
export const legacyConverterRoot = (): string => first('WORKGPT_CONVERTER_ROOT')
export const legacyPandocPath = (): string => first('WORKGPT_PANDOC_PATH')
export const legacyMarkdownConverterPath = (): string => first('WORKGPT_MD2DOCX_PATH')
export const legacyWeixinBridgeUrls = (): string[] => [
  first('DEEPSEEK_GUI_WEIXIN_BRIDGE_URL'),
  first('DEEPSEEK_GUI_OPENCLAW_GATEWAY_URL')
].filter(Boolean)
