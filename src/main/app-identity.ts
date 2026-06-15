import { app } from 'electron'

/**
 * 项目对外展示的产品名,需要和:
 *   - package.json#productName
 *   - electron-builder.cjs#productName
 *   - tray 菜单和 tooltip
 * 保持一致。Windows 任务栏 / 系统托盘 / 通知中心看到的应用名都来自
 * 这条字符串(在打包产物里还会被写进 VERSIONINFO)。
 *
 * 2026-06 起品牌从 “DeepSeek GUI” 升级为 “Kun”。这个名字同时决定
 * userData 默认目录(appData/Kun),老目录由 legacy-data-migration.ts
 * 在启动最早期搬迁;历史名字列表见该模块的 LEGACY_USER_DATA_DIR_NAMES。
 * 注意:electron-builder 的 appId(com.xingyuzhong.deepseekgui)刻意
 * 不随品牌改名 —— macOS 自动更新的签名校验和 NSIS 升级卸载的注册表
 * GUID 都锚定在 appId 上,改了老版本就无法平滑升级到新版本。
 */
export const APP_PRODUCT_NAME = 'Kun'

/**
 * 在 main 进程最早期调用,把 app 的对外名称设好。
 * `app.setName()` 会覆盖 `app.getName()` 的返回值(优先于 package.json#name
 * 字段),并影响 BrowserWindow 默认 title、通知、托盘等所有用 `app.getName()`
 * 拿名字的地方。要尽早调用,免得启动早期就拿走了旧值。
 *
 * Windows 平台专属的 `app.setAppUserModelId()` 不在这里调 —— 它是 win32
 * 专用的,放在 main/index.ts 的 win32 分支里更直观。
 */
export function configureAppIdentity(): void {
  app.setName(APP_PRODUCT_NAME)
}
