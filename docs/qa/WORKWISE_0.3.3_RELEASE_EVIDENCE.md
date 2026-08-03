# WorkWise 0.3.3 发布证据

记录日期：2026-08-03（Asia/Shanghai）

## 已完成的本地门禁

- OpenSpec 严格校验：9 项通过，0 项失败。
- Desktop 测试：218 个文件通过、1 个文件跳过；1529 个测试通过、1 个跳过。需要用户目录和回环端口的 4 个文件在解除沙箱后复跑，52 个测试全部通过。
- Runtime 测试：73 个文件、629 个测试全部通过。
- 主应用 TypeScript、Runtime TypeScript 与生产构建通过。
- macOS arm64 QA 目录包构建通过；ASAR 共验证 19,960 个可读文件，454 个编译输出与本地构建逐字节一致。
- 打包后的 WorkWise Runtime `better-sqlite3` 已在 Electron ABI 148 下执行建表、写入和查询冒烟测试。
- 打包后的 arm64 MarkItDown helper、Magika 模型、许可文件和 PPT Master 脚本存在且可执行，PPT Master sidecar roundtrip 通过。
- 构建新鲜度：819 个生产输入通过检查。
- 文档依赖与许可、品牌边界、Git diff whitespace 检查通过。
- 更新专项：安装前编辑保存、活动 Agent/Flow/定时工作确认、Runtime 停止顺序、降级拒绝、清单/下载版本不一致拒绝、R2 清单解析和三版本保留排序均有自动化测试。
- 原生更新验收已完成：显式启用的应用内生命周期探针和三平台 CI 矩阵真实安装 0.3.3、下载测试版 0.3.4、调用平台更新器并验证自动拉起；三个独立 JSON 报告均为 `passed`，且 `browserOpened` 均为 `false`。
- 端到端候选流水线 `Build and exercise native updater` 已通过：它从同一提交构建 0.3.3/0.3.4，强制签名公证 macOS 包，把目标更新发布到 run-scoped R2 Frontier 前缀，完成三平台验收后精确清理；清理函数拒绝任何非 `workwise/acceptance/<当前 run-id>` 路径。
- 101 页合成招标 PDF 验收通过：中文“投标保证金/伍拾万元”检索命中第 87 页，初始元数据不含全文条款，并生成可解包校验的投标 DOCX。
- 端到端 Flow `schedule → tender retrieval → Agent → DOCX → human approval → archive` 验收通过；记录了 Agent 首次失败后重试成功、Runtime 重启后审批继续、最终历史和绝对路径/密钥脱敏导出。

## 发布流水线门禁

- Stable/Frontier 使用 `https://www.railwise.cn/downloads/workwise/channels/<channel>/latest/`。
- 版本化 ZIP、EXE、blockmap、`latest.yml`、`latest-mac.yml` 与 SHA-512 元数据先写入 R2 不可变版本目录。
- 提升 `latest` 前，流水线对归档对象执行完整 HTTPS 下载、Range 下载、大小和 SHA-512 校验；版本、平台清单和标签必须一致。
- Stable 缺少 Developer ID、Apple 公证或 R2 凭据时流水线硬失败。macOS 配置启用 hardened runtime、secure timestamp、notarization 和 stapling 验证。
- 提升后仅保留最近三个可安装版本；`r2:rollback` 只把已验证的版本目录重新指向通道，不修改版本化对象。

## 托管原生更新验收运行

- 2026-08-02 从提交 `32ed3f5fa503f6972070e82ddedb7452bd48bb98` 触发 [Release #30748813415](https://github.com/wangjiawei508/WorkWise/actions/runs/30748813415) 的 acceptance-only 模式；运行于 20:54–22:08（Asia/Shanghai）完成并成功。
- macOS arm64、macOS x64 与 Windows x64 的 MarkItDown 原生侧车，以及签名、公证并 stapled 的 0.3.3/0.3.4 macOS 双架构包和 Windows x64 安装包均构建成功。
- 测试版 0.3.4 发布到 `https://www.railwise.cn/downloads/workwise/acceptance/30748813415/channels/frontier/latest/`；流水线完成 HTTPS、Range、版本、大小、SHA-512 与 latest 指针校验后才开始客户端验收。
- 清单证据 artifact 为 `updater-acceptance-feed-30748813415`。归档 SHA-512：`latest-mac.yml` 为 `d101190609a0e4b1e4bd80a009831a2fcdcc97ac1dd62b2fbb9c20fe296e505077aba7e86e2d67e69d0196f02b47929693d4dc883c01c1b03c27d7f96cae403b`，`latest.yml` 为 `5758c312b2e754bba6c50936288d704ff14268ce472b3e04786dbadc7810fb83ee609a89cb3b81a6d18108c97162e4f3f1c1cf44ebab7ae98b68cf279fec7728`，`latest.json` 为 `d0de249ad02d419171f098bb4c6dda96b054f2580f8ace056945ac388d5524a1073c6563ab3a1a3fb27db0615d614b5c013a7cb62a8a398af12cc0a8141f9ef7`。
- 三份原生报告 artifact 分别为 `updater-acceptance-darwin-arm64-30748813415`、`updater-acceptance-darwin-x64-30748813415` 和 `updater-acceptance-win32-x64-30748813415`。三者均记录 `base_started → update_available → download_completed → install_requested → target_relaunched`，目标版本为 0.3.4，且未打开浏览器。
- 汇总门禁 **All native updater paths passed** 成功；**Remove isolated updater feed** 成功，run-scoped 测试源已删除且未影响 Stable/Frontier 正式指针。
- [Nightly stability #30756295559](https://github.com/wangjiawei508/WorkWise/actions/runs/30756295559) 连续 8 小时稳定性测试两阶段全部通过。

## Stable 提升结论

- Apple Developer ID、Apple 公证和 R2 发布凭据已经在受控 GitHub Actions 环境可用；签名、公证、stapling、官方域名上传、完整下载、Range、哈希和原生更新闭环均已通过前置验收。
- 自动化验收使用可重复生成的 101 页招标夹具；如需客户项目级证据，可在发布后使用经授权且已脱敏的真实招标文件补充业务复核，但不再阻断 0.3.3。
- Flow Runtime 跨重启自动化验收已通过；打包应用 UI 的人工截图或录屏属于补充材料，不替代也不阻断现有自动化运行历史。

0.3.3 已满足触发正式 Stable 流水线的前置条件；正式流水线仍必须对标签提交重新构建并再次执行签名、公证、工件、哈希、HTTPS、Range 与原子提升门禁，不得关闭或跳过这些校验。
