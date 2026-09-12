# WorkWise 0.5.0 发布闸门复核

日期：2026-09-09（Asia/Shanghai）

> 2026-09-10 最新复核：[候选 912e4d30b065](evidence/survey-candidate-912e4d30b065/README.md)
> 已从私有 0.5.0 DMG 隔离安装；COSA IN2 与修复后的 GSI 在同一包内 Runtime
> 完成交付及独立数值比较。GSI 原件与既有 IN1 的细小差异仍需复核。
> 最新 Runtime 1,577 项、桌面端 2,438 项通过。完整 GUI、正式签名/公证、私有
> updater 往返和用户确认仍未完成，Task 15、29、36 仍为未完成。
> 下文为 09-09 历史证据，不能替代最新状态。

## 当前结论

源码和 Runtime 回归门禁已通过，但 0.5.0 仍是私有候选收口状态，不能发布到
Stable、frontier 公共 feed、GitHub Release 或官方下载页。OpenSpec
`workwise-0-5-0-engineering-delivery` 仍为 33/36，未关闭项是 Task 15、29、36。

## 已通过的当前工作树证据

| 门禁 | 结果 |
| --- | --- |
| `npm run typecheck -- --pretty false` | 通过 |
| `npm run lint` | 0 error；1 条既有 `Workbench.tsx:1402` Hook warning |
| `npm --prefix kun test` | 135 个文件，1556 项通过，1 项跳过 |
| `npm test -- --maxWorkers=2`（允许本机回环监听） | 304 个文件，2438 项通过，2 项跳过 |
| `npm run build` | 通过 |
| `npm run verify:build-freshness` | 957 个生产输入通过 |
| `npm run openspec:validate` | 11/11 strict 通过 |
| `npm run verify:brand-boundary` | 1510 个文件通过 |
| `npm run verify:specialist-skills` | 25 个 Skill、2 个别名通过 |
| `npm run verify:document-licenses` | 通过 |
| 候选 ASAR 完整性（c1dcc2f79f6c） | 7838 个归档文件、461 个编译文件通过 |
| 候选 `better-sqlite3` smoke | macOS arm64，Electron ABI 148 通过 |
| `git diff --check` | 通过 |

受限沙箱中第一次根测试的 13 个失败全部为 `listen EPERM: operation not permitted
127.0.0.1`；在允许本机回环监听后全部恢复通过，未发现业务测试回归。

## 未关闭的发布阻塞

### Task 15：候选包可见 GUI 验收

候选 Bundle 的 Info.plist、可执行文件、arm64 Mach-O、ASAR 和 adhoc 签名静态校验
均通过。此前 macOS 26.6.2 的 LaunchServices/Spotlight 状态异常已在管理员权限下
完成修复：重建注册库、重启 `lsd`/`sharedfilelistd`/Finder 后，`mdutil -s /` 和
`/System/Volumes/Data` 均为 `Indexing enabled`，`lsregister -lint` 对正式版和候选
均返回 0，`open -n` 对 Terminal、正式 WorkWise 和候选包均返回 0，修复后没有新增
候选崩溃报告。原始诊断和命令记录见 `docs/qa/LAUNCHSERVICES_HOST_REPAIR_NOTES.md`。
宿主阻塞已解除，但仍需在当前可用桌面会话中完成浅色/深色、窄窗口、键盘/a11y、
线程恢复、文件选择和可见成果生成验收；在此之前不能勾选 Task 15。

### Task 29：完整发布前验收

自动化门禁已完成，但 Task 29 还要求基于最终候选包的 GUI 截图、安装记录、签名/公证、
真实 updater 往返和专业人员确认。当前候选为 adhoc、无 Team ID、未公证，也未安装到
`/Applications`，因此不能用自动化结果替代剩余验收。

### Task 36：真实生产格式与候选包闭环

候选 Runtime 已完成 COSA `.in1` 和 `.in2` 的导入、预检、确定性平差、DOCX/PDF/XLSX/
manifest 及 OU1/OU2 比较；这些仍属于同一 COSA 格式族。矩阵要求至少另一类 P0
厂商格式的可授权真实/脱敏输入、独立数值参考，以及同一候选应用的可见 GUI 闭环。
NAS 中发现了真实 Leica `.GSI` 原始文件，但当前 GSI 驱动仍是有界词法/安全检查，
没有经验证的语义映射和 adjustment-ready 平差链，不能把它误报为通过。

## 发布决策

当前版本可以称为“源码与 Runtime 已通过、私有候选待 GUI/第二格式验收”，不能称为
“验收完成”或“可正式发布”。在用户明确指定确切版本（例如 `0.5.0`）及目标渠道，
并完成上述三项证据后，才可继续执行安装确认、updater 往返和发布操作。

## 为什么旧版本以前可以启动

历史发布成功并不能排除本机后来发生了宿主环境变化。当前证据显示：

- 现有安装版 WorkWise `0.4.1` 使用 Electron `43.4.1`，直接启动同样退出码 `134`；
- 旧候选 `0.4.2` 在 2026-09-07/08 的崩溃报告与当前 `0.5.0` 使用相同的
  `AppKit -> HIServices RegisterApplication -> SIGABRT` 路径；
- 即使启动 `/System/Applications/Utilities/Terminal.app`，`open` 也返回
  `NSOSStatusErrorDomain Code=-10827 (kLSNoExecutableErr)`；
- `lsregister -f` 扫描系统 Terminal.app 返回 `-10822 from spotlight`；
- 当前宿主为 macOS `26.6.2`，而 0.4.x 发布日期早于本轮 LaunchServices/Spotlight
  异常记录。

所以“以前能发布”说明当时的应用包和桌面环境可用，不说明当前宿主仍可注册 GUI 应用。
当前失败发生在 WorkWise JavaScript 执行前，不能通过改 Survey、改 Bundle 名称或重跑
构建来修复；应在原生桌面会话中修复/重启 LaunchServices/Spotlight 后再验收。
