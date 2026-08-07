// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CatalogSourceV1,
  InstalledPackageV1,
  MarketplacePackageV1,
  PreparedPluginImportV1
} from '@shared/marketplace'
import i18n from '../i18n'
import { useChatStore } from '../store/chat-store'
import { PluginMarketplaceView } from './PluginMarketplaceView'

const SOURCE: CatalogSourceV1 = {
  schemaVersion: 1,
  id: 'workwise-official',
  name: 'WorkWise Official',
  type: 'built-in',
  scope: 'system',
  location: 'workwise://marketplace/test',
  trust: 'system',
  searchable: true,
  auth: { type: 'none' },
  sync: {
    mode: 'bundled',
    state: 'synced',
    mirroredByDefault: false,
    installedByDefault: false
  }
}

function catalogPackage(id: string, version: string): MarketplacePackageV1 {
  const source = {
    id: `${id}-source`,
    catalogSourceId: SOURCE.id,
    kind: 'npm' as const,
    location: `https://www.npmjs.com/package/${id}`,
    packageName: id,
    version,
    resolvedRef: version,
    digest: { algorithm: 'sha512-sri' as const, value: 'sha512-dGVzdA==' }
  }
  return {
    schemaVersion: 1,
    id,
    name: id === 'browser-tools' ? 'Browser Tools' : 'Document Tools',
    summary: `Summary for ${id}`,
    tier: 'recommended',
    categories: [id === 'browser-tools' ? 'browser' : 'documents'],
    version,
    publisher: { id: 'workwise', name: 'WorkWise', verified: true },
    license: 'MIT',
    source,
    sources: [source],
    components: [{
      id: `${id}-mcp`,
      name: id,
      type: 'mcp',
      sourceId: source.id,
      runtime: {
        kind: 'npm',
        packageName: id,
        version,
        executable: id,
        args: [],
        install: {
          strategy: 'managed-download',
          verify: 'sri-before-activation',
          digestSource: 'component-source'
        }
      }
    }],
    permissions: id === 'browser-tools' ? [{
      id: 'browser.control',
      kind: 'browser',
      access: 'control',
      default: 'review',
      reviewRequired: true,
      description: 'Control a browser selected by the user.'
    }] : [],
    auth: { type: 'none' },
    licenseEvidence: [],
    dependencies: [],
    updatePolicy: { strategy: 'pinned', channel: 'stable', allowMajor: false },
    compatibility: { workwise: '>=0.3.5', platforms: ['darwin', 'win32', 'linux'], architectures: ['arm64', 'x64'] },
    availability: { status: 'available' },
    installation: { mode: 'direct-mirror', installedByDefault: false, reinstallable: true }
  }
}

const BROWSER = catalogPackage('browser-tools', '2.0.0')
const DOCUMENTS = catalogPackage('document-tools', '1.0.0')

const INSTALLED: InstalledPackageV1 = {
  schemaVersion: 1,
  packageId: BROWSER.id,
  version: '1.0.0',
  license: 'MIT',
  reviewSha256: 'a'.repeat(64),
  source: BROWSER.source,
  sources: BROWSER.sources,
  components: BROWSER.components.map((component) => ({ componentId: component.id, sourceId: component.sourceId })),
  scope: 'user',
  artifact: { sha256: 'b'.repeat(64), location: '/tmp/browser-tools', fileCount: 2, totalBytes: 20 },
  permissions: [],
  timestamps: { installedAt: '2026-08-01T00:00:00.000Z' },
  updatePolicy: BROWSER.updatePolicy,
  rollback: { available: false },
  health: { status: 'healthy' }
}

let container: HTMLDivElement
let root: Root
let installPrepared: ReturnType<typeof vi.fn>

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function button(text: string): HTMLButtonElement {
  const result = [...container.querySelectorAll('button')].find((candidate) => {
    const content = candidate.textContent?.trim() ?? ''
    return content === text || content.startsWith(text)
  })
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Button not found: ${text}`)
  return result
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  useChatStore.setState({ workspaceRoot: '/tmp/workwise-marketplace-qa' })
  installPrepared = vi.fn(async () => INSTALLED)
  Object.defineProperty(window, 'workwise', {
    configurable: true,
    value: {
      listCatalogSources: vi.fn(async () => [SOURCE]),
      listCatalogPackages: vi.fn(async () => ({
        packages: [
          { key: `${SOURCE.id}:${BROWSER.id}`, sourceId: SOURCE.id, package: BROWSER, conflicted: false },
          { key: `${SOURCE.id}:${DOCUMENTS.id}`, sourceId: SOURCE.id, package: DOCUMENTS, conflicted: false }
        ],
        conflicts: []
      })),
      listInstalledPlugins: vi.fn(async () => [INSTALLED]),
      listMcpServers: vi.fn(async () => []),
      listSkills: vi.fn(async () => ({ ok: true as const, generation: 1, skills: [], validationErrors: [] })),
      onSkillsChanged: vi.fn(() => () => undefined),
      pickPluginPackage: vi.fn(async () => ({ canceled: false, path: '/tmp/example.wwx' })),
      preparePluginImport: vi.fn(async (): Promise<PreparedPluginImportV1> => ({
        schemaVersion: 1,
        id: 'prepared-1',
        createdAt: '2026-08-08T00:00:00.000Z',
        expiresAt: '2026-08-08T00:30:00.000Z',
        format: 'wwx',
        package: DOCUMENTS,
        contentSha256: 'c'.repeat(64),
        reviewSha256: 'd'.repeat(64),
        warnings: [],
        compatibility: { workwiseCompatible: true, reasons: [] }
      })),
      installPreparedPlugin: installPrepared,
      cancelPluginImport: vi.fn(async () => true),
      openExternal: vi.fn(async () => undefined)
    } as unknown as typeof window.workwise
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(createElement(PluginMarketplaceView)))
  await settle()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(window, 'workwise')
  vi.restoreAllMocks()
})

describe('PluginMarketplaceView unified catalog', () => {
  it('uses main-process install state and isolates update results', async () => {
    expect(container.textContent).toContain('Browser Tools')
    expect(container.textContent).toContain('Document Tools')
    expect(container.textContent).toContain('Review update')

    await act(async () => button('Updates').click())
    expect(container.textContent).toContain('Browser Tools')
    expect(container.textContent).not.toContain('Document Tools')
  })

  it('imports a package through review and installs with explicit permission decisions', async () => {
    await act(async () => button('Import').click())
    await act(async () => button('WWX or MCPB package').click())
    await settle()
    expect(container.textContent).toContain('Review Document Tools')
    await act(async () => button('Install').click())
    await settle()
    expect(installPrepared).toHaveBeenCalledWith(expect.objectContaining({
      preparedId: 'prepared-1',
      expectedCurrentVersion: null,
      scope: 'workspace',
      permissions: []
    }))
  })
})
