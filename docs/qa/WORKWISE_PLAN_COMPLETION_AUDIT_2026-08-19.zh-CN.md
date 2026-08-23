# WorkWise 两项计划完成度审计

日期：2026-08-23
分支：`codex/release-0.4.0-final`
提交：`0d6df6654801cb9a1c91cc4782d73d0ac0d987d0`
版本：`0.4.0`（发布候选）

本报告按 `PLAN (1).md`（PDF 解析）和 `PLAN (2).md`（DeepSeek Harness 机制）逐项核对当前代码、测试和候选证据。用户已于 2026-08-22 授权取消原计划的开发阻塞项，允许继续接入真实服务和准备交付；`DONE` 只表示仓库内实现和自动化证据足够；`PARTIAL` 表示实现存在但仍缺少真实服务或人工验收；`UNVERIFIABLE` 表示当前环境没有足够证据。历史候选日志不作为当前版本的真实通信验收。

本机已发现 Superpowers 插件缓存（`/Users/wangjiawei/.codex/.tmp/plugins/plugins/superpowers`），本轮按其中的系统调试、TDD、执行计划和完成前验证规则执行；同时按可用的 Gstack 工程审查、调查、健康检查和发布门禁规则执行。该插件没有在当前技能清单中注册，因此不把它描述为通过宿主 Skill 调用安装，而是记录实际读取和遵守的本地规则。

## 证据基线

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- 受控回环权限下全量测试：主工程 `2281 passed | 2 skipped`，Runtime `780 passed`，合计 `3061 passed | 2 skipped`。候选端口预留、Runtime 实际端口交接、三端口探针、MarkItDown 页码溯源、OCR 页码校验、工作区索引读错截断、DeepSeek 响应边界和候选 `port: 0` 设置持久化专项测试通过。
- 应用代码基线 `5712e4c` fresh 回归：主工程 `2281 passed | 2 skipped`，kun Runtime `780 passed`；随后仅提交本审计文档，测试在允许本机回环监听、并完成 better-sqlite3 原生模块编译的隔离工作树中运行。
- `npm run build`：通过。
- `WORKWISE_PYTHON=/private/tmp/workwise-markitdown-venv/bin/python npm run build:markitdown-sidecar`：通过；包含 PyInstaller 打包、Magika/PPT Master 资源、许可文件、framework symlink 和 helper 冷启动 smoke 检查。
- `npm run openspec:validate`：`10 passed, 0 failed`。
- `npm run verify:brand-boundary`：通过，扫描 1411 个文件。
- `git diff --check`：通过。
- 本轮新增真实回环验收：macOS Vision `VNRecognizeTextRequest` 作为本机视觉服务，`HttpVisionEvidenceService` 对真实 PNG 完成 HTTP 请求、结构化证据校验，返回 `ready`、OCR 文本、18 个布局项和语义字段；同一 Vision 服务作为 Unlimited-OCR 后端，对两页图像型扫描 PDF 完成健康检查、提交、轮询、页码排序和 Markdown 输出，耗时 `2073 ms`。
- 候选端口生命周期：候选 Schedule/IM 端口由持有监听器的 reservation 交接，Runtime 使用 `port: 0` 并从 `KUN_READY` 保存实际端口；候选探针同时验证 Runtime `/health`、Schedule 内部监听和 IM webhook 监听，退出和启动失败路径均幂等清理 reservation。
- `bash scripts/authorize-workwise-candidate.sh --check`：通过；未执行 `--prepare`，未修改正式安装包或正式用户目录。
- `npm run verify:document-licenses`：通过；sidecar 现在使用 `sidecars/markitdown/THIRD_PARTY_NOTICES.md` 自包含许可声明，不依赖已被用户删除的根目录声明文件。
- 设置与 IM 凭据事务专项测试 `58 passed`；覆盖 stale revision 在凭据写入前拒绝、设置落盘失败回滚新凭据、落盘后旧凭据清理失败保留已提交替代凭据、并发删除/恢复同一账号，以及多 channel 部分失败等待全部保护任务完成后清理所有孤立凭据。Node 类型检查、定向 ESLint 和 `git diff --check` 同步通过。
- 应用代码基线 `5712e4c` 已重新构建隔离候选包 `/private/tmp/workwise-final-candidate-package-5712e4c/mac-arm64/WorkWise Candidate 5712e4c77a75.app`，唯一 bundle ID 为 `com.wangjiawei508.workwise.candidate.head5712e4c77a75`，版本 `0.3.6`；ASAR `18,335` 文件和 `457` 个编译产物、MarkItDown helper smoke、Electron ABI 148 SQLite smoke 与 `codesign --verify --deep --strict` 均通过。该包为 ad-hoc 签名，未宣称 Developer ID 或公证；正式 `/Applications/WorkWise.app` 未被覆盖。
- 旧打包候选已完成浅色/深色/浅色往返，设置持久化为 `theme: light`；侧栏可读、分隔线细、全尺寸 Workbench 打开后无重叠。当前 `5712e4c` 候选尚未重复执行这项人工检查。
- 打包 PDF 预览实际显示 `markitdown-v0.1.4-workwise-1`、`degraded`、`low_text_density` 和 `scanned_document`；无 OCR/MinerU 时高精度解析明确返回 `document_engine_unavailable`，PDF.js 阅读和搜索仍可用。
- 本地回环模型验收只监听 `127.0.0.1`，固定返回输入 37、输出 6、总计 43 tokens；界面先显示流式估算，完成后替换为精确 `43 tokens` 和 `Local usage acceptance passed.`。验收后已清除临时假密钥、恢复 `https://api.deepseek.com` 并退出候选。
- 设置事务实现提交为 `29912f251b2541ffebaec0a55cebd129a5e9ae03`；本次 `5712e4c` 候选已完成包级机器验收，但没有把未执行的 UI 人工检查、真实 OCR/视觉服务或 IM 收发冒充为通过。
- 本次候选 `0d6df66` 的 macOS arm64 DMG：`/private/tmp/workwise-candidate-final-0d6df66/WorkWise-Candidate-0d6df6654801-0.4.0-mac-arm64.dmg`；候选 bundle ID 为 `com.wangjiawei508.workwise.candidate.head0d6df6654801`。启动和普通设置保存不再读取系统钥匙串；与钥匙串访问相关的 9 项回归测试通过。完整 `claw-runtime` 测试仍有 10 项 SQLite 账本测试因本机 Node ABI 147/148 不匹配失败，不能记为全量通过。
- 2026-08-23 08:37 在已授权的飞书单聊发送了唯一一次 `/status`，收到 `飞书连接：已连接`、`状态：connected`、心跳 `2026 年 8 月 23 日 08:37:00` 的回复；该消息来自当前安装的 `0.3.6`，不是 0.4.0 候选，故不作为当前候选真实收发通过证据。
- `knip`、`shellcheck`、`gbrain`：本机未安装，未将其缺失冒充为通过。

## 计划一：PDF 解析

| 条目 | 状态 | 证据与边界 |
|---|---|---|
| 细化文本层、扫描件、复杂版面、公式/表格信号 | DONE | `document-engine-service` 的质量评估与路由测试覆盖扫描、弱文本层、复杂版面和表格/公式警告。 |
| 页码引用、标题页映射、警告和降级原因 | DONE | MarkItDown 只信任段数与 PDF 页数严格相等的结构性换页符，不接受正文伪造的显式页码标记；标题映射去重、元数据上限和缓存 revision 均有专项回归。其他具备可信标记合约的引擎仍可使用显式页码。 |
| PDF.js 保持阅读/搜索职责 | DONE | `workspace-preview-service` 与 PDF.js 预览路径测试通过。 |
| 快解析 / 高精度解析 / 当前引擎 / 切换原因界面 | DONE | 设置卡和预览面板已展示解析模式、引擎状态和路由信息；当前打包候选截图已确认 MarkItDown、质量等级和路由原因。 |
| Unlimited-OCR 可选本机高精度协议 | PARTIAL | 回环 URL 校验、提交、轮询、超时、取消、大小上限，以及页码整数、范围和重复校验均已实现并测试；本轮已用 macOS Vision 真模型完成本机服务和两页扫描 PDF 回环验收，但尚未用用户配置的供应商服务验收。 |
| MinerU 保留并作为回退 | DONE（代码证据） | MinerU 选择、失败回退和诊断测试通过；未进行真实 MinerU 长文档人工验收。 |
| 电子 PDF、扫描 PDF、复杂版面、回退和安全限制 | PARTIAL | 合成 fixture 和边界测试通过；缺少一组真实用户 PDF 与真实 OCR 服务的端到端验收。 |

## 计划二：DeepSeek Harness 机制

| 条目 | 状态 | 证据与边界 |
|---|---|---|
| `@file` 有界索引、目录引用、路径安全、延迟读取 | DONE | Runtime 重新验证 workspace reference；symlink、越界、中文/空格路径、上限、深度、TTL 和子目录读取失败时明确标记截断均有测试覆盖。 |
| 纯文本模型的视觉证据层 | PARTIAL | `VisionEvidencePort`、结构化证据、缓存、并发共享、超时、SSRF/大小/MIME 防护和失败契约已实现并测试；本轮已用 macOS Vision 真模型完成真实图片到结构化证据的 HTTP 回环，但没有配置真实 DeepSeek 视觉问答端点，不能宣称 DeepSeek 图片问答验收。 |
| 终态通知分类、去重、当前线程抑制和点击定位 | PARTIAL | 终态投影、设置迁移、Renderer 去重和通知点击路由测试通过；本轮仍没有捕获到可明确归因并可点击的 macOS 通知，因此点击定位仍不冒充人工验收通过。 |
| 实时用量、精确 usage 替换估算、稳定 TPS | DONE | `LiveUsageProjection` 及流式更新测试通过；打包候选中先出现估算值，最终被服务端精确 usage `37 + 6 = 43` 替换，TPS 不因空 chunk 归零。 |
| Workbench 注册表、懒加载、错误边界、Viewer 优先级 | DONE | 注册/卸载、重复 ID、懒加载失败重试和 DOM 测试通过；打包候选已验证全尺寸 Workbench 打开后无重叠。 |
| Git 切换安全预检 | DONE | 冲突、rebase/cherry-pick/bisect、其他 worktree、覆盖文件和稳定错误码测试通过；尚缺人工操作验收。 |
| 声明式 `dsh-ui` 与 Runtime `ui_action` | DONE（安全合约证据） | 白名单、深度/节点/表格上限、密码隔离、fingerprint、过期/重放/错误 thread 拒绝和动作队列测试通过。 |
| 不新增第二 Runtime、Remote Web、Provider Switcher 或任意 DOM 注入 | DONE | 代码边界测试和 `verify:brand-boundary` 通过。 |

## 通信可靠性专项

| 能力 | 状态 | 证据与边界 |
|---|---|---|
| 飞书/Lark 和微信凭据保护、迁移、超时和重试 | DONE（代码/单元证据） | `ImCredentialService`、credential helper 和迁移测试通过；飞书 `credential_unavailable` 进入退避重试并在恢复前刷新受保护存储，微信仍要求显式授权；真实系统钥匙串授权仍需在隔离候选中重新验收。 |
| SQLite 消息账本、去重、租约、崩溃恢复、串行和全局并发 | DONE | ledger 与 `claw-runtime` 测试覆盖重复消息、租约丢失、重启恢复、发送重试和并发限制。 |
| Runtime 幂等键、当前结果契约和历史文本隔离 | DONE | turn idempotency、空结果、失败/超时/授权等待和文件结果测试通过。 |
| 稳定 outbound ID、文件发送重试和明确失败回复 | DONE（代码/单元证据） | Feishu/微信稳定 ID、文件先发、失败通知和账本重试测试通过；没有新的真实 IM 文件下载验收。 |
| 健康状态、心跳、stale、退避、自动重连、self-check、diagnostics | DONE（代码/单元证据） | `ImHealthService`、IPC 入口和状态变化测试通过；需要当前候选版本实际连接后再证明真实链路。 |
| 候选安全边界 | DONE（代码/包级证据） | 候选默认禁止出站和入站，只有单一 provider、chat 和精确命令可放行；当前 HEAD 进一步隔离 Electron 的 `userData`、`cache`、`sessionData`、`crashDumps` 和 `logs`，并删除候选进程继承的 `DEEPSEEK_API_KEY`。20 项专项测试和唯一标识候选包校验通过；不修改正式版第三方 API 配置。 |
| 当前版本真实飞书收发 | UNVERIFIABLE | 当前安装 `0.3.6` 在 2026-08-23 08:37 完成一次 `/status` 闭环；0.4.0 候选已隔离启动，但受保护凭据仍需显式“重新连接”授权，未触发系统授权窗，不能把旧版结果投影为当前 HEAD 成功。 |
| 当前版本真实微信收发 | UNVERIFIABLE | 本轮按安全边界没有重新扫码、没有向微信发送消息，也没有使用正式用户数据。 |

## 交付状态

本轮已解除原计划对版本准备、真实 OCR/视觉服务和 IM 验收的阻塞；修复提交已固化在候选分支。当前仍需把真实服务和人工验收结果写入证据，再决定具体版本和交付动作，不能用历史日志替代当前结果。

## 下一步的唯一有效验收

1. 配置真实 Unlimited-OCR 和真实视觉端点，使用真实扫描/复杂版面 PDF 与图片完成外部服务验收；没有服务时继续保留 `PARTIAL`。
2. 在隔离候选中捕获一次可明确归因的系统完成通知，并验证点击后只定位原线程。
3. 仅在用户明确指定一个飞书测试聊天、一个精确测试命令并确认后，进行一次当前版本飞书入站/出站闭环；不测试微信。
4. 用户确认准确版本号和发布动作前，不打标签、创建 Release、修改官网、稳定更新源或正式 App；当前只维护候选分支和审查证据。

本轮另外修复了 sidecar 许可声明的构建边界：`scripts/build-markitdown-sidecar.mjs` 与 `scripts/verify-document-dependencies.mjs` 现在读取随 helper 分发的声明文件，保留用户对根目录 `THIRD_PARTY_NOTICES.md` 的删除。健康监督的并发恢复修复已由提交 `54c4235` 固化，并有回归测试覆盖重复恢复和 stale 失败后继续退避。

本报告不改变运行逻辑，也不把历史消息、历史文件或历史状态投影为当前任务成功。
