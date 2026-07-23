import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function resolvePptMasterScript(scriptName: string): string | null {
  const resourcesPath = process.resourcesPath?.trim() ?? ''
  const roots = [
    process.env.WORKWISE_PPT_MASTER_ROOT?.trim(),
    resourcesPath
      ? join(resourcesPath, 'app.asar.unpacked', 'src', 'asset', 'skills', 'ppt-master')
      : '',
    resourcesPath
      ? join(resourcesPath, 'src', 'asset', 'skills', 'ppt-master')
      : '',
    join(process.cwd(), 'src', 'asset', 'skills', 'ppt-master')
  ].filter(Boolean) as string[]

  for (const root of roots) {
    const scriptPath = join(root, 'scripts', scriptName)
    if (existsSync(scriptPath)) return scriptPath
  }
  return null
}
