/**
 * 历史版本使用过两组 localStorage 前缀。这里只负责将它们
 * 一次性导入 `workwise.` 命名空间：
 *   - 只在新键不存在时拷贝,重复执行安全;
 *   - 旧键保留不删,用户回滚老版本时 UI 状态(线程注册表、布局等)
 *     仍然完整;
 *   - 这个模块必须是 renderer 入口的第一个 import:plan/sdd/chat 等
 *     store 在模块求值阶段就会读取 localStorage,迁移晚一步它们就会
 *     拿到空状态。
 */

const LEGACY_PREFIXES = ['deepseekgui.', 'kun.'] as const
const NEW_PREFIX = 'workwise.'

export function migrateLegacyLocalStorageKeys(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>): number {
  let migrated = 0
  let legacyKeys: Array<{ key: string; prefix: string }> = []
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      const prefix = key ? LEGACY_PREFIXES.find((candidate) => key.startsWith(candidate)) : undefined
      if (key && prefix) legacyKeys.push({ key, prefix })
    }
  } catch {
    legacyKeys = []
  }

  for (const { key, prefix } of legacyKeys) {
    const newKey = NEW_PREFIX + key.slice(prefix.length)
    try {
      if (storage.getItem(newKey) !== null) continue
      const value = storage.getItem(key)
      if (value === null) continue
      storage.setItem(newKey, value)
      migrated += 1
    } catch {
      // 配额满等异常:跳过这个键,尽量迁完其余的。
    }
  }
  return migrated
}

// import 即执行(renderer 入口的第一行 import 就是这个模块)。
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    migrateLegacyLocalStorageKeys(window.localStorage)
  } catch {
    // localStorage 不可用(隐私模式等):静默放弃,UI 退化为默认状态。
  }
}
