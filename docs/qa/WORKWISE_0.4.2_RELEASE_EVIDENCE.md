# WorkWise 0.4.2 发布证据

记录日期：2026-08-27（Asia/Shanghai）

## 候选身份与隔离

- 发布候选 PR：[WorkWise #26](https://github.com/wangjiawei508/WorkWise/pull/26)。
- 当前 PR 头提交：`89a68a006a47deb9cd280064c2ff0441240c52e2`。
- 应用版本：`0.4.2`；本地候选的 `CFBundleShortVersionString` 与 `CFBundleVersion` 均为 `0.4.2`。
- 本地验收包：`${HOME}/Library/Application Support/WorkWise-Candidate/package-0.4.2-f493e8d/mac-arm64/WorkWise.app`。
- 候选包使用独立存储和独立用户数据，不读取或改写正式安装版数据。
- 本地候选提交 `f493e8d1e43518035873e9877306a5c307fd79b7` 到当前 PR 头之间仅新增 `src/main/release-delivery.test.ts` 的发布回归测试，生产代码没有变化。

## 自动化门禁

- Desktop：`2340 passed`，`2 skipped`。
- Runtime：`784 passed`。
- TypeScript、ESLint、生产构建、OpenSpec、品牌边界和许可证检查通过。
- PR 当前头的 GitHub 检查全部通过：[CI #33029947599](https://github.com/wangjiawei508/WorkWise/actions/runs/33029947599)。
- 两小时预发布稳定性门禁通过：[Release candidate #33028687015](https://github.com/wangjiawei508/WorkWise/actions/runs/33028687015)。
- 同一工作流中的 Windows 构建、macOS 构建和三端候选汇总均通过；`Publish GitHub Release` 按候选模式正确跳过，未产生正式 Release。

该候选工作流最初从 `f493e8d` 触发。两小时门禁期间分支增加了一个仅测试提交；最终 Windows/macOS 构建与 macOS 独立校验作业均实际检出当前 PR 头 `89a68a0`，所以最终安装工件对应当前 PR 代码。

## 原生更新回环

[Native updater #33028688594](https://github.com/wangjiawei508/WorkWise/actions/runs/33028688594) 使用隔离更新源完成 `0.4.1 -> 0.4.2` 原生更新回环：

- macOS Apple Silicon：安装基线、应用内下载、请求安装和目标版本自动拉起均通过。
- macOS Intel：安装基线、应用内下载、请求安装和目标版本自动拉起均通过。
- Windows x64：安装基线、应用内下载、请求安装和目标版本自动拉起均通过。
- `All native updater paths passed` 通过；隔离更新源随后精确清理，未改动 Stable 或 Frontier 正式指针。

该回环运行于 `f493e8d`；它与当前 PR 头之间只有测试文件差异，更新器和应用生产代码一致。

## macOS 签名与公证

权威结论来自 GitHub 托管的 `macos-26-arm64` 独立校验作业：[Verify final candidate on macOS](https://github.com/wangjiawei508/WorkWise/actions/runs/33028687015/job/98400827799)。作业实际检出 `89a68a0`，并对最终候选中的两个 DMG 分别执行签名、Gatekeeper 和 stapler 校验：

- `WorkWise-0.4.2-mac-Apple-Silicon.dmg`：`valid on disk`、`satisfies its Designated Requirement`、`accepted`、`The validate action worked!`。
- `WorkWise-0.4.2-mac-Intel.dmg`：`valid on disk`、`satisfies its Designated Requirement`、`accepted`、`The validate action worked!`。
- macOS 构建作业的 Apple 公证提交分别返回 `status: Accepted`，最终 DMG 与 ZIP 复核通过。

本机为 macOS `26.6` arm64，且 `spctl --status` 返回 `assessments disabled`。本机对 WorkWise、Chrome、飞书和 Claude 的现有签名均出现 `Authority=(unavailable)` 或错误的 stapler 路径判断；本地 WorkWise 候选当前返回 `invalid signature`。因此本机结果不能作为 Developer ID 信任结论，本文件不宣称本机签名通过，正式结论只采用上述干净 GitHub runner 的独立校验。

## 打包应用 UI 验收

候选包在浅色、深色、普通窗口和最大化窗口下完成检查：

| 主题 | 窗口 | 尺寸 | 证据 |
| --- | --- | --- | --- |
| 浅色 | 普通 | `1171 x 768` | [workwise-0.4.2-light-normal.jpg](workwise-0.4.2-light-normal.jpg) |
| 浅色 | 最大化 | `1366 x 768` | [workwise-0.4.2-light-maximized.jpg](workwise-0.4.2-light-maximized.jpg) |
| 深色 | 普通 | `1171 x 768` | [workwise-0.4.2-dark-normal.jpg](workwise-0.4.2-dark-normal.jpg) |
| 深色 | 最大化 | `1366 x 768` | [workwise-0.4.2-dark-maximized.jpg](workwise-0.4.2-dark-maximized.jpg) |

检查结果：

- 侧栏与内容区文字可读，工作区没有过度透明；两区分隔线保持细线宽度。
- 普通和最大化窗口均未发现控件、文本或输入框重叠。
- 三个可见历史会话均可点击并恢复真实消息，不再进入用量概览。
- 已确认无消息的非当前空壳线程不再显示；当前新建空会话仍保留。
- 验收完成后候选恢复为浅色普通窗口状态。

## DeepSeek 多模态与 GIF

- 使用用户授权的第三方 Provider，在隔离候选中完成真实 GIF 图片问答。
- 请求使用 `deepseek-v4-flash-vision-exp`，应用收到 GIF 后返回对画面内容的具体描述。
- 证据：[workwise-0.4.2-gif-real-answer.jpg](workwise-0.4.2-gif-real-answer.jpg)。
- JPEG、PNG、GIF、WebP 的导入、内容签名、尺寸限制、八附件上限，以及 Chat Completions、Responses、Anthropic Messages 的结构化图片传输均有自动化覆盖。
- PDF/Office 继续使用既有文档解析链；图片 Base64 不会拼入普通文本提示。
- 本轮按验收计划未重复测试微信或飞书。

## 发布状态

当前状态为“候选已准备，等待用户确认 0.4.2”。尚未执行以下公开操作：

- 未合并 PR #26。
- 未创建或移动 `v0.4.2` Git tag。
- 未创建或编辑 GitHub Release。
- 未提升 Stable 或 Frontier 正式更新源。
- 未更新官方产品下载页。

用户需基于本文件和候选界面截图，明确确认“发布 0.4.2”后，才可执行合并、标签、GitHub Release、Stable 提升和官方下载页更新。
