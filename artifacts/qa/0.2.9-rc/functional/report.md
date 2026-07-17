# WorkWise 0.2.9 RC 功能与可靠性复测报告（最终轮）

测试角色：软件测评 / 可靠性 QA  
测试日期：2026-07-17（Asia/Shanghai）  
候选应用：`/Users/wangjiawei/Documents/WORKGPT-menu-localization/dist/mac-arm64/WorkWise.app`  
隔离 profile：`/tmp/workwise-qa/functional`

## 结论

**通过。** 在当前重建候选包中，功能与可靠性专项未发现剩余发布阻断项：Code 和 PPTX 均有真实成果文件与成果卡；成果卡入口已恢复；12 个真实会话可连续切换且没有 SSE 上限、重复完成事件或悬挂线程；运行中停止后 Turn 以 `aborted` 唯一终态落盘，输入与发送能力可以继续使用。

本结论仅覆盖本报告列出的功能与可靠性场景。正式发布仍应以产品、前端、现场角色及总发布门禁的合并结论为准。

## 测试结果

| 用例 | 结果 | 关键证据 |
|---|---|---|
| A. Code 文件生成与成果卡 | 通过 | `qa-deliverable.md` 真实生成，450 字节；成果卡显示文件名和大小；“另存为”打开系统保存面板，“显示位置”在 Finder 选中正确文件 |
| B. 12 个真实会话连续切换 | 通过 | Code 交付会话 + “会话测试02–12”共 12 个；全部 `idle`；每个会话只有一次 `turn_completed`；界面和日志均无 SSE 上限错误 |
| C. 运行中停止与恢复 | 通过 | 任务启动后在约 33 ms 点击“停止”；Turn 唯一终态为 `aborted`；线程恢复 `idle`；输入框可编辑，输入后发送按钮可用 |
| D. PPT Master 真实 `.pptx` 交付 | 通过 | `WorkWise-候选版质量复测.pptx`，39,370 字节，OOXML 解压校验通过，恰好 5 页；成果卡 MIME/大小正确 |
| E. 成果卡三个入口 | 通过 | `design_spec.md`、`spec_lock.md` 和 PPTX 共 9 个入口全部真实点击；另存副本与源文件 SHA-256 完全一致，Finder 选中正确文件，Cursor 打开正确路径（PPTX 明确显示“不支持二进制文件”而不是按钮无响应） |
| F. 日志与终态一致性 | 通过 | 当前启动使用 `[runtime]`、`WORKWISE_RUNTIME_READY` 和 “WorkWise Runtime”；无 SSE limit、remote method、未捕获异常；所有线程最终 `idle` |

## 详细证据

### A. Code 成果交付

- 通过真实界面提交创建 `qa-deliverable.md` 的任务。
- 文件真实生成于隔离工作区，大小 450 字节，标题和验证说明完整。
- 对应线程 `thr_2cmikbeg` 最终为 `idle`，Turn 只有一次 `turn_completed`。
- 成果卡显示 `qa-deliverable.md`、450 B，以及“另存为 / 在编辑器中打开 / 显示位置”。
- “另存为”成功打开系统保存面板；为避免产生无关副本，测试在保存前取消。
- “显示位置”成功打开 Finder 并选中 `qa-deliverable.md`。

### B. 12 会话与 SSE

- 创建并真实完成“会话测试02”至“会话测试12”共 11 个短会话，加上 Code 交付会话，共 12 个有效 Code 会话。
- 所有短会话的 SQLite 状态均为 `idle`、`message_count=3`。
- 逐个切换 12 个会话；每次都能加载输入框，短会话中只有一条用户消息和一条助手回复。
- 每个被测会话的事件文件均恰好包含一次 `turn_completed`，没有重复完成事件。
- 切换期间界面没有出现 `The window SSE connection limit has been reached`、`runtime:sse:start` 或 `Error invoking remote method`。
- 当前日志中相关错误匹配数为 0，测试结束时非 `idle` 线程数为 0。

### C. 取消与恢复

- 新建会话并发送长任务，在界面显示“运行中”后点击“停止”。
- 停止按钮消失，输入框保持可编辑；输入“恢复输入验证”后发送按钮立即可用，清空后恢复正常“向智能体提问…”占位文案。
- 线程 `thr_fg8kba86` 最终状态为 `idle`。
- metadata 中 Turn `turn_82b1rzux` 的唯一终态为 `aborted`，并写入 `finishedAt`。
- events 中只有一次 `turn_aborted`，没有 `turn_completed` 或重复终态；没有遗留模型输出或后台运行状态。

### D. PPTX 与成果卡

- 写作助手调用 PPT 工作流，生成 `WorkWise-候选版质量复测.pptx`。
- 文件大小 39,370 字节；`unzip -t` 无错误；`ppt/slides/slideN.xml` 数量为 5。
- 成果卡显示 PowerPoint MIME、约 38 KB 以及三个成果入口。
- 早期候选中 PPTX “另存为 / 显示位置”曾失败，证据保留在 `06-pptx-save-as-failed.png`；当前重建候选已由同一隔离 profile 的真实界面复测确认修复，旧结果不再构成当前阻断。

### E. 当前启动日志

- 当前启动时段使用 `[runtime]` 日志分类与 `WORKWISE_RUNTIME_READY`。
- ready 消息显示 `WorkWise Runtime listening on http://127.0.0.1:8911`。
- 同一日志文件包含更早候选包的历史旧前缀记录；本报告只按当前候选启动时段判断。
- 当前测试路径没有 SSE limit、remote method、未捕获异常或崩溃记录。

### F. 三个成果文件的逐按钮验收

- 对 `design_spec.md`、`spec_lock.md`、`WorkWise-候选版质量复测.pptx` 的“另存为 / 在编辑器中打开 / 显示位置”逐一真实点击，共 9 次操作。
- 三个文件均通过系统保存面板另存到隔离目录 `/tmp/workwise-qa/artifact-actions.83qHEV`，保存副本与源文件逐字节一致：
  - `design_spec.md`: `a70d4d991f7aac4f7b0efa423215a727b7506c8ee1665f9634df96cb633b9d13`
  - `spec_lock.md`: `ec2be70a8e24de2c2a6e108e8b663f03bcb45349c123eba67be6f34dfc20d807`
  - `WorkWise-候选版质量复测.pptx`: `d50a14ceedfd3a3aeec1b00728993ad9101ed2d2e7694046913b2b41ee2abe1c`
- 另存后的 PPTX 再次执行 OOXML 解压校验，无错误。
- “显示位置”分别在 Finder 选中两个 Markdown 文件和 PPTX 本体，没有定位到错误工作区或同名文件。
- “在编辑器中打开”分别在 Cursor 打开三个准确的绝对路径；PPTX 标签页显示 `Binary file is not supported`，说明交接动作已完成，剩余行为由外部编辑器能力决定。
- 点击过程中 WorkWise 未出现 `path escapes the workspace root`、桥接不可用或静默失败；当前日志也没有成果操作错误。

## 截图索引

- `04-workspace-restored.png`：Code 工作目录与输入恢复。
- `05-pptx-deliverable-card.png`：真实 PPTX 成果卡。
- `06-pptx-save-as-failed.png`：修复前失败证据，仅作回归历史保留。
- `07-code-deliverable-card.png`：Code 成果卡。
- `08-twelve-sessions-no-sse.png`：12 会话切换后的界面证据，无 SSE 错误横幅。
- `09-cancel-recovered.png`：取消后的正常输入状态。

## 发布建议

功能与可靠性专项可以放行。合并其他角色测试时，应继续保留以下发布门禁：

1. 使用当前重建候选包，不得回退到 `06-pptx-save-as-failed.png` 对应的旧包。
2. 发布前再次运行自动化测试、类型检查、生产构建和三平台安装包校验。
3. 对 GitHub Release 只发布约定的三个客户端安装包，并在实际安装版上做一次升级、启动和成果卡抽查。
