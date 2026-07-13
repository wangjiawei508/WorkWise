/**
 * 品牌从 DeepSeek GUI 升级为 Kun 时,localStorage 键前缀从
 * `deepseekgui.` 改成了 `kun.`。这里做一次性拷贝迁移:
 *   - 只在新键不存在时拷贝,重复执行安全;
 *   - 旧键保留不删,用户回滚老版本时 UI 状态(线程注册表、布局等)
 *     仍然完整;
 *   - 这个模块必须是 renderer 入口的第一个 import:plan/sdd/chat 等
 *     store 在模块求值阶段就会读取 localStorage,迁移晚一步它们就会
 *     拿到空状态。
 */

const LEGACY_PREFIX = 'deepseekgui.'
const NEW_PREFIX = 'kun.'

export function migrateLegacyLocalStorageKeys(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>): number {
  let migrated = 0
  let legacyKeys: string[] = []
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key && key.startsWith(LEGACY_PREFIX)) legacyKeys.push(key)
    }
  } catch {
    legacyKeys = []
  }

  for (const key of legacyKeys) {
    const newKey = NEW_PREFIX + key.slice(LEGACY_PREFIX.length)
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
