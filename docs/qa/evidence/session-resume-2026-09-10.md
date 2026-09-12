# 0.5.0 候选验收接续记录

时间：2026-09-10，Asia/Shanghai。

从任务 `01a06c10-ddd5-7a63-bbfc-264d300c0098` 接续到
`01a08b14-4c73-75b3-b330-66fed960c67b`。原任务仍返回会话级 403；本记录以
当前工作树和实测结果为准，不把旧会话的“已通过”直接视为本轮结果。

## 插播功能：DeepSeek-V4.1-Flash 默认模型

按用户新要求将桌面与 Runtime 默认设为官方 API ID `deepseek-flash`，同步视觉、思考
回传、模型选择和新 ID 费用估算，并保留显式模型及旧配置。详见
[变更与迁移矩阵](../DEEPSEEK_V41_FLASH_DEFAULT_2026-09-10.md)。本轮桌面端 2,440 项、
Runtime 1,586 项通过。以下已安装候选不包含这次源码更新，最终打包验收须重建候选。
原 Task 15、29、36 的剩余验收继续保留，未提升任何公共发布状态。

## 最新接续结果：候选 912e4d30b065

本页下方是本次累计高程修复前的历史检查记录。最新结果以
[安装包与双 P0 证据](survey-candidate-912e4d30b065/README.md) 为准：

- 修复 GSI WI83 累计高程误作相邻高差；解析器升至 0.4.0；缺初始化阻断，历史成果保留但旧语义禁止新算/新交付。
- 从当前源码独立快照生成私有 0.5.0 DMG，已从 DMG 安装到独立目录；ASAR 18,364 文件和 461 编译文件校验通过。
- 同一已安装包中的 COSA IN2 与 GSI 均完成真实输入、平差和 DOCX/PDF/XLSX/manifest 内容校验。
- COSA 33 点 OU2 比较 0 不匹配；GSI 独立 NumPy 计算最大高程差 0.020316 mm，精度范围内 0 不匹配，但 GSI→既有 IN1 的 7 段打印精度差异仍需复核。
- 最新 Runtime 1,577 通过/3 跳过，桌面端 2,438 通过/2 跳过；typecheck、lint（既有 1 warning）、build、新鲜度与 OpenSpec strict 通过。
- 包仍为 adhoc、未公证；真实私有 updater 往返和完整 GUI/用户确认未完成。Task 15、29、36 仍保持未勾选。

## 本轮改动

- 将两项依赖移动硬盘的 GSI 测试改为通过 `WORKWISE_TEST_GSI_SOURCE` 显式启用。
  默认测试不访问本机工程资料；显式给出不存在或不匹配的文件时测试失败，不静默跳过。
- 将临时测试命名为 `survey-leica-gsi-known-evidence.test.ts`；两个测试均固定原件
  SHA-256 `ed5c0a3343829bbfbc4fb8631e84af1157a1e24f5f200aba2702e02695b6512c`，
  防止把这一工程的已知点和断言误用于另一份 GSI。
- 删除测试的完整点位/高程控制台输出，测试结束时关闭 SQLite 并清理该测试自己创建的
  临时目录；源文件只读访问。
- 同步 professional fixture manifest 测试中两份 M5 golden 的导入处置预期：现有
  registry、native golden、catalog 及真实 M5 记录已支持进入策略校验，旧 manifest
  测试仍预期 `archive-only`，导致 4 项失败。负向夹具和缺基准等策略门禁继续执行。

## 实测

| 检查 | 结果 |
| --- | --- |
| GSI 合成语义/词法/单位回归 | 3 文件，86 项通过 |
| 显式启用真实 GSI 本机验收 | 2 文件，2 项通过 |
| Runtime 全量 | 136 文件通过，2 文件跳过；1574 项通过，3 项跳过 |
| 桌面端全量，允许本机回环监听 | 304 文件通过，2 文件跳过；2438 项通过，2 项跳过 |
| 根项目与 Runtime typecheck | 通过 |
| Lint | 0 error；保留 Workbench.tsx:1402 的 1 条既有 Hook warning |
| 生产构建与新鲜度 | 通过；957 个生产输入 |
| OpenSpec strict | 11/11 通过 |
| git diff --check | 通过 |

初次全量测试使用了 Electron 打包留下的 SQLite ABI 148，而宿主 Node 使用 ABI 147。
执行本地 `npm rebuild better-sqlite3 --build-from-source` 后复测通过。桌面端测试还需
允许临时 `127.0.0.1` 监听；沙箱的 `listen EPERM` 未被记作通过。没有重签、重打包或
改动已有候选包。

本机 GSI 命令（`WORKWISE_TEST_GSI_SOURCE` 指向既有
`real-gsi-service-run-2026-09-10.md` 中的原始 GSI，不是任意文件）：

```sh
WORKWISE_TEST_GSI_SOURCE='/absolute/path/to/the/documented-source.GSI' \
  npm --prefix kun test -- \
  src/engineering/survey-leica-gsi-real-source.test.ts \
  src/engineering/survey-leica-gsi-known-evidence.test.ts
```

## 当前验收缺口

- GSI 最新解析为 198 条记录、36 条观测、9 个 WI41 块、18 个局部转点，0 条阻断解析诊断。
  已知点表含 `LYRB800`，源观测含 `LYRB850`；本轮确认仍保留两个不同点名，并以
  `rank_deficient`、`needs_attention` / `invalid` 阻断。不能将两项测试通过写成 GSI
  生产平差通过。已请求用户核实点名或提供完整的已知点配套资料。
- 已有 Trimble/Zeiss M5 真实交付证据见 `real-m5-production-2026-09-10/README.md`
  与 `result.json`：148 条观测、78 点、74 个 OU1 参考点匹配。这是前一任务留下的
  隔离 Runtime 证据，本轮核对记录但未重新执行 M5 真实交付。M5 属执行计划第二批，
  不能替代第一批 P0 GSI/South DAT 的验收。
- 本轮 Computer Use 列出既有 `WorkWise Candidate c1dcc2f79f6c`，但读取其窗口返回
  `timeoutReached (-10005)`；浏览器能力同时报告 `Codex auth token is unavailable`。
  本轮没有取得可评审截图，不能据此判断候选 GUI 通过，也不能把工具超时归因于应用崩溃。
- Task 15、29、36 继续未完成（33/36）。仍需同一最终候选的安装、可见界面/主题/窄窗口/
  功能验收、签名/公证记录、真实私有 updater 往返及用户对精确版本的确认。

本轮未执行公共版本修改、tag、GitHub Release、稳定渠道提升或下载页更新。
