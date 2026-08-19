# WorkWise 两项计划完成度审计

日期：2026-08-19  
分支：`codex/workwise-plugin-marketplace-recovered`  
版本：`0.3.6`

本报告按 `PLAN (1).md`（PDF 解析）和 `PLAN (2).md`（DeepSeek Harness 机制）逐项核对当前代码、测试和候选证据。`DONE` 只表示仓库内实现和自动化证据足够；`PARTIAL` 表示实现存在但仍缺少真实服务或人工验收；`UNVERIFIABLE` 表示当前环境没有足够证据。历史候选日志不作为当前版本的真实通信验收。

本机已发现 Superpowers 插件缓存（`/Users/wangjiawei/.codex/.tmp/plugins/plugins/superpowers`），本轮按其中的系统调试、TDD、执行计划和完成前验证规则执行；同时按可用的 Gstack 工程审查、调查、健康检查和发布门禁规则执行。该插件没有在当前技能清单中注册，因此不把它描述为通过宿主 Skill 调用安装，而是记录实际读取和遵守的本地规则。

## 证据基线

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- 受控回环权限下 `npm test -- --run`：`272 passed | 2 skipped`，`2165 passed | 2 skipped`（包含本轮健康监督回归测试）。沙箱内无回环监听权限时出现的 6 个失败已用同一隔离测试命令复核为环境权限问题。
- `npm run build`：通过。
- `WORKWISE_PYTHON=/private/tmp/workwise-markitdown-venv/bin/python npm run build:markitdown-sidecar`：通过；包含 PyInstaller 打包、Magika/PPT Master 资源、许可文件、framework symlink 和 helper 冷启动 smoke 检查。
- `npm run openspec:validate`：`10 passed, 0 failed`。
- `npm run verify:brand-boundary`：通过，扫描 1381 个文件。
- `git diff --check`：通过。
- `bash scripts/authorize-workwise-candidate.sh --check`：通过；未执行 `--prepare`，未修改正式安装包或正式用户目录。
- `npm run verify:document-licenses`：通过；sidecar 现在使用 `sidecars/markitdown/THIRD_PARTY_NOTICES.md` 自包含许可声明，不依赖已被用户删除的根目录声明文件。
- `knip`、`shellcheck`、`gbrain`：本机未安装，未将其缺失冒充为通过。

## 计划一：PDF 解析

| 条目 | 状态 | 证据与边界 |
|---|---|---|
| 细化文本层、扫描件、复杂版面、公式/表格信号 | DONE | `document-engine-service` 的质量评估与路由测试覆盖扫描、弱文本层、复杂版面和表格/公式警告。 |
| 页码引用、标题页映射、警告和降级原因 | DONE | 解析结果合约、页码/标题溯源测试和降级诊断测试通过。 |
| PDF.js 保持阅读/搜索职责 | DONE | `workspace-preview-service` 与 PDF.js 预览路径测试通过。 |
| 快解析 / 高精度解析 / 当前引擎 / 切换原因界面 | DONE（代码证据） | 设置卡和预览面板已展示解析模式、引擎状态和路由信息；尚缺最终候选包人工截图确认。 |
| Unlimited-OCR 可选本机高精度协议 | PARTIAL | 回环 URL 校验、提交、轮询、超时、取消、大小上限和结果解析均已实现并测试；本机没有真实 Unlimited-OCR 服务，不能宣称真实服务验收。 |
| MinerU 保留并作为回退 | DONE（代码证据） | MinerU 选择、失败回退和诊断测试通过；未进行真实 MinerU 长文档人工验收。 |
| 电子 PDF、扫描 PDF、复杂版面、回退和安全限制 | PARTIAL | 合成 fixture 和边界测试通过；缺少一组真实用户 PDF 与真实 OCR 服务的端到端验收。 |

## 计划二：DeepSeek Harness 机制

| 条目 | 状态 | 证据与边界 |
|---|---|---|
| `@file` 有界索引、目录引用、路径安全、延迟读取 | DONE | Runtime 重新验证 workspace reference；symlink、越界、中文/空格路径、截断和 TTL 测试通过。 |
| 纯文本模型的视觉证据层 | PARTIAL | `VisionEvidencePort`、结构化证据、缓存、并发共享、超时、SSRF/大小/MIME 防护和失败契约已实现并测试；README 已与“不可用时明确失败、禁止 Base64 回退”的真实契约对齐；没有配置真实视觉端点，不能宣称 DeepSeek 真实图片问答验收。 |
| 终态通知分类、去重、当前线程抑制和点击定位 | PARTIAL | 终态投影、设置迁移和 Renderer 去重测试通过；候选打包应用中的系统通知点击定位尚未完成真实人工验收。 |
| 实时用量、精确 usage 替换估算、稳定 TPS | DONE（单元证据） | `LiveUsageProjection` 及流式更新测试通过；未完成候选包视觉验收。 |
| Workbench 注册表、懒加载、错误边界、Viewer 优先级 | DONE（单元证据） | 注册/卸载、重复 ID、懒加载失败重试和 DOM 测试通过；未完成候选包全尺寸人工验收。 |
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
| 候选安全边界 | DONE | 候选默认禁止出站和入站，只有单一 provider、chat 和精确命令可放行；`--check` 通过。 |
| 当前版本真实飞书收发 | UNVERIFIABLE | 现有日志来自早期候选包，且包含“候选入站安全门忽略非 `/status`”和“凭据存储暂不可用”；它们证明了历史失败模式，不能证明当前 HEAD 已真实收发成功。 |
| 当前版本真实微信收发 | UNVERIFIABLE | 本轮按安全边界没有重新扫码、没有向微信发送消息，也没有使用正式用户数据。 |

## 发布门禁

本轮不改公共版本号、不创建或移动标签、不编辑或发布 GitHub Release、不修改官网、不修改 `/Applications/WorkWise.app`。由于真实 OCR/视觉服务和当前候选 IM 人工验收缺失，发布门禁仍未满足，不能把本轮结果称为“完整产品已交付”。

## 下一步的唯一有效验收

1. 在隔离候选目录中用当前构建重新验证钥匙串访问和候选 Runtime probe。
2. 仅在用户明确指定一个飞书测试聊天、一个精确测试命令并确认后，进行一次当前版本飞书入站/出站闭环；不测试微信。
3. 若无真实 Unlimited-OCR 或视觉端点，保留 `PARTIAL/UNVERIFIABLE`，不使用 mock 结果冒充真实能力。

本轮另外修复了 sidecar 许可声明的构建边界：`scripts/build-markitdown-sidecar.mjs` 与 `scripts/verify-document-dependencies.mjs` 现在读取随 helper 分发的声明文件，保留用户对根目录 `THIRD_PARTY_NOTICES.md` 的删除。健康监督的并发恢复修复已由提交 `54c4235` 固化，并有回归测试覆盖重复恢复和 stale 失败后继续退避。

本报告不改变运行逻辑，也不把历史消息、历史文件或历史状态投影为当前任务成功。
