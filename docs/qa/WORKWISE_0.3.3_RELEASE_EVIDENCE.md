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

## 尚缺的外部证据（Stable 保持阻断）

- 当前本地工作区没有 R2 生产凭据，未执行官方域名的真实上传、完整下载、Range、哈希、提升或回滚演练。
- 当前没有可用于正式发布的 Apple Developer ID、公证凭据，未生成可验证的签名、公证、staple 安装包。
- 当前环境只有 macOS Apple Silicon，未完成 macOS Intel 和 Windows x64 的原生安装及 0.3.3 → 测试 0.3.4 应用内更新。
- 三平台验收应按 [WORKWISE_0.3.3_UPDATER_ACCEPTANCE.md](./WORKWISE_0.3.3_UPDATER_ACCEPTANCE.md) 运行；在工作流 URL、提交 SHA、测试 feed 清单哈希和三份 `passed` artifact 归档前，OpenSpec 任务 6.5 保持未完成。
- 当前 GitHub 凭据无权列出仓库 Actions 密钥名称，因此不能在本地确认 Apple/R2 secrets 是否已配置；流水线会在使用前逐项硬校验并明确失败。
- 自动化验收使用可重复生成的 101 页招标夹具；正式发布前如需客户项目级证据，仍应使用经授权且已脱敏的真实招标文件补充业务复核。
- Flow Runtime 的跨重启自动化验收已通过；打包应用 UI 的人工截图或录屏可在发布候选环境中补充，但不替代自动化运行历史。

以上项目完成并归档证据前，不得提升 Stable；不以关闭签名、HTTPS 或哈希校验绕过门禁。
