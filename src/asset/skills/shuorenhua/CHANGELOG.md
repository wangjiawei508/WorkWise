# Changelog

## [1.9.0] - 2026-06-18 — Eval Harness / 模型实跑评测

### Added
- 新增 `automation/eval/` 三件套：`rewrite-prompt.md`、`judge-prompt.md`、`README.md`，把 benchmark 改写和交叉判分流程固化成可复制命令。
- 新增 `evals/results-v1.9.0.md`，归档首轮完整双模型实跑结果、非绿用例点评、bounded 尾巴补跑和成本基线。
- `evals/benchmark.md` 新增 `SNF-32`：`bounded` 下商业黑话壳句不得与紧随其后的具体数据句合并，数据句必须逐字保留。

### Changed
- README 评测区切换为 v1.9.0 起的双模型实跑口径；静态走查退为发版前快速自查。
- benchmark 计数同步为 73 条（41 SF + 32 SNF），`evals/run-eval.md` 和 `evals/real-samples.md` 同步 SNF 32 口径。
- `evals/run-eval.md` 补充 bounded 防并句判分：壳句与紧随其后的数据句被合并成一句，记 `❌`。

### Tested
- 小样试跑 `SF-01–05 + SNF-01–03` 第二轮格式可用，改写输出与 judge 表格可逐条对照。
- 首轮完整实跑：Codex 改写由 Claude 判，SF 39/41，SNF 0/32 误杀；Claude Opus 4.8 改写由 Codex 判，SF 34/41，SNF 0/32 误杀。
- `SNF-32` 用同一套 harness 补跑：Codex 与 Claude 均 0/1 误杀，未并句，数据句保留。

### Notes
- 本版不改 `SKILL.md` 或 `references/` 的规则行为，只新增 eval harness、归档和防并句用例。
- 成本基线：Codex rewrite 6 runs 记录 input 1,218,624 / cached 784,384 / output 103,780 / reasoning 87,653；Codex judge 6 runs 记录 input 866,815 / cached 446,720 / output 41,710 / reasoning 32,856。Codex CLI 未提供稳定 cost / duration 字段。
- Claude 可回收记录：SF rewrite 三批 416.503s / $2.629105，judge 六批 375.170s / $2.922822；可回收小计 791.673s / $5.551927。Claude SNF rewrite 小批缺 CLI cost / duration，不手算进小计。实际模型确认为 `claude-opus-4-8`。

## [1.8.8] - 2026-06-10 — README v2

### Changed
- `README.md` 整体重排：before/after 三组示例前置；新增「30 秒上手」（Codex / Claude Code / ChatGPT 三入口 + annotation mode 一句话用法）；场景、力度、scope 压缩为三表一流程；issue #4 的 scope 实测过程折叠进 `<details>`。
- 横幅从位图换成手写 SVG（`assets/banner-light.svg` / `banner-dark.svg`），用 `<picture>` 适配 GitHub 亮暗主题：文字全部转矢量轮廓（字形来自 Noto Sans SC，SIL OFL 1.1），不依赖访问者系统字体，跨平台渲染一致；视觉改走「红笔审稿」方向——划掉的套话、红色句号、一枚「可直接发」印章。原 `assets/readme-logo.png` 保留未删。
- 移除项目状态表和项目结构文件树：版本信息由 release 徽章和 CHANGELOG 承担，规则覆盖数字并入评测区。
- 小节标题去掉版本号，避免随版本腐烂。

### Notes
- 本版只动 `README.md`、`assets/`（新增两个 banner SVG）与本文件，不改规则与评测；计数为实测同步（benchmark 72 条 = 41 SF + 31 SNF，real samples 19 条）。

## [1.8.7] - 2026-06-10 — Maintenance Surface 2 / 安装口径与 bounded 下沉

### Changed
- `install/claude-code.md` 重写：Claude Code 会按 `SKILL.md` frontmatter 的 description 自动发现并触发 skill，移除“不会自动发现、CLAUDE.md 说明不能省略”的过时断言；CLAUDE.md 触发说明降级为可选增强；新增软链接“跟随更新”安装方式。
- `install/` 全部平台文档补「长文改写的三档 scope」小节（structural / bounded / in-place 与长文默认值）——v1.8.6 的 scope 能力此前没有下沉到任何安装入口。
- `install/chatgpt-gpt-instructions.md` 执行流程补 scope 判断一行（需维护者手动同步到 Custom GPT 后台）。
- `references/examples.md` 新增 Bounded 双合同示例（正文 + 建议删除清单，合成文本，含「句内洗 vs 进清单」的边界说明）。
- `references/positive-style.md` 长文节奏边界补一句 bounded 口径：节奏句不进清单，进清单的必须是纯空句。

### Notes
- 本版不改 `SKILL.md` 与 `evals/`，是 v1.8.4 之后第二个维护面版本。
- 仓库杂项：移除空的 `docs/` 目录；`CLAUDE.md → AGENTS.md` 软链纳入版本控制，Claude Code 用户 clone 后直接生效。

## [1.8.6] - 2026-06-03 — Bounded Scope / 长文去味与保长度的中间态

针对 [#4](https://github.com/MrGeDiao/shuorenhua/issues/4) 复测反馈:v1.8.5 的 `in-place` 把长度接住了(实测 95–96%),但去 AI 味效果明显弱于 `structural`——长文里整句级的空话(无源引用、价值拔高收尾)在 `in-place` 下规则上删不掉,只会被软化保留。本版在 `structural` 和 `in-place` 之间补一个 `bounded` scope。

### Added
- `SKILL.md` 新增 `bounded` edit scope:`public-writing` 长文默认 scope。允许删"整句都是空话"的句子,但不直接删,而是进「建议删除(待确认)」清单交用户拍板;句内洗实句照常,不并句、不重排、不删承担节奏的重复。
- `evals/benchmark.md` 新增 2 条用例(70 → 72,40 SF + 30 SNF → 41 SF + 31 SNF):
  - `SF-41`:`bounded` 下整句空话(谄媚开场 / 无源引用 / 价值拔高收尾)进删除清单,带数字的实句和排比节奏句原样保留
  - `SNF-31`:`bounded` 删除清单不该混进实句或节奏句——带句首引导词(`说到底`)但实质是立场判断的句子,只能句内删引导词,整句不进清单
- `references/operation-manual.md` 顶部新增「Scope 与删除清单」一节,统一三档 scope 下"整句空话 vs 句首引导词"的处理,不在各类问题里重复。

### Changed
- 长 `public-writing` 默认 scope 从 `in-place` 改为 `bounded`(行为变化);`in-place` 退为用户明确要求"完全原样 / 一句都别删 / 严格保句数",或反馈 `bounded` 仍删多了时才用。
- `SKILL.md` 执行顺序第 5 步 scope 判断扩成三档;第 8 节回读把"字数留存"从硬指标降为参考,新增"信息留存"为硬指标——`bounded` 删整句空话会降字数,约束应落在"信息点可追溯"和"删除清单只含纯空句"上,不是字数。
- `README.md`、`evals/run-eval.md` 同步版本、计数(72)、scope 三档和默认值变化。

### Tested
- 2026-06-03 首次**模型实跑**(此前各版为静态复核):同一篇 1498 字合成长文,用现有 `SKILL.md`+`references/` 跑 `aggressive` 力度的 `structural` 和 `in-place`,Codex(gpt-5 家族)与 Claude(opus 家族)双交叉。
- 结果支撑本版动机:`in-place` 两个模型都把无源引用、价值拔高收尾**整句残留**(只软化铺垫),留存 95–96%;`structural` 都删掉这些整句空话,留存 80–83%。`bounded` 规则刚落地,实跑留待下一轮。
- 一处修正:`structural` 在两个强模型上并未腰斩(实测 -18%,非 issue #4 报告的 -39%),说明长文 `structural` 缩水程度依模型而定、不可控——这也是 `bounded` 把"删多少"交还用户的理由。

### Notes
- `bounded` 不是第四个力度档位,而是 scope 轴上介于 `structural` 和 `in-place` 之间的中间态;`minimal / standard / aggressive` 三档力度不变。
- 实跑成稿和对照存档在本地 `tasks/current/runs/`(local-only)。

## [1.8.5] - 2026-05-27 — In-place Scope / 长文保长度

针对 [#4](https://github.com/MrGeDiao/shuorenhua/issues/4) 反馈"长文被改完明显缩水"（约 1800 字 → minimal 约 1500 字 → aggressive 约 1000 字）。本版结论：问题不在三档力度，而在长文默认走 structural 动作时，删句、并句、重排段落会叠加。

### Added
- 新增 `in-place` edit scope，和 `minimal / standard / aggressive` 三档力度**正交**。`in-place` 下只做句内替换、删短语和降调，不默认删整句、并句或重排段落。它不是第四档力度，而是改写动作的边界。
- `evals/benchmark.md` 新增 4 条用例（66 → 70 条，38 SF + 28 SNF → 40 SF + 30 SNF）：
  - `SF-39`：长 `public-writing` 在 `in-place` 下应去掉拔高骨架，但保留字数、句数和关键转场
  - `SF-40`：多类骨架叠加时，`in-place` 应做句内替代，而不是删段落
  - `SNF-29`：重复短语承担长文节奏时，不应被当作水分误删
  - `SNF-30`：正常承接句挂在事实上下文里，不应被误杀为总结式收尾
- `evals/real-samples.md` 新增 `RS-19` 高拟真合成长文样本（不直接转录 issue #4 原文），并为 long-form 场景增加 `长度节奏` 评分维度。
- 新增 `evals/results-v1.8.5.md`，归档本轮静态复核。

### Changed
- `SKILL.md` 在执行顺序里加入 scope 判断，定义 `structural` / `in-place` 两种改写边界。默认走 `structural`；中文 `public-writing` 长文（约 1000 字以上）或用户明确要求保长度、保句数、保段落节奏时切到 `in-place`。
- `references/operation-manual.md` 给二元对比、总结式收尾、narrator 腔、价值拔高骨架四类骨架补 `in-place` 替代动作，保留原有 structural 默认动作不变。
- `references/positive-style.md` 和 `references/scene-guardrails.md` 加长文节奏边界：重复和转场不一定是水分，删之前先看它是不是在承担段落呼吸。
- `evals/run-eval.md` 同步 scope 判断和 70 条 benchmark 的评测范围。
- `README.md` 同步版本、计数和 In-place Scope 能力说明。

### Tested
- 静态复核 `SF-39` / `SF-40` / `SNF-29` / `SNF-30`：4 条新增 benchmark 都能被 `SKILL.md` + `references/operation-manual.md` 当前的 scope 规则解释。
- 静态复核 `RS-19`：推荐改法保留五段结构、三处时间锚点和关键转场，不把长文压成摘要。
- 没有跑模型实测。本版的"通过率"是静态走查口径，不是任何具体模型在线跑出来的结果——模型实跑留给后续轮次。

### Notes
- 本版不动 `minimal / standard / aggressive` 三档力度本身，也不新增第四档；调整集中在"动作边界"这一条新的正交轴上。
- `in-place` 不是凑字数。字数留存率（目标 ≥ 0.90，硬下限 0.85）是回读指标，真正约束的是不删整句、不并句、不重排段落。
- "约 1000 字"是这一轮反馈得到的工程默认值，不是稳定结论；后续需要更多真实长文 bad case 校准。

## [1.8.4] - 2026-05-17 — Maintenance Surface / 维护入口对齐

### Added
- 新增 `.github/ISSUE_TEMPLATE/bad-case.md`，给“改完还是像 AI”的反馈留一个结构化入口，固定收集原文、使用方式、场景、问题点、不可改坏内容和期望方向。
- `CONTRIBUTING.md` 新增 bad case 提交说明，明确脱敏和授权边界。

### Changed
- `README.md` 最新版本说明更新到 `v1.8.4`，并把 lite / full 的安装口径写清楚：lite 是只加载 `SKILL.md`，full 是 `SKILL.md` + `references/`。
- `install/` 下各平台安装文档统一 lite / full 表述，避免不同入口对“只放 `SKILL.md` 还是带 `references/`”给出相互矛盾的建议。

### Notes
- 本版不改 `SKILL.md`、`references/`、`evals/benchmark.md` 或评测口径；它是维护入口和分发准备版本，不是规则能力扩张。
- 本地 `tasks/current/roadmap-v1.8-v2.0.md` 已同步到当前维护状态；`tasks/` 仍保持 local-only，不进入公开发布面。

## [1.8.3] - 2026-05-09 — Community Intake Round 1 / 首次实战

### Added
- `evals/benchmark.md` 新增 4 条用例（62 → 66 条，35 SF + 27 SNF → 38 SF + 28 SNF）：
  - `SF-36`：路径正确性认证（`已经走在正确的路上了 / 走得很稳`），身份认证式夸奖在"对你的进度"维度上的延伸
  - `SF-37`：对人本身发证书（`说明你已经超越绝大部分人了 / 你已经具备做这件事的实力了`），SF-31 同族新变体
  - `SF-38`：庸医问诊腔变体（`掰扯清楚 / 彻底掰开说清楚`），归并到 `references/phrases-zh.md` 「庸医问诊腔」族
  - `SNF-28`：技术语境里的"落盘"放行（宾语是 `重构方案 / 三份文档` 这类具体技术对象），规则同 v1.7.3 的 `接住` 按宾语判断

### Changed
- `references/operation-manual.md` 4 处补充（按"模式优先、词条兜底"原则，主要规则更新落在 manual 边界，不新增 phrases-zh 词条）：
  - 5.2 节「过度接住 / 心理判断腔」补 `你现在的 X 很正常` 心理判断变体
  - 5.2 节补 `抱住 / 紧紧抱住 / 拥抱 / 实实在在的抱住你这种想法` 同类抚慰动词归并提示
  - 第 3 节「工程师腔」补 `落 X / 把 X 落下去 / 落到` 万能动词边界（按宾语区分姿态层 vs 技术对象）
  - 第 7 节「价值拔高骨架」补 `你看完会彻底开悟 / 看完就懂了 / 看完会震惊 / 看完不再 X` 承诺式收尾
- `evals/run-eval.md` 同步评测口径：SF 范围 → `01–38`，SNF 范围 → `01–28`，总数 → `66`
- `README.md` 同步状态徽章、状态表、评测表、项目结构里的 benchmark 数量（62 → 66），版本号 → `v1.8.3`
- `evals/real-samples.md` 同步 benchmark 计数（62 → 66）：元数据对比表（"benchmark vs real-samples 分工"）+ RS-10 推荐改法演示文本，样本本身和数量（18 条）不变
- `references/phrases-zh.md` 工程师腔族升级 `落盘 / 已经落下去` 两条已有词条为按宾语判断（沿用 v1.7.3 `接住` 的处理方式），让 SNF-28 在单加载词表的评测路径上也能正确放行；不新增词条

### Tested
- 2026-05-09 用 v1.8.2 引入的 intake automation 跑了首次真实 community intake：10 条样本批次 → 报告归类 `已覆盖 3 / 变体归并 13 / 候选新模式 2`，落到 `tasks/current/intake/reports/2026-05-09-intake.md`（local-only）
- intake 报告自身守住"已覆盖 → 无动作"边界：3 条已覆盖样本（包括接住体长版样板、元讨论保护、`You're absolutely right!`）全部按现有规则放行，没有被推到候选新模式
- 新增 4 条 benchmark 静态复核：在更新后的 `operation-manual.md` 下，SF-36/37/38 命中身份认证 / 庸医问诊腔规则；SNF-28 在工程师腔的"落 X 按宾语判断"新边界下应放行

### Notes
- 本版坚持 v1.8.2 intake 协议的"模式优先、词条兜底"：**不新增** `references/phrases-zh.md` 词条；只升级已有 `落盘 / 已经落下去` 两条的判断口径（同 v1.7.3 `接住`），其余规则更新落在 `operation-manual.md` 的边界说明上
- 2 个候选新模式（末尾二选一追问 / narrator 自夸式自我演绎）按 `automation/README.md:62-64` 协议，先记录在 intake 报告里观察 2-3 轮，确认是否反复出现再考虑入库；本版不立即落库
- 本轮 intake 也是 v1.8.2 工具链首次脱离 dryrun 跑真实社区样本，验证了"先 intake 报告 → 人工确认 → 才动文件"的工作流可走通
- 不动 `references/structures.md`、`SKILL.md`；`evals/real-samples.md` 仅做计数同步，样本本体和数量（18 条）不变；`references/phrases-zh.md` 仅升级 `落盘 / 已经落下去` 两条已有词条的判断口径，不新增词条

## [1.8.2] - 2026-05-01 — Intake Automation / 维护者侧反馈闭环

### Added
- 顶层新增 `automation/` 目录，作为维护者工具入口（committed）：
  - `automation/intake.md` — 协议规范
  - `automation/intake-prompt.md` — Codex prompt 本体
  - `automation/README.md` — 运行入口，含可复制粘贴的 `codex exec -C . -s read-only --ephemeral -o ...` 命令、文件命名约定、强约束说明
- 运行实例继续放在 `tasks/current/intake/inbox/` 和 `reports/`（`.gitignore` 内，本地工作目录），第一次用前 `mkdir -p` 即可
- dryrun 验证集（本地）：6 条合成样本覆盖三档结论 + 两类陷阱（被讨论词、技术语境放行），expected baseline 钉在 inbox 同目录下
- 真实样本 smoke（本地）：用 `evals/real-samples.md` 的 RS-14 接住体跑了一次，验证工具守住"已覆盖 → 无动作"边界

### Changed
- `CONTRIBUTING.md`「维护者：Community Observation Intake」末尾新增"自动化运行（v1.8.2 起）"小节，明确自动化只覆盖原 5 步里的第 2-3 步（抽象姿态链、判宾语 / 判场景），第 1、4、5 步仍需人工
- 公开路线图把原 v1.8.2「Feedback Loop / 反馈闭环」拆成两半：维护者侧 intake automation（本版）+ 外部 issue 模板 / pinned issue / bad-case 公开征集（顺延到 v2.0，理由和 v1.7.3 retro 一致）

### Tested
- 2026-05-01 跑了两轮 codex exec：第一轮 dryrun 6/6 命中 expected（已覆盖 3、变体归并 2、候选新模式 1），无误判被讨论词或技术语境放行；第二轮真实样本 smoke 1/1 标"已覆盖 → 无动作"
- 报告格式两轮都符合 spec 的 6 段：本轮样本数 / 已覆盖 / 变体归并 / 候选新模式 / 建议动作 / 一句总判断
- prompt 一轮通过，没有进入预设的"最多 2 轮微调"分支

### Notes
- 本版只动 intake 工具链 + 维护者文档，**没有改** `SKILL.md`、`references/*`、`evals/benchmark.md`、`evals/real-samples.md`、`README.md`，benchmark 总数仍为 62 条（35 SF + 27 SNF）
- 强约束遵循 spec 已固定的口径：报告默认不建议加词条、不自动改仓库；`-s read-only` 沙箱在 codex 层再保一道
- 不做 Codex Automation 调度（每周自动跑、自动开 issue）和外部 bad-case 征集入口，等 v2.0 配合分发一起做

## [1.8.1] - 2026-04-27 — Knowledge Architecture / 项目知识架构对齐

### Changed
- `README.md` 更新项目状态和快速开始入口，把公开信息架构对齐到当前已发布能力
- `install/codex.md` 和 `evals/run-eval.md` 切换到当前 Codex CLI 的 `codex exec` 用法，避免旧命令继续作为主入口传播
- `install/chatgpt.md` 去掉易漂移的 reference 文件数量，改为按目录上传完整知识文件

### Framing
- 本版定位为项目知识架构对齐：让新用户能从 README 进入使用路径，让评测和安装入口保持同一套事实基线
- 不改变 `SKILL.md`、`references/`、benchmark 判分口径或 Scene Packs 行为；`v1.8.1` 是采用路径和维护表面的升级，不是规则能力扩张

## [1.8.0] - 2026-04-24 — Scene Packs / 可直接发场景包

### Added
- 新增 `references/scene-packs.md`，把 `public-writing` 细分为 `README`、`release-note`、`forum-post`、`issue-reply` 四个可发布场景
- `evals/benchmark.md` 新增 8 条 scene pack 回归用例：`SF-32` ~ `SF-35` 覆盖该改场景，`SNF-24` ~ `SNF-27` 覆盖误杀防护
- `evals/real-samples.md` 新增 `RS-15` ~ `RS-18` 四条整段样本，分别覆盖 README intro、release note、forum post 和 issue reply
- 新增 `evals/results-v1.8.0.md`，归档本轮 TDD 静态复核结果

### Changed
- `SKILL.md` 在大场景判定后增加 Scene Packs 入口：先判 `public-writing`，再按发布目的细分
- `references/scene-guardrails.md` 明确分工：大场景边界仍由 guardrails 控制，scene packs 只做更细的落地策略
- benchmark 总数从 54 条（31 SF + 23 SNF）扩到 62 条（35 SF + 27 SNF）
- `README.md` 重构为正式项目首页：新增状态徽章、快速导航、v1.8.0 场景能力入口和 Star History
- 新增 `assets/icon-hd.png` 和 `assets/readme-logo.png`，在保留原 icon 元素的基础上补齐 README 横向品牌图

### Tested
- 2026-04-24 按 TDD 做静态复核：先补 `SF-32` ~ `SF-35` / `SNF-24` ~ `SNF-27`，再写最小 Scene Packs 和接入点
- 静态复核结果：SF 通过率 `35/35 (100%)`，SNF 误杀率 `0/27 (0%)`，Scene Packs `8/8 (100%)`
- 复核方式、用例详情和 real samples 评分口径见 `evals/results-v1.8.0.md`

### Notes
- v1.8.0 不做 Voice Calibration / Voice Hints，不模仿名人、品牌或公众人物
- 公开 bad-case 征集入口继续留到 v2.0，等项目有更多外部流量后再和分发一起做

## [1.7.4] - 2026-04-20 — Guardrails & Retro

### Added
- `evals/benchmark.md` 新增 `SNF-22`（code-context：技术语境里的接住突发请求）和 `SNF-23`（docs：限流网关稳稳接住上游峰值请求），作为 v1.7.3"接住"语境判断的**回归护栏**——防止未来改规则时把"接住请求 / 接住流量 / 稳稳接住上游峰值请求"一起误杀
- `evals/results-v1.7.4.md` 新增评测归档：追溯覆盖 v1.7.1 → v1.7.4 的 benchmark 增量（`SF-31`、`SNF-22`、`SNF-23`），补上 v1.7.2 / v1.7.3 当时没做的结果归档
- `CONTRIBUTING.md` 新增"维护者：Community Observation Intake"小节，把 v1.7.3 用过的"公开讨论 → 姿态链抽象 → 判宾语 / 判场景 → 双向补样本 → 升级规则"五步流程沉淀为可复用协议

### Changed
- benchmark 总数从 52 条（31 SF + 21 SNF）扩到 54 条（31 SF + 23 SNF）
- `README.md` 的评测口径（54 条）、最新归档链接（`results-v1.7.4.md`）、文件树里的 benchmark 条数（54）同步对齐
- `evals/real-samples.md` 顶部版本标记从"v1.7.2 新增"升级为"v1.7.2 新增（首批 12 条），v1.7.3 扩到 14 条"；内部 benchmark 对比表条数同步为 54

### Tested
- 2026-04-20 对 `SNF-22` / `SNF-23` 做静态复核：在 v1.7.3 现有规则下（`phrases-zh.md:88-90, 240-243`、`operation-manual.md:201, 213, 219`）两条 SNF 都按预期放行，**不需要修改规则文件**——这正是"先写回归测试再看规则"的 TDD 收尾
- 复核方式、通过率和用例详情见 `evals/results-v1.7.4.md`

### Notes
- v1.7.4 是 v1.7.x 的收尾版本，主旨是 **Guardrails（回归护栏）** + **Retro（追溯归档和方法论沉淀）**，不引入新能力也不扩词表
- 原 v1.7.3 roadmap 规划的"入口打通 + bad-case 收集"整体推迟到 v2.0，等项目有曝光后再配合分发一起做
- 后续路线已调整：v1.8.0 先做 Scene Packs / 可直接发场景包，Voice Hints Lite 推迟到 v1.9 评估

## [1.7.3] - 2026-04-17 — Community Intake / 接住体

### Added
- `evals/real-samples.md` 新增“社区观察：为什么‘接住体’一眼像 AI”区块，提炼 Linux.do / V2EX 公开讨论里的高频方法信号，并附公开链接作观察来源
- `references/boundary-cases.md` 新增案例 10：技术语境里的“接住请求”，明确 `接住` 不能按字面一刀切
- `evals/real-samples.md` 新增 `RS-14`（社区标题 / 宣言腔），覆盖 `稳稳地接住所有人` 这类标题式承接承诺

### Changed
- `references/phrases-zh.md`、`references/operation-manual.md` 把“接住”从单词命中升级为按宾语和场景判断：人/情绪/关系默认更可疑，请求/流量/峰值先回技术语境判断
- `SKILL.md` 的 Lite 模式兜底同步覆盖“过度接住 / 心理判断 / 身份认证式夸奖”，避免单文件模式和 Full 模式行为分裂
- `README.md` 同步补“姿态链优先”的解释，明确这类问题按模式处理，不按社区热词逐条追打
- 按最近公开讨论里的分布，这版也开始覆盖 Claude Opus 4.7 新冒出来的那批口癖；它在“我就在这里 / 稳稳接住 / 你不是……你只是……”这组姿态链上，已经越来越接近 GPT-5.4
- `evals/real-samples.md` 数量从 12 条更新为 14 条，`README.md` 评测口径同步对齐

### Tested
- 2026-04-17 做一轮“接住体”静态 smoke test：私聊安抚、社区标题、推销式结尾应命中；技术语境里的“接住峰值请求 / 流量”应放行
- `git diff --check` 通过

## [1.7.2] - 2026-04-17 — Real Sample Eval Pack

### Added
- 新增 `evals/real-samples.md`，首批 12 条整段样本，覆盖 README 简介、release note、X 短帖、Linux.do 长帖、GitHub issue 回复、commit message、Python docstring、开发进度同步、技术博客开头、微信对话、知乎长回答、混合场景
- 每条样本按统一模板记录：原文、场景、为什么像 AI、不该改坏什么、推荐改法、原文 3 维评分
- 新增 3 维评分体系：`自然 / 保真 / 可直接发`（5 分制），以"可直接发"为最终指标，`保真` 掉到 < 4 分即算退步
- 新增"高频 AI 句式分布"区块：汇总 2026-04 中文用户被吐槽最多的 AI 味句式（`要不要我顺手帮你`、`掰开揉碎`、`先说结论`、`直接封神`、`核心逻辑是` 等），用来指导样本构造
- `README.md` 示例 2 换成 `RS-11`（微信工程师腔溢出），还原"程序员一开口像在写工程报告"的尴尬瞬间

### Changed
- `README.md` 评测区补充 `real-samples.md` 12 条整段样本的说明，和 51 条 benchmark 并列
- `tasks/roadmap-v1.7-v2.0.md` v1.7.2 条目全部打勾

### Notes
- 首批为"观察归纳 + 合成"样本，不指向任何真人或真项目。之所以不直接引用真实帖子到公开仓库：未授权转录有归属和合规问题
- 真实样本收集机制留给后续版本，届时会补单独的提交流程和授权模板，再追加到本文件（目标 20+ 条）

## [1.7.1] - 2026-04-14 — Residual Audit / Two-pass

### Added
- `references/operation-manual.md` 新增 `Residual Audit / 二次审稿` 条目，固定第二遍只查 5 类残留：开场、总结、narrator、空泛判断、句长过匀
- `references/examples.md` 新增 2 组一遍 vs 两遍示例，并把英文 `two-pass demo` 改成不补新事实的版本
- `evals/benchmark.md` 新增 5 条二次审稿相关用例：`SF-28`、`SF-29`、`SF-30`、`SNF-20`、`SNF-21`

### Changed
- `SKILL.md` 把回读正式拆成两步：`保真回读 + Residual Audit`，并明确第二遍只允许轻量修正
- `SKILL.md` 补充场景保守策略：`docs / status / code-context` 的第二遍默认更克制，宁可停在第一遍也不为了“更像人”改失真
- `evals/run-eval.md` 同步评测口径：纳入 `Positive Style Contract` / `Protected Spans`，SF/SNF 范围更新到 `30 / 21`
- `README.md` 同步工作流和 benchmark 数量到 `51` 条

### Fixed
- `SKILL.md` frontmatter 去掉远端同步带来的 `metadata` 字段，调整为当前本地 skill 规范可稳定使用的形式

### Tested
- 2026-04-14 用 GPT-5.4 Codex 静态复核 `benchmark.md`（51 条）：SF 通过率 `30/30 (100%)`，SNF 误杀率 `0/21 (0%)`
- `Residual Audit` 新增 3 条正例（`SF-28`、`SF-29`、`SF-30`）和 2 条反误杀样本（`SNF-20`、`SNF-21`）全部通过

## [1.7.0] - 2026-04-13 — Positive Style Contract + Protected Spans

### Added
- 新增 `references/positive-style.md`，把“更像人”写成正向合同：强调具体动作、真实主语、轻微不对称节奏和分场景校准，不再只停留在“删套话”
- 新增 `references/protected-spans.md`，把数字、日期、名字、引用、命令、代码、参数、路径、报错、指标和责任归属整理成预检清单
- `evals/benchmark.md` 新增 4 条 fact-preservation 相关用例：`SF-25`、`SF-26`、`SF-27`、`SNF-19`

### Changed
- `references/scene-guardrails.md` 接入 `Protected Spans` 入口，按场景补充优先保留项
- `SKILL.md` 执行顺序改为先划 `protected spans` 再改写，回读项补 protected spans 检查，并加入 `Positive Style Contract` / `Protected Spans` 导航
- `README.md` 同步新增 `Protected spans` 和 `Positive Style Contract` 能力说明，更新 benchmark 数量和 `v1.7.0` 口径

### Notes
- 本次只落 `v1.7.0` 的基础层，不包含 `Residual Audit / Two-pass`、voice 拟合、real-sample pack 或 scene packs
## [1.6.1] - 2026-04-08 — ChatGPT Custom GPT 支持

### Added
- 新增 `install/chatgpt-gpt-instructions.md`，提供 Custom GPT 的 Instructions 文本，用户自建 GPT 时直接复制
- `install/chatgpt.md` 新增 Custom GPT 方案（推荐）和 Projects 方案，解决 Custom Instructions 1,500 字符放不下 `SKILL.md` 的问题（[#3](https://github.com/MrGeDiao/shuorenhua/issues/3)）

### Changed
- `install/chatgpt.md` 原有的 Custom Instructions 方案降级为备选，注明字符限制
- `README.md` 快速开始部分新增 ChatGPT Custom GPT 入口提示，平台链接更新为"ChatGPT / Custom GPT"

## [1.6.0] - 2026-04-03 — Code-context benchmark + rule boundary hardening

### Added
- `evals/benchmark.md` 扩到 42 条：新增 `code-context` 维度，补上 `SF-22`（docstring AI 腔）、`SF-23`（commit message AI 腔）、`SF-24`（英文代码注释 AI 腔）、`SNF-17`（正常技术注释）、`SNF-18`（正常 commit message）
- 覆盖矩阵新增 `code-context` 列，评测标准补 code-context 样本约束
- `references/boundary-cases.md` 新增案例 9：混合场景 worked example（技术博客嵌事故复盘），完整展示判主场景、识别次场景、分区处理的决策过程
- `references/severity.md` 误杀防护新增第 11 条：中英混排句中的英文词按实际语义判断，不机械套词表
- `SKILL.md` 单文件兜底规则同步补中英混排指引

### Changed
- `references/severity.md` Tier 2 新增长度归一化：短段落（< 100 字/词）同段 2+ 即标记，长段落（≥ 100 字/词）同段 3+ 再标记；决策流程图同步更新
- `SKILL.md` Tier 2 描述同步加长度参考
- `references/severity.md` Tier 2 定义段去掉写死的"2 个以上"，改为指向长度参考，数字来源收敛为一处
- `evals/run-eval.md` 更新 SF/SNF 范围、总 case 数（42）、评测提示词补 code-context 说明

## [1.5.0] - 2026-03-30 — Benchmark matrix + unsourced citation policy + annotation mode

### Added
- `evals/benchmark.md` 扩到 37 条：新增 `long / mixed / unsourced citation focus` 三类样本，补上 `SF-18`、`SF-19`、`SF-20`、`SF-21`、`SNF-15`、`SNF-16`
- `SKILL.md` 新增 `annotation mode` 输出合同，固定最小字段为 `问题族 / 触发点 / 建议动作 / 是否建议改写`
- `references/examples.md` 新增 3 组 `annotation mode` 对照示例
- 新增 `evals/results-v1.5.0.md`，归档本轮 benchmark 复核结果

### Changed
- `SKILL.md`、`references/operation-manual.md`、`references/scene-guardrails.md` 全部对齐为 3 种无源引用策略：`rewrite-safe`、`audit-only`、`rewrite-with-placeholder`
- `evals/run-eval.md` 从 Codex 专用改为平台无关，新增 Claude Code 快速运行和通用 LLM / API 评测说明
- `install/codex.md` 增加 `annotation mode` 的最小可复制用法
- `install/claude-code.md` 增加 `annotation mode` 用法和无源引用模式说明
- `install/openclaw.md` 增加 `annotation mode` 用法和无源引用模式说明
- `install/cursor.md` 增加 `annotation mode` 用法和无源引用模式说明
- `install/chatgpt.md` 增加 `annotation mode` 用法和无源引用模式说明
- `README.md` 安装部分新增 Claude Code 快速用法，annotation mode 示例覆盖 Codex 和 Claude Code；平台链接顺序调整为 Codex > Claude Code > OpenClaw > Cursor > ChatGPT
- `CONTRIBUTING.md` 更新到 `v1.5.0` 的 benchmark 规模、标注模式和维护策略

### Tested
- 2026-03-30 静态 benchmark 复核 `benchmark.md`（37 条）：SF 通过率 `21/21 (100%)`，SNF 误杀率 `0/16 (0%)`
- 2026-03-30 用 GPT-5.4 Codex 对 `SF-05`、`SF-21`、`SNF-01`、`SNF-16` 做 `annotation mode` 抽样验证，结果与新规则一致

## [1.4.3] - 2026-03-28 — Pattern-first intake hardening + eval sync

### Added
- 新增“模式变体归并”规则：遇到 `扒开 / 拽出来` 这类未逐词收录的说法，先并入现有问题族，不把词表当成穷举清单
- `evals/benchmark.md` 新增 2 条用例：`SF-17` 验证现有模式对未收录变体的吸收能力，`SNF-14` 验证讨论词条维护策略时不误杀被引用词
- 新增自动化 intake 方案文档，定义社区样本的收集、归类、建议输出和人工确认流程
- 新增 `tasks/automation-intake-prompt.md`，提供可直接复用的 automation prompt 模板

### Changed
- `SKILL.md`、`references/operation-manual.md`、`references/phrases-zh.md`、`CONTRIBUTING.md` 全部对齐为“模式优先、词条兜底”的维护策略
- `evals/run-eval.md` 和 README 的 benchmark 口径同步到最新用例数量

### Tested
- 2026-03-28 用 GPT-5.4 Codex 重新跑 `benchmark.md`（31 条）：SF 通过率 `16/17 (94.1%)`，SNF 误杀率 `0/14 (0%)`

## [1.4.2] - 2026-03-26 — 发布口径对齐 + 文档修正

### Changed
- `SKILL.md` frontmatter：`name` 从 `stop-slop-zh` 改为 `shuorenhua`，描述补"中英文"，H1 改为"说人话"
- `install/` 文档全面修正触发模型描述：删除"Claude Code 自动识别"和"OpenClaw 全量加载"等误导性说法，明确各平台的触发入口；统一补充验证示例
- `evals/run-eval.md`：补全缺失的 reference 文件列表（`phrases-en`、`operation-manual`、`scene-guardrails`、`boundary-cases`）；评测流程改为先判场景 / Tier / 档位

## [1.4.1] - 2026-03-26 — Skill workflow 修复 + benchmark 边界加固

### Added
- 新增 `references/operation-manual.md`，把二元对比、总结收尾、工程师腔、商业黑话、narrator 腔、语域混搭等问题写成可执行的微操作协议
- 新增 `references/scene-guardrails.md`，补齐 `chat / status / docs / public-writing` 的禁改项
- 新增 `references/boundary-cases.md`，加入系统主语、英文图算法字面动词、学术被动语态、具体证据支撑的真人 debug 对话等边界案例
- 新增“价值拔高骨架”规则，明确覆盖 `这不仅仅是……更是……`、`真正的 X 不是……而是……`、`最后比拼的是……`

### Changed
- `SKILL.md` 重写为入口型主文档：先做场景 / Tier / 档位判断，再按问题类型补读 `references/`
- 单文件模式改成明确兜底路径，不再暗示 `SKILL.md` 单独加载就等于完整模式
- `SKILL.md` frontmatter 恢复中文触发描述，降低 skill 自动触发失配风险

### Fixed
- 修正 `references/operation-manual.md` 中把 `对上了` 替换成 `对齐` 的规则冲突，改为 `核对`
- 为 `navigate` 在图算法 / 网络拓扑语境中的字面用法增加误杀防护
- 为学术或实验语体中的正常英文被动语态增加误杀防护
- 为带具体参数、操作和结果的真人工程师 debug 对话增加误杀防护
- 静态 benchmark 风险点补强：覆盖 SF-08、SF-16、SNF-05、SNF-09、SNF-11

## [1.4.0] - 2026-03-25 — GPT-5.x 新词入库 + Codex review 修复

### Added
- GPT-5.x / Codex 新口癖大批入库：庸医问诊腔（抠出来/揪出来、不靠猜）、暴力动作腔（补一刀、狠狠干、拍脑门、拍板）、AI 主动出击腔（要不要我、我立马开始、只要你回复我、顺手）等 30+ 条
- Tier 2 新增单音节命令词类别：补/接/核/进/顺/落/坏/跑
- SKILL.md 加入 repo 根目录，此前只在 Claude Code skill 目录
- SKILL.md v2.0.0：按处理方式分组（直接删除类 vs 替换为具体表达类），不按来源分类

### Changed
- README 全文重写：GPT-5.4 荒谬引文开头、血压升高类和暴力动词类专门示例
- 安装部分从 80 行缩到 13 行，详情推到 install/ 目录
- 短语计数统一为 bullet 数：中文 210+、英文 96（此前各文件数法不一致）
- phrases-en.md Tier 3 阈值对齐 severity.md（分段阈值替代 >3%）

### Fixed
- run-eval.md 硬编码本地路径改为相对路径
- 评测数据更新为 29 条（16 SF + 13 SNF），此前漏计 SF-16
- CHANGELOG、README、results、openclaw.md 数据全部对齐

## [1.3.0] - 2026-03-24 — 项目更名为「说人话」(shuorenhua)

### Renamed
- 项目名从 stop-slop-zh 更名为「说人话」(shuorenhua)
- README 全文重写，去掉 AI 味，加入 ChatGPT 5.4 工程师腔黑话作为传播亮点

### Tested
- GPT-5.4 Codex 评测：SF 通过率 14/15 (93%)，SF-16 待测；SNF 误杀率 0/13 (0%)
- 评测集扩展至 29 条（16 SF + 13 SNF）
- 评测结果归档：`evals/results-v1.3.0.md`

### Added
- 新规则 11：语域一致性检测 — 同段混搭 2+ 种语域（学术/口语/商业/工程/鸡汤）时标记
- 新规则 12：节奏量化检测 — 句长标准差锚点（AI ≈ 1.2 vs 人类 ≈ 4.7+）
- 新短语类别「工程师腔 / 调试腔」：稳稳兜住、落盘、收口、根因、打掉问题、收窄等 19 条
- 新短语类别「自媒体 / 小红书 AI 腔」：保姆级、绝绝子、谁懂啊、拆解、硬核等 17 条
- Tier 1 开场套话新增 5 条：不得不说、诚然、深入探讨、具体来说、更重要的是
- Tier 1 渲染性强调新增 7 条：毫不夸张、值得深思、令人深思、引发思考、颠覆性、范式转移等
- Tier 1 正能量收尾模板新类别：与其…不如…、只有…才能…、让我们拭目以待、未来可期
- Tier 1 过渡废话新增 4 条：本质上、核心在于、关键在于、由此可以看出
- Tier 2 连接词新增 5 条：恰恰、正是、无疑、由此可以看出、不外乎
- Tier 2 形容/修饰新增 3 条：可谓、堪称、追根溯源
- 结构反模式新增 5 种：#14 分条列点强迫症、#15 正能量收尾强迫症、#16 假口语化、#17 调试腔叙事、#18 句长均匀
- 评测集 SF 新增 5 条：SF-11 工程师腔、SF-12 小红书腔、SF-13 正能量收尾、SF-14 语域混搭、SF-15 句长均匀
- 评测集 SNF 新增 3 条：SNF-11 真人 debug 对话、SNF-12 真人博主网络用语、SNF-13 纯技术报告术语
- 误杀防护新增 2 条：技术报告中的工程术语、真人网络用语
- 改写示例新增 3 组：工程师腔、小红书腔、语域混搭

### Changed
- 5 维评分升级为 7 维评分：新增「语域」「具体」维度，每维增加量化锚点
- 评分阈值从 < 35 调整为 < 49（适配 7 维）
- 核心规则从 10 条扩展为 12 条
- severity.md Tier 1/Tier 2 典型词更新，反映新增分类
- phrases-zh.md 来源说明更新，加入 Linux.do / X / 即刻社区

## [1.2.0] - 2026-03-23

### Added
- Codex CLI installation guide (`install/codex.md`) with AGENTS.md, system prompt, and global instructions methods
- Codex quick start section in README

### Changed
- Moved Codex CLI content from `install/chatgpt.md` to dedicated `install/codex.md`

## [1.1.0] - 2026-03-23

### Added
- Scene-based routing: chat/status/docs/public-writing with minimal/standard/aggressive intensity levels
- Unsourced citation pattern detection (Chinese and English)
- 9 additional Chinese high-frequency AI phrases
- Misfire protection for technical system subjects
- Length-normalized thresholds for Tier 3 severity

### Changed
- Rules 3 (subject) and 5 (reader address) downgraded from hard constraints to heuristics
- Tier 1 severity: "always replace" changed to "replace by default, allow exceptions"
- Tier 3 severity: unified to length-normalized density thresholds
- Positive guidance: removed "allow tangents and half-formed thoughts", replaced with "allow casual tone without sacrificing completeness"
- Two-pass workflow now only enforced in aggressive mode

### Fixed
- Severity rules inconsistency between percentage-based and count-based thresholds
- Misfire protection now checked before Tier 1 replacement in decision flow

## [1.0.0] - 2026-03-23

### Added
- Initial release
- 10 core rules for AI writing pattern removal
- Bilingual banned phrase lists (Chinese 140+ entries, English 130+ entries)
- Chinese internet jargon coverage (赋能/闭环/抓手/etc.)
- Translation artifact detection (翻译腔)
- 13 cross-language structural anti-patterns
- 3-tier severity system with misfire protection
- 5-dimension self-evaluation scoring matrix
- Before/after examples in Chinese and English
- Two-pass workflow (rewrite + audit)
