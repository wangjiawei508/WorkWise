# LaunchServices / Spotlight 复核记录

日期：2026-09-10（Asia/Tokyo）

本记录补充此前 `docs/qa/LAUNCHSERVICES_HOST_REPAIR_NOTES.md` 的结论。复核使用现有私有候选包，不修改生产应用、版本号或发布渠道。

## 当前结果

| 检查 | 结果 |
| --- | --- |
| `mdutil -s /` | `Spotlight server is disabled.` |
| `mdutil -s /System/Volumes/Data` | `Spotlight server is disabled.` |
| `lsregister -lint <candidate>` | 失败，`-10822 from spotlight` |
| `open -n <candidate>` | 失败，`NSOSStatusErrorDomain Code=-10827 (kLSNoExecutableErr)` |
| 候选直接执行 | 退出码 `134`（`SIGABRT`） |

复核候选：

`/private/tmp/workwise-0.5-snapshot-a6KhOK/dist/mac-arm64/WorkWise Candidate c1dcc2f79f6c.app`

该候选的静态文件仍存在，`Contents/MacOS` 下有 arm64 可执行文件；失败发生在 macOS 原生注册阶段，而不是 Electron/Survey JavaScript 执行阶段。

## 崩溃定位

最新诊断报告：

`/Users/wangjiawei/Library/Logs/DiagnosticReports/WorkWise-2026-09-10-064446.ips`

关键信息：

- bundle id：`com.wangjiawei508.workwise.candidate.head9210efe15bbc`
- 版本：`0.5.0`
- 异常：`EXC_CRASH / SIGABRT`
- 栈：`abort -> ___RegisterApplication_block_invoke -> _RegisterApplication -> GetCurrentProcess`
- 同一宿主上旧版 0.4.1、普通 0.5.0 和候选包均落在相同原生栈，说明不是本轮业务改动引入的回归。

## 验收影响

在真实桌面会话恢复 Spotlight/LaunchServices 前，不能完成候选 GUI 截图、安装验收或 updater 往返；Tasks 15、29 继续保持未完成，不能据此执行公开发布。

