import { lstat, readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  InstalledPackageV1,
  MarketplaceComponentV1,
  MarketplacePackageV1
} from '../../shared/marketplace'
import { isCanonicalPathContained } from './canonical-containment'
import type { McpConfigService } from './mcp-config-service'

const MAX_PACKAGE_JSON_BYTES = 1024 * 1024

export type ActivatePluginPackageOptions = {
  item: MarketplacePackageV1
  installed: InstalledPackageV1
  workspaceRoot?: string
  mcpConfigService: McpConfigService
  idempotencyKey: string
}

function permissionGranted(item: MarketplacePackageV1, installed: InstalledPackageV1): boolean {
  const decisions = new Map(installed.permissions.map((permission) => [
    permission.permissionId,
    permission.decision
  ]))
  return item.permissions.every((permission) => decisions.get(permission.id) === 'granted')
}

function replaceWorkspace(value: string, workspaceRoot: string | undefined): string {
  if (!value.includes('${workspaceRoot}')) return value
  return workspaceRoot ? value.replaceAll('${workspaceRoot}', workspaceRoot) : ''
}

async function verifiedArtifactPath(root: string, relativePath: string): Promise<string> {
  const canonicalRoot = await realpath(root)
  const target = resolve(canonicalRoot, relativePath)
  if (!isCanonicalPathContained(canonicalRoot, target)) throw new Error('Plugin runtime path escapes its artifact.')
  const info = await lstat(target)
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('Plugin runtime entrypoint must be a regular file.')
  const canonical = await realpath(target)
  if (!isCanonicalPathContained(canonicalRoot, canonical)) throw new Error('Plugin runtime entrypoint escapes its artifact.')
  return canonical
}

async function npmEntrypoint(
  root: string,
  packageName: string,
  executable: string
): Promise<string> {
  const packageRoot = join(root, 'node_modules', ...packageName.split('/').filter(Boolean))
  const manifestPath = await verifiedArtifactPath(packageRoot, 'package.json')
  const info = await lstat(manifestPath)
  if (info.size > MAX_PACKAGE_JSON_BYTES) throw new Error('Plugin npm package manifest exceeds 1 MiB.')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { bin?: string | Record<string, string> }
  const bin = typeof manifest.bin === 'string'
    ? manifest.bin
    : manifest.bin?.[executable] ?? Object.values(manifest.bin ?? {})[0]
  if (!bin) throw new Error(`Plugin npm executable was not found: ${executable}.`)
  return verifiedArtifactPath(packageRoot, bin)
}

async function stdioLaunch(
  component: Extract<MarketplaceComponentV1, { type: 'mcp' }>,
  artifactRoot: string,
  workspaceRoot: string | undefined
): Promise<{ command: string; args: string[] } | null> {
  const runtime = component.runtime
  if (runtime.kind === 'npm') {
    const entrypoint = await npmEntrypoint(
      artifactRoot,
      runtime.packageName,
      runtime.executable
    )
    return {
      command: process.platform === 'win32' ? 'node.exe' : 'node',
      args: [entrypoint, ...runtime.args.map((arg) => replaceWorkspace(arg, workspaceRoot))]
    }
  }
  if (runtime.kind === 'bundled') {
    const entrypoint = await verifiedArtifactPath(artifactRoot, runtime.entrypoint)
    const executable = runtime.executable?.trim() || entrypoint
    const command = executable.startsWith('./')
      ? await verifiedArtifactPath(artifactRoot, executable)
      : executable
    const args = (runtime.args ?? []).map((arg) => {
      const workspaceValue = replaceWorkspace(arg, workspaceRoot)
      return workspaceValue.startsWith('./') ? resolve(artifactRoot, workspaceValue) : workspaceValue
    })
    if (command !== entrypoint && !args.includes(entrypoint)) args.unshift(entrypoint)
    return { command, args }
  }
  if (runtime.kind === 'uv') {
    return { command: runtime.executable, args: runtime.args.map((arg) => replaceWorkspace(arg, workspaceRoot)) }
  }
  return null
}

export async function activatePluginPackage(options: ActivatePluginPackageOptions): Promise<void> {
  const enabledByPermissions = permissionGranted(options.item, options.installed)
  for (const component of options.item.components) {
    if (component.type !== 'mcp' || component.runtime.kind === 'system') continue
    const existing = (await options.mcpConfigService.list(options.workspaceRoot))
      .find((server) => server.id === component.id)
    const scope = options.installed.scope === 'workspace' && options.workspaceRoot
      ? 'workspace' as const
      : 'global' as const
    const common = {
      id: component.id,
      name: component.name,
      scope,
      ...(scope === 'workspace' ? { workspaceRoot: options.workspaceRoot } : {}),
      timeoutMs: 30_000,
      source: 'managed-tool' as const,
      credentialEnvironmentVariables: options.item.auth.type === 'token'
        ? options.item.auth.environmentVariables
        : undefined,
      toolPolicy: {},
      enabled: enabledByPermissions,
      revision: existing?.revision
    }
    if (component.runtime.kind === 'remote') {
      await options.mcpConfigService.save({
        config: {
          ...common,
          transport: 'http',
          url: component.runtime.endpoint,
          ...(options.item.auth.type === 'oauth'
            ? {
                oauth: {
                  resource: component.runtime.oauthResource ?? component.runtime.endpoint,
                  redirectUri: 'http://127.0.0.1:17864/oauth/callback',
                  scopes: options.item.auth.scopes ?? []
                }
              }
            : {})
        },
        expectedRevision: existing?.revision ?? 0,
        idempotencyKey: `${options.idempotencyKey}:${component.id}`
      })
      continue
    }
    const launch = await stdioLaunch(
      component,
      options.installed.artifact.location,
      options.workspaceRoot
    )
    if (!launch) continue
    const hasMissingWorkspace = launch.args.some((arg) => !arg)
    await options.mcpConfigService.save({
      config: {
        ...common,
        transport: 'stdio',
        command: launch.command,
        args: launch.args.filter(Boolean),
        enabled: common.enabled && !hasMissingWorkspace
      },
      expectedRevision: existing?.revision ?? 0,
      idempotencyKey: `${options.idempotencyKey}:${component.id}`
    })
  }
}
