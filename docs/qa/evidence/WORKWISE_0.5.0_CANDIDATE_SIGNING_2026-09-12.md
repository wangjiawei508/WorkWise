# WorkWise 0.5.0 私有候选签名与公证证据

- 构建快照：`415580fae147108d5207e38c6b1c0a21e2d267c1`
- 产物：`/private/tmp/workwise-050-signed-AgARpM/dist/WorkWise-Candidate-415580fae147-0.5.0-mac-arm64.dmg`
- 架构：macOS arm64
- Developer ID：Ningbo Ruiwei Engineering Technology Co., Ltd. (R35G7F4A9U)
- Team ID：`R35G7F4A9U`
- Notary submission：`b0aab5b0-6166-4585-b2e1-877d99b26690`，状态 `Accepted`
- Stapler：`staple` 与 `validate` 均通过
- Gatekeeper：`spctl --assess` accepted，source=Notarized Developer ID
- ASAR：18,365 文件、461 编译文件，源码 HEAD 校验通过
- Native runtime：better-sqlite3 ABI 148 校验通过
- DMG SHA-256：`53c21d17df659d85fc49c8319e4520d962415f6b41b8706addc9690ae7b546e2`
- 隔离安装：已复制至 `/private/tmp/WorkWise-0.5.0-candidate.app` 并以 candidate env 启动；未覆盖 `/Applications/WorkWise.app`
- 备注：启动日志仅有 macOS login item 权限提示，未见应用启动崩溃。真实 updater round-trip 与用户 UI 确认仍待完成。
