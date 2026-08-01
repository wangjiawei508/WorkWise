# WorkWise 0.3.3 发布证据

记录日期：2026-08-01（Asia/Shanghai）

## 已完成的本地门禁

- OpenSpec 严格校验：9 项通过，0 项失败。
- Desktop 测试：218 个文件通过、1 个文件跳过；1523 个测试通过、1 个跳过。需要用户目录和回环端口的 4 个文件在解除沙箱后复跑，52 个测试全部通过。
- Runtime 测试：73 个文件、629 个测试全部通过。
- 主应用 TypeScript、Runtime TypeScript 与生产构建通过。
- macOS arm64 QA 目录包构建通过；ASAR 共验证 19,960 个可读文件，454 个编译输出与本地构建逐字节一致。
- 打包后的 WorkWise Runtime `better-sqlite3` 已在 Electron ABI 148 下执行建表、写入和查询冒烟测试。
- 打包后的 arm64 MarkItDown helper、Magika 模型、许可文件和 PPT Master 脚本存在且可执行，PPT Master sidecar roundtrip 通过。
- 构建新鲜度：819 个生产输入通过检查。
- 文档依赖与许可、品牌边界、Git diff whitespace 检查通过。
- 更新专项：安装前编辑保存、活动 Agent/Flow/定时工作确认、Runtime 停止顺序、降级拒绝、清单/下载版本不一致拒绝、R2 清单解析和三版本保留排序均有自动化测试。
- 原生更新验收基础设施已就绪：显式启用的应用内生命周期探针和 `Native updater acceptance` 三平台 CI 矩阵会真实安装 0.3.3、下载测试版 0.3.4、调用平台更新器并验证自动拉起；每个平台输出独立 JSON/日志证据，任一平台失败则汇总门禁失败。
- 端到端候选流水线 `Build and exercise native updater` 已就绪：它从同一提交构建 0.3.3/0.3.4，强制签名公证 macOS 包，把目标更新发布到 run-scoped R2 Frontier 前缀，完成三平台验收后精确清理；清理函数拒绝任何非 `workwise/acceptance/<当前 run-id>` 路径。
- 101 页合成招标 PDF 验收通过：中文“投标保证金/伍拾万元”检索命中第 87 页，初始元数据不含全文条款，并生成可解包校验的投标 DOCX。
- 端到端 Flow `schedule → tender retrieval → Agent → DOCX → human approval → archive` 验收通过；记录了 Agent 首次失败后重试成功、Runtime 重启后审批继续、最终历史和绝对路径/密钥脱敏导出。

## 发布流水线门禁

- Stable/Frontier 使用 `https://www.railwise.cn/downloads/workwise/channels/<channel>/latest/`。
- 版本化 ZIP、EXE、blockmap、`latest.yml`、`latest-mac.yml` 与 SHA-512 元数据先写入 R2 不可变版本目录。
- 提升 `latest` 前，流水线对归档对象执行完整 HTTPS 下载、Range 下载、大小和 SHA-512 校验；版本、平台清单和标签必须一致。
- Stable 缺少 Developer ID、Apple 公证或 R2 凭据时流水线硬失败。macOS 配置启用 hardened runtime、secure timestamp、notarization 和 stapling 验证。
- 提升后仅保留最近三个可安装版本；`r2:rollback` 只把已验证的版本目录重新指向通道，不修改版本化对象。

## 托管原生更新验收运行

- 2026-08-01 已从提交 `303bcef099f292f31ad2465d541e5a729d2cfd37` 触发 [Release #30702815117](https://github.com/wangjiawei508/WorkWise/actions/runs/30702815117) 的 acceptance-only 模式；普通候选构建、Stable 发布和 GitHub Release 作业均保持跳过。
- macOS arm64、macOS x64 与 Windows x64 的 MarkItDown 原生侧车均构建并上传成功，证明三平台依赖准备路径可运行。
- Windows 0.3.3 基线安装器与 0.3.4 目标更新工件均构建成功；运行保留了 `acceptance-base-win`（229,262,686 bytes）与 `acceptance-target-win`（229,498,612 bytes）artifact，但因测试 feed 未发布，没有执行客户端安装更新。
- macOS 0.3.3/0.3.4 双版本打包在签名凭据门禁处按预期硬失败，首个明确缺口为 `MAC_CODESIGN_P12_BASE64`；工作流没有降级生成未签名包，也没有进入公证、R2 发布或客户端安装验收。
- 仓库 Actions secrets 名称清单当前为空。完成验收至少需要配置 `MAC_CODESIGN_P12_BASE64`、`CSC_KEY_PASSWORD`、`APPLE_API_KEY_BASE64`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`、`R2_ACCOUNT_ID`、`R2_BUCKET`、`R2_ACCESS_KEY_ID` 和 `R2_SECRET_ACCESS_KEY`。
- 隔离前缀清理作业也因 R2 凭据为空而硬失败；发布作业此前已跳过，因此本次没有上传或遗留任何 run-scoped R2 对象。
- 本次运行属于失败门禁证据，不是任务 6.5 的通过证据；配置凭据后必须从当前分支重新运行同一 acceptance-only 流程，并归档三平台 `passed` artifact。

## 尚缺的外部证据（Stable 保持阻断）

- 当前仓库未配置 R2 发布凭据，未执行官方域名的真实上传、完整下载、Range、哈希、提升或回滚演练。
- 当前仓库未配置可用于正式发布的 Apple Developer ID 与公证凭据，未生成可验证的签名、公证、staple 安装包。
- 三平台 runner 已能构建原生文档侧车，但仍未完成 macOS arm64、macOS x64 和 Windows x64 的 0.3.3 → 测试 0.3.4 原生安装与应用内更新闭环。
- 三平台验收应按 [WORKWISE_0.3.3_UPDATER_ACCEPTANCE.md](./WORKWISE_0.3.3_UPDATER_ACCEPTANCE.md) 运行；在工作流 URL、提交 SHA、测试 feed 清单哈希和三份 `passed` artifact 归档前，OpenSpec 任务 6.5 保持未完成。
- 自动化验收使用可重复生成的 101 页招标夹具；正式发布前如需客户项目级证据，仍应使用经授权且已脱敏的真实招标文件补充业务复核。
- Flow Runtime 的跨重启自动化验收已通过；打包应用 UI 的人工截图或录屏可在发布候选环境中补充，但不替代自动化运行历史。

以上项目完成并归档证据前，不得提升 Stable；不以关闭签名、HTTPS 或哈希校验绕过门禁。
