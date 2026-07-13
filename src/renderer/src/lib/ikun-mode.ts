import { readBrowserStorageItem, writeBrowserStorageItem } from './browser-storage'

export const IKUN_MODE_STORAGE_KEY = 'kun.ikunMode'

export function readIkunModePreference(): boolean {
  const value = readBrowserStorageItem(IKUN_MODE_STORAGE_KEY)?.trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'on'
}

export function writeIkunModePreference(enabled: boolean): void {
  writeBrowserStorageItem(IKUN_MODE_STORAGE_KEY, enabled ? '1' : '0')
}
