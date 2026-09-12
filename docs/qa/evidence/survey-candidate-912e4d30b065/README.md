# 0.5.0 候选：累计高程修复后的安装与双 P0 复测

日期：2026-09-10，Asia/Shanghai。Task 15、29、36 尚未完成。

## 候选身份与安装

- 来源：当前工作树的独立 Git 快照 `912e4d30b065a41693eeeb0827e7bc11f927dafa`。
  原工作树未提交、重置或改动公共版本；`package.json` 仍为 `0.4.2`，仅候选包版本覆盖为 `0.5.0`。
- 快照：`/private/tmp/workwise-050-final-gpdxv9f7`；`.candidate-origin.json` 保留原 HEAD 与逐文件哈希。
- DMG：`/private/tmp/workwise-050-final-gpdxv9f7/dist/WorkWise-Candidate-912e4d30b065-0.5.0-mac-arm64.dmg`。
- 实际从只读 DMG 安装至 `/private/tmp/workwise-050-acceptance-912e4d30b065/Applications/WorkWise Candidate 912e4d30b065.app`，随后卸载磁盘映像。
- 应用版本 `0.5.0`；独立 Bundle ID `com.wangjiawei508.workwise.candidate.head912e4d30b065`；Electron `43.1.1`，arm64 / ABI `148`。
- DMG SHA-256：`205104e004661b4f547fdd85cdc9cef6f1bb268bf57e732fe672d5bf4e3cec9d`。
- ASAR SHA-256：`3c8a0ef0f6f72d19997694dc06a38f6665ccb13d2caa267db3016583f69a5290`。
- 安装后 ASAR 对照快照编译输出：18,364 文件、461 编译文件通过；`codesign --verify --deep --strict` 通过。
- 签名是 **adhoc**，无 Team ID；打包日志明确跳过公证。`spctl` 返回 `accepted / override=security disabled`，这不能证明 Developer ID 信任；`stapler validate` 返回 66 / `kLSDataUnavailableErr`，没有公证成功证据。
- 更新配置为隔离占位 `https://127.0.0.1/`，不是实际验收 feed。未发布或提升任何公共渠道。

完整机器身份见 [package.json](package.json)。依赖在快照内 APFS 克隆，Electron 重建不改变原工作区 Node ABI。打包时删除了快照中一条失效的宿主 ABI 147 SQLite 符号链接；没有修改原工作区依赖或绕过打包校验。

## 本次生产修复

Leica WI83 的最终字段是累计高程。旧解析器串联相邻点，却把每个累计值直接作为相邻高差；真实资料对比曾产生约 0.36–0.49 m 的误差。本次改为相邻 WI83 累计高程相减，并要求 WI41 块首条记录具有明确的 WI83 `..18/..58` 初始化值。缺失初始化即阻断，不假定为零。

解析器升级为 `leica-gsi-leveling-block-parser@0.4.0`，保留前后累计值、词法原文和记录锚点。旧解析结果仍可读，不删除历史网络或成果；旧语义不能参与新的平差或交付，须重新导入原始文件。新增非零初始高程、返回边、缺初始化和历史结果准入回归。合成闭合路线的独立闭式预期为 `100.5998 m`。

## 安装包内真实数据闭环

以下两组均使用**已安装应用自己的 Electron 可执行文件**加载包内 Runtime，执行导入、预检、确定性平差和 DOCX/PDF/XLSX/manifest 内容校验。它们是 `packaged-runtime-not-gui-acceptance`，没有替代可见 GUI 操作。核验脚本会清理临时成果；保留的 JSON 是内容校验与哈希证据，不是人工排版复核记录。

| 项目 | COSA IN2 | Leica GSI |
| --- | --- | --- |
| 机器记录 | [cosa-in2.json](cosa-in2.json) | [gsi.json](gsi.json) |
| 观测 / 成果点 | 160 / 33 | 28 / 27 |
| 平差状态 | completed / valid | completed / valid |
| 最大点位标准差 | 0.833955 mm | 0.261350 mm |
| 独立比较 | 同源 OU2，33 点，0 不匹配 | NumPy WLS，7 未知点、6 固定点，0 精度范围不匹配 |
| 最大成果差 | 平面 0.063416 mm | 高程 0.020316 mm |
| 闭合/残差证据 | 水平残差范数 6.669815 mm；角残差范数 1.497217e-5 rad | 7 个独立环；最大高程闭合差 0.78 mm |
| DOCX / PDF / XLSX / manifest | 内容与关联来源校验通过；PDF 4 页 | 内容与关联来源校验通过；PDF 3 页 |

没有配置项目专用最大点位标准差或闭合限值，因此这些指标是实测报告值，不能自动解释为项目规范验收通过。两份 manifest 均保持 `draft`。

GSI 来源为已有真实工程的 `右线三角高程水准.GSI`，SHA-256 `05b5ecc571cb85152a4e36c4c362118b3c71e582e05cf68b5cf8feac877fdf40`；配套原有 IN1 为 `f84252fc2990157ae7c1b01bfcce09035addaeac9ad24e56459c51017ad6b21b`，已知高程为 `dfef93712de67cef4bf48016c337d12169eb430ba9a2e8e8e1fe550479cc6750`。原资料只读，点名和值未被更改。它是另一份基准完整的工程，不是把原样本 `LYRB800/LYRB850` 强行视为同一点。

独立检查器 `scripts/check-gsi-leveling-reference.py` 使用 NumPy `linalg.lstsq`、路线长度倒数权与残差协方差，不调用 WorkWise 数值内核；包含闭式解自检及无基准拒绝检查。参考 IN1 是同源既有转换文件，不使用包含其他观测的整网 OU1。

**GSI 来源差异仍需专业复核：**14 段路线端点和顺序一致，但 GSI 与 IN1 的最大高差差异为 0.02 mm、最大距离差异 0.48629 m、闭合差差异 0.01 mm；7 段超过 IN1 半个打印末位单位。精度范围比较通过，不等于转换逐项完全一致。详细结果见 [gsi-reference.json](gsi-reference.json)。包含点号/高程的中间数值 JSON 仅保存在本机临时验收目录，未复制到仓库。

复测方式（参数替换为上述哈希对应的本机原件）：

```sh
ELECTRON_RUN_AS_NODE=1 '/absolute/installed.app/Contents/MacOS/executable' \
  scripts/check-survey-production-delivery.mjs \
  --packaged-app '/absolute/installed.app' --input '/absolute/source.GSI' \
  --type leveling --known-points '/absolute/known.txt' \
  --numerical-evidence '/private/tmp/new-exclusive-numerical.json'
python3 scripts/check-gsi-leveling-reference.py \
  --actual '/private/tmp/new-exclusive-numerical.json' --source '/absolute/source.GSI' \
  --reference-in1 '/absolute/source.in1' --known-points '/absolute/known.txt'
```

## 自动化门禁与剩余人工验收

- Runtime：136 文件通过、2 文件跳过；1,577 项通过、3 项跳过。
- 桌面端：304 文件通过、2 文件跳过；2,438 项通过、2 项跳过。临时回环监听授权首次自动审批超时，重试后正常执行并通过。
- 根项目与 Runtime typecheck 通过；lint 0 error，保留 Workbench.tsx:1402 既有 Hook warning。
- 生产 build、957 输入新鲜度、OpenSpec strict 11/11 通过。

| 待验收功能 | 状态 |
| --- | --- |
| 同一安装包浅色/深色、支持窗口尺寸、可读性与键盘/a11y | 已读到精确安装路径的窗口 accessibility 树；截图和交互验收未完成 |
| Engineering 线程隔离、AI 入口/经典入口、加载/空/部分/错误/过期状态 | 待 GUI 实测 |
| GUI 中 CSV/XLSX 交付闭环及两种 P0 格式的连续操作 | 待 GUI 实测；本记录仅完成包内 Runtime 部分 |
| Developer ID 签名、公证、真实私有 updater 升级重启和用户数据保留 | 未完成；当前包不能作为已签名更新验收包 |
| 用户对精确版本 0.5.0 的安装 UI 与功能确认 | 待前述证据完整后确认 |

GitHub 仓库是公开仓库；现有 updater workflow 使用官方站点的公开 acceptance 路径，不能直接用作私有候选 feed。本机无有效签名身份；现有 GitHub Secrets 的名称可见，但未读取或导出密钥。需已授权的私有构建环境/HTTPS feed，或本机已有签名配置路径，才能继续真实签名更新验收。

## 本轮 GUI 可见性实测

`open -n` 带隔离 `candidate.env` 启动返回 0。CUA 成功定位独立 Bundle，窗口文档 URL
指向上述安装目录，显示 Survey 首页、空项目状态、Code/Survey、AI desk 和经典平差入口。
[原生可访问性摘录](gui-accessibility.txt) 保留了精确路径和所见控件。

这次 CUA 原生读取实际等待 1,725.6 秒才返回（请求超时参数为 30 秒）；此前浏览器能力
仍报告 `Codex auth token is unavailable`。没有取得截图，不将 accessibility 文字
替代深浅主题、窗口尺寸和实际点击验收。界面 AI 输入显示 Runtime 未连接并禁用发送，
但候选日志记录隔离 Runtime 已 ready；渲染端连接与凭据状态尚未验证，不能仅凭进程 ready
宣称 AI 工作流可用。
