# WorkWise 最终候选包一线工程师 UI 验收

- 角色：工程监测现场工程师 / 普通员工
- 候选包：`dist/mac-arm64/WorkWise.app`
- 测试用户数据：`/tmp/workwise-qa/functional`
- 日期：2026-07-17（Asia/Shanghai）
- 总结：**不通过，存在 P1 发布阻断项。**

## 1. RailWise KB 查询

### 步骤

1. 复用现有 `qa-ppt-source.md` 写作助手会话。
2. 输入：要求列出 RailWise 官方知识库公开内容分类、真实条目和 `kb.railwise.cn` 来源链接，并禁止读取本地文件或输出内部路径。
3. 等待回答结束并检查引用。

### 结果

- 通过核心验收：界面注入 `static` 检索结果，明确显示 **286 条公开内容、17 个分类**。
- 回答没有声称知识库为空。
- 回答给出真实公开条目和链接，包括：
  - WorkWise Skills 与模板
  - AGENTS.md 与 AI Agent 使用规则
  - 深基坑监测项目案例
  - AI异常检测与预警工具
  - RAILWISE-CLI AI多智能体系统概述
  - RailWise 工程知识库入口
- 本轮回答未输出测试机内部绝对路径。
- 非阻断偏差：用户要求“每类至少一个条目”，回答仅对 5 个分类给出具体条目，其余分类如实说明本次检索未展开；未编造链接。

### 证据

- `04-railwise-kb-answer.png`
- `05-railwise-kb-links.png`
- `06-railwise-case-links.png`

## 2. 简短工程任务与完成状态

### 步骤

1. 基于“深基坑监测项目案例”和“AI异常检测与预警工具”要求生成最多 6 项现场巡检清单。
2. 明确要求不生成文件、不调用工具、不追问，并以“任务已完成”收尾。

### 结果

- UI 在约 22 秒内生成了 6 项巡检清单，内容包括监测点完损、自动化设备、支撑轴力、周边环境、水位渗漏和数据审核；处理中没有出现暂停按钮或要求用户手动继续。
- **但该 Turn 的持久化终态实际为 `turn_failed`，不能判定任务成功。**
- **P1 阻断：同一份巡检清单在消息区重复渲染两遍；底部再次出现两个“任务已完成”。** 这是三个不同的持久化 `assistant_text` item，不是单纯的 AX 重复或截图重影。
- 第三个 reasoning item 已明确识别“the system seems to have doubled the content”，随后只输出“任务已完成”，但完成守卫仍以 `incomplete_deliverable` 将 Turn 标为失败。

### 线程、Turn 与事件证据

- Thread ID：`thr_1wlden1e`
- Turn ID：`turn_wjq55ol8`
- 开始：事件 seq `7133`，`2026-07-16T22:38:18.447Z`（上海时间 2026-07-17 06:38:18.447）
- 失败：事件 seq `8696`，`2026-07-16T22:38:39.937Z`（上海时间 2026-07-17 06:38:39.937）
- 失败原因：`incomplete_deliverable`，消息为 `Task stopped without producing the file deliverable requested by the user.`
- 该错误与用户明确的“不要生成文件”相冲突，说明交付完成守卫错误继承或误判了文件交付要求。
- `messages.jsonl` 中该 Turn 共 8 个 item：
  - `user_message` × 1
  - `assistant_reasoning` × 3
  - `assistant_text` × 3
  - `error` × 1
- 三个 `assistant_text` item：
  - `item_text_21xtf1pi`：完整 6 项清单 + “任务已完成”
  - `item_text_9fvr04zd`：再次输出同一完整 6 项清单 + “任务已完成”
  - `item_text_17plbqhl`：单独输出“任务已完成”
- `events.jsonl` 中该 Turn 包含：
  - `item_created` × 8
  - `assistant_text_delta` × 899
  - `assistant_reasoning_delta` × 622
  - `turn_started` × 1
  - `turn_failed` × 1
  - `error` × 1
- 流水线发生 3 个模型步骤（`stepIndex` 0、1、2）；每一步 `response_received.stopReason` 都是 `stop` 且 `toolCallCount=0`，但系统仍继续下一步，最终报错。这直接解释了重复输出。

### 证据

- `02-field-checklist-complete.png`：截图底部可直接看到重复的“任务已完成”。
- AX 树同时出现两套完全相同的 6 行表格，之后又有单独的完成文本。
- 截图前基线 `01-existing-ppt-delivery.png`：文件修改时间 2026-07-17 06:36:05 CST。
- 重复输出截图 `02-field-checklist-complete.png`：文件修改时间 2026-07-17 06:39:09 CST；位于 `turn_failed` 后约 29 秒，界面仍展示为已完成文本。

## 3. 成果文件卡

复用已经由 PPT Master 生成的成果卡：`WorkWise-候选版质量复测.pptx`，界面显示 PPTX MIME 类型和 38 KB 大小。

### 另存为

- 通过：点击后打开 macOS 原生保存面板。
- 文件名正确预填为 `WorkWise-候选版质量复测.pptx`。
- 格式显示为 `PPTX file`。
- 本轮只验证对话框，随后取消，没有写入新文件。
- 证据：`03-ppt-save-as-dialog.png`。

### 显示位置

- 按钮可点击，没有出现错误提示。
- WorkWise 内没有成功提示；由于测试要求只操作候选包，本轮没有继续操作 Finder。

### 在编辑器中打开

- **P2：按钮可点击，但对 PPTX 点击后 WorkWise 无任何状态变化、成功提示或失败提示，也未观察到新的 PowerPoint/Keynote/LibreOffice 进程。**
- 普通员工无法判断是已经打开、正在打开，还是系统没有可用编辑器。
- 建议：成功时显示目标应用；失败时明确提示“没有找到可打开 PPTX 的应用”，并保留“另存为”和“显示位置”。

### 证据

- `01-existing-ppt-delivery.png`：PPTX 成果卡及三个按钮。
- `03-ppt-save-as-dialog.png`：另存为面板。

## 4. 测试隔离边界

### P1：候选 runtime 仍访问真实 Codex 主目录

- 候选主进程确实使用 `--user-data-dir=/tmp/workwise-qa/functional`，runtime 数据目录也在 `/tmp`。
- 预期隔离路径：`/tmp/workwise-qa/functional/home/.codex`。同一日志第 1、21 行的早期隔离启动确实使用该路径。
- 实际当前启动：同一日志第 119 行（UTC `2026-07-16T22:20:27.734Z`）记录 bundled agent pack 位于 `/Users/wangjiawei/.codex`；第 120 行虽显示 runtime data dir 为 `/tmp/workwise-qa/functional/runtime`，但 Agent/Codex home 已逸出隔离根。
- 这说明 Electron userData 隔离没有同时隔离 Agent/Codex home；本轮要求“不碰真实用户数据”无法得到保证。
- 该问题既是测试环境阻断，也暴露候选包在多 profile/隔离验收时的路径边界不完整。

## 严重级别与发布判定

| 级别 | 问题 | 发布判定 |
|---|---|---|
| P1 | 完成守卫误判文件交付，产生 3 个模型步骤、重复正文并最终 `turn_failed` | 阻断 |
| P1 | 隔离 profile 仍访问真实 `~/.codex` | 阻断 |
| P2 | PPTX“在编辑器中打开”无成功/失败反馈 | 建议修复并复测 |
| P3 | 知识库分类回答未为全部 17 类各给一个条目 | 不阻断 |

**最终结论：当前候选包不能发布。** 修复 P1 后，应使用全新隔离 profile 重新执行同一短任务至少 3 次，确认每个 Turn 只出现一份回答和一个终态，并验证 runtime 的 HOME/CODEX_HOME 不指向真实用户目录。
