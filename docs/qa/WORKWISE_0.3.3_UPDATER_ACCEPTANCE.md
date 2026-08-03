# WorkWise 0.3.3 原生应用内更新验收

OpenSpec 任务 6.5 只有在 macOS arm64、macOS x64 和 Windows x64 三个原生环境都完成 0.3.3 → 测试版 0.3.4 更新后才能勾选。单元测试、未签名目录包或仅下载更新文件均不能替代本验收。

## 前置产物

- Developer ID 签名、公证并 stapled 的 0.3.3 Apple Silicon DMG。
- Developer ID 签名、公证并 stapled 的 0.3.3 Intel DMG。
- 0.3.3 Windows x64 NSIS 安装程序。
- 同一代码和应用标识构建的测试版 0.3.4 更新产物。
- 一个 HTTPS Generic 测试更新源，包含与平台匹配的 `latest-mac.yml` 或 `latest.yml`、ZIP/EXE、blockmap 和正确 SHA-512。

测试源可以使用隔离的 Frontier/R2 前缀，但不得放宽签名、HTTPS、版本或哈希校验。输入 URL 应为不含临时密钥的公开测试 URL。

## 推荐运行方式：端到端候选流水线

在 GitHub Actions 中手动运行 **Build and exercise native updater**，保留：

- `base_version`: `0.3.3`
- `target_version`: `0.3.4`

该工作流从同一提交构建两个版本，不需要人工预先上传测试版：

1. 在三个原生环境构建并校验 MarkItDown sidecar。
2. 构建 0.3.3 基线和 0.3.4 目标安装包；两组 macOS 包均强制 Developer ID 签名、公证和 stapling。
3. 把 0.3.4 ZIP、EXE、blockmap 和清单发布到 `workwise/acceptance/<run-id>/channels/frontier/` 隔离 R2 前缀。
4. 对隔离源执行 HTTPS、Range、版本及 SHA-512 验证后提升其 `latest` 指针。
5. 在 macOS arm64、macOS x64 和 Windows x64 安装 0.3.3，并真实更新到 0.3.4。
6. 上传 feed 清单、哈希、三份原生报告和日志，最后只删除当前 run ID 的隔离 R2 前缀。

流水线需要仓库配置 `MAC_CODESIGN_P12_BASE64`、`CSC_KEY_PASSWORD`、`APPLE_API_KEY_BASE64`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER` 和 R2 发布凭据。任何凭据缺失都会失败，不会降级为未签名验收。

## 使用预构建产物运行

如果签名包和测试 feed 已由受控发布环境准备，也可以手动运行 **Native updater acceptance**，填写三份 0.3.3 安装包 URL、0.3.4 测试 feed URL，并保留：

- `base_version`: `0.3.3`
- `target_version`: `0.3.4`
- `channel`: 与测试包和清单一致，通常为 `frontier`

两种工作流最终都在三个原生 runner 上分别执行：

1. 下载并原生安装 0.3.3；macOS 先执行 `codesign` 与 Gatekeeper 评估。
2. 从应用主进程调用实际更新检查，拒绝手动下载降级路径。
3. 通过 `electron-updater` 后台下载平台更新。
4. 调用“重启并更新”使用的安装 API，退出并交给 Squirrel.Mac 或 NSIS 替换应用。
5. 等待 0.3.4 自动拉起，由新版本完成同一份持久化验收报告。

验收入口只在显式传入 `--workwise-updater-acceptance=<绝对配置路径>` 时启用；正常用户启动不创建或执行验收状态。测试 feed 必须为 HTTPS，报告路径必须为绝对路径，目标版本或自动拉起版本不一致会失败关闭。

## 必须归档的证据

每个平台会上传一个 `updater-acceptance-<platform>-<arch>` artifact，至少包含 JSON 报告和应用日志。报告必须同时满足：

- `status` 为 `passed`；
- 平台分别为 `darwin-arm64`、`darwin-x64`、`win32-x64`；
- 版本为 `0.3.3` → `0.3.4`；
- `browserOpened` 为 `false`；
- 阶段严格为 `base_started`、`update_available`、`download_completed`、`install_requested`、`target_relaunched`；
- 汇总门禁 **All native updater paths passed** 成功。
- 端到端模式的 **Remove isolated updater feed** 成功，且 feed evidence artifact 已在清理前归档。

把工作流 URL、提交 SHA、测试 feed 清单 SHA-512、三份 artifact 名称和运行时间写入 [WORKWISE_0.3.3_RELEASE_EVIDENCE.md](./WORKWISE_0.3.3_RELEASE_EVIDENCE.md)。完成前任务 6.5 和 Stable 提升均保持阻断。
