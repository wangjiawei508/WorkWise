# WorkWise 0.4.1 候选验收记录（更新于 2026-08-11）

## 结论

- 已安装并截图验收的签名候选产物来自 `0.4.1` 候选提交 `66562c8`；当前候选分支已同步最新 `origin/main`，HEAD 为 `2f63604`。两者都不构成正式发布批准。
- 未创建 `v0.4.1` 标签或 GitHub Release，未将 `0.4.1` 推广到 stable，未将它更新到官网正式下载入口。
- 2026-08-11 已经用户确认执行 stable 回滚：R2、官网 stable 指针和 GitHub Latest 均已恢复为 `v0.3.5`，三份公开清单均已独立验证为 `0.3.5`。
- `v0.4.0` 标签、Release 和安装资产保留供审计；Release 已标记“已撤回”和 prerelease，不再是 Latest，也不向已安装 `0.4.0` 的用户自动降级。
- GitHub Actions 已生成签名、公证候选，并在 macOS arm64、macOS x64、Windows x64 上完成真实 `0.3.5 -> 私有 0.4.1` 应用内更新闭环。
- 本机已启动同一 CI Apple Silicon 签名候选，确认中文启动页、中文主界面、精选插件市场、详情抽屉、独立 Skill 索引页和运行时连接。
- 插件市场只展示 11 个精选插件，并按独立用户能力分类；本机 204 个 Skill 只建立索引，不进入精选插件目录，也不会默认平铺 204 行。
- 应用内升级链路已经可用，但更新清单服务器仍返回七天缓存响应头；应用通过唯一查询参数和 `no-cache` 请求头绕过陈旧缓存，基础设施缓存门禁仍未完全关闭。

## 首发推荐目录

| 分类 | 推荐项 | 独立能力 |
| --- | --- | --- |
| 开发与代码 | GitHub MCP | 官方远程 GitHub 仓库、Issue 和 PR 能力 |
| 浏览器自动化 | Playwright MCP | 浏览器页面自动化与检查 |
| Agent 工作流 | Superpowers | 独立的软件开发工作流 Skill 集 |
| 知识与检索 | Context7 | 查询当前版本的开发库文档 |
| 数据与数据库 | DBHub | 多数据库 MCP 接入与权限审查 |
| 图表与可视化 | AntV Chart MCP | 生成结构化数据图表 |
| 文档与办公 | MarkItDown、OfficeCLI | 文档解析转换与办公文档创作分别展示 |
| 协作 | Lark CLI | 飞书文档和协作能力 |
| 系统工具 | Schedule、Filesystem MCP | 定时任务与显式授权的文件系统访问 |

下列项目保留在目录元数据或兼容层中，但不进入默认推荐：Playwright CLI + Skills、AntV Chart Skill、Memory MCP、Sequential Thinking、Ego Browser、Docling 及其他高级或暂不可用项目。这样可以保留迁移和兼容信息，同时避免重复能力占据首发推荐位。

## 本地 Skills

- 实测索引总数：204。
- 默认页只显示分组统计：WorkWise 40、个人 29、项目 14、Codex 插件来源 121、需处理 2。
- 只有执行搜索或主动选择分组后才显示 Skill 行，单次结果最多 50 条。
- 实测搜索 `shuorenhua` 返回 1 条健康结果，来源和手动更新状态可见。
- 实测索引仍包含：`bidding-knowledge`、`construction-monitoring`、`monitoring-design`、`di-bao-monitoring`、`operational-monitoring`、`data-analysis`、`docx-generation`、`report-writing`、`ppt-master`、`humanizer`、`shuorenhua`。

## 界面验收

- 左侧栏保持实色高对比背景；侧栏与工作区之间不再绘制亮线或宽沟槽。
- 分隔控件视觉宽度为 1px 且透明，9px 透明命中区继续支持拖拽调整宽度。
- 默认页显示 11 个精选插件，并按用户任务分类分组；技术实现方式只在条目和详情中展示，状态筛选保留推荐、已安装、更新和需配置。
- “插件”和“技能”是两个平级入口；本地 Skill 数量与来源统计只在独立技能页显示，不进入精选插件列表。
- 官方、个人、团队目录范围切换与筛选抽屉可用；默认官方目录只显示受限的精选条目。
- Playwright 详情抽屉实测展示版本、已验证发布者、Apache-2.0 许可证、来源、固定更新策略、浏览器控制权限、Node 依赖和健康状态。
- 当前 CI 签名候选已完成 1171x768 浅色中文界面截图检查，未发现文本或按钮重叠。
- 深色主题与窄窗口已有同一代码基线的本地截图记录；最终正式安装包仍需在发布前复核。

CI 签名候选截图证据：

- `/private/tmp/workwise-review-0.4.1/screenshots/00-splash-zh.png`（中文启动页）
- `/private/tmp/workwise-review-0.4.1/screenshots/01-main-zh.png`（中文主界面）
- `/private/tmp/workwise-review-0.4.1/screenshots/02-plugins-zh.png`（11 个精选插件和任务分类）
- `/private/tmp/workwise-review-0.4.1/screenshots/03-plugin-detail-zh.png`（权限、许可证、来源与健康状态详情）
- `/private/tmp/workwise-review-0.4.1/screenshots/04-skills-zh.png`（204 个 Skill 的独立索引边界）
- `/private/tmp/workwise-review-0.4.1/screenshots/05-runtime-chat-zh.png`（运行时恢复、输入框与智能体选择器启用）

## 应用内更新状态

- CI Run：`31437775903`。
- macOS arm64、macOS x64、Windows x64 三个平台的原生更新任务均通过。
- 三个平台均记录 `target_relaunched`、版本 `0.4.1`、`user_data_preserved`、`userDataPreserved: true` 和 `browserOpened: false`。
- 更新失败继续区分未签名构建、清单、网络、签名、下载和安装错误；不会自动打开官网伪装成应用内升级。
- CI 总任务仍为失败，因为服务器返回 `Cache-Control: max-age=604800, public, max-age=604800`，未达到更新清单短缓存门禁。
- Electron 更新请求会追加唯一 `noCache` 查询参数，WorkWise 同时发送 `Cache-Control: no-cache` 和 `Pragma: no-cache`，所以三平台真实升级成功；这不等于服务器缓存配置已经修好。

## 自动化与产物校验

- 同步最新 `origin/main` 后，TypeScript、ESLint 和生产构建均通过；Vitest 为 247 个测试文件通过、2 个跳过，1781 项测试通过、2 项跳过。
- 当前分支提交 `2f63604` 的 GitHub Actions Quality 门禁通过：Run `31450396008`。
- stable 回滚工作流通过：Run `31450414453`；工作流使用精确确认口令，未重新构建或发布 Release。
- 候选提交的生产构建和打包检查已通过。
- macOS arm64 候选 ZIP：`WorkWise-0.4.1-mac-arm64.zip`。
- ZIP SHA-256：`fc93581adb45067a64a46479b06ccf973bf062e7d387d00f7b3e826f640f50a3`；大小 `298290871` 字节。
- ZIP 的 SHA-512 和大小与 `latest-mac.yml` 一致，压缩包完整性通过。
- CI 对同一 ZIP 的校验结果为 `valid on disk`、`satisfies its Designated Requirement`、`source=Notarized Developer ID`，`stapler validate` 通过。
- 本机系统安全评估环境对候选包和已安装 `0.4.0` 返回相同的 Authority unavailable 结果，因此以 CI 公证校验和真实安装更新结果作为签名证据，并保留该本机异常为残余风险。

## 已解除事项

1. 公开 stable 已从错误的 `0.4.0` 回滚至 `v0.3.5`，GitHub Latest 与三份 stable 清单已核对一致。
2. `v0.4.0` 已标记撤回且不再是 Latest，同时保留原标签、Release 说明和安装资产供审计。
3. 候选分支已同步最新 `origin/main`，并在提交 `2f63604` 上通过 Quality CI。

## 发布阻断项

1. 用户尚未对最终待发布安装包的界面、功能、准确版本号和具体发布动作给出最终批准。本次对 stable 回滚、`v0.4.0` 撤回和继续候选开发的确认，不等同于批准发布 `v0.4.1`。
2. 更新清单服务器仍返回七天缓存响应头；需要服务器管理员或控制面板权限修复，当前部署账户无权安全修改 Nginx/OpenResty 配置。
3. macOS x64 与 Windows x64 已完成原生更新闭环，但发布前仍需确认是否接受以自动化安装证据替代两平台人工截图。
4. 正式发布前还需要基于最终提交重建待发布产物，执行最终安装、截图和门禁，确认产物与已验收代码一致。
