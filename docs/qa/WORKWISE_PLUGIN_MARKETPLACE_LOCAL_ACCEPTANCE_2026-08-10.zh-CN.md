# WorkWise 插件市场本地候选验收记录（2026-08-10）

## 结论

- 本轮只完成本地 macOS arm64 候选包验收，没有创建提交、标签、Release，也没有修改 stable/frontier、官网或公开下载入口。
- 用户已明确确认以 `0.4.1` 修复错误 `0.4.0`；本记录中的公开发布仍以签名候选和真实更新闭环通过为前提。
- 插件市场已改为分类优先，只在默认推荐页展示 11 个具有独立产品能力的条目。
- 本机 200 个 Skill 只建立索引，不进入推荐插件目录，也不会默认平铺 200 行。
- 当前仍不满足发布门禁：本机候选包仅为 ad-hoc 签名、未公证，真实 `0.4.0 -> 私有 0.4.1 候选` 应用内更新闭环和三平台安装验收尚未完成。

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

- 实测索引总数：200。
- 默认页只显示分组统计：WorkWise 50、个人 29、项目 0、Codex 插件来源 121、需关注 0。
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
- 深色主题、浅色主题、1280x840 和 900x700 窗口均完成截图检查，未发现文本或按钮重叠。

本地截图证据：

- `/private/tmp/workwise-marketplace-final-dark-1280.png`
- `/private/tmp/workwise-marketplace-final-narrow.png`
- `/private/tmp/workwise-marketplace-final-light-narrow.png`
- `/private/tmp/workwise-playwright-details-light-narrow.png`
- `/private/tmp/workwise-skills-shuorenhua-light.png`
- `/private/tmp/workwise-marketplace-p0-p2-final-zh-cn.png`（重新编译后的候选包，中文精选市场）
- `/private/tmp/workwise-marketplace-p0-p2-filter-final-zh-cn.png`（重新编译后的候选包，中文筛选面板）
- `/private/tmp/workwise-marketplace-p0-p2-details-final-zh-cn.png`（重新编译后的候选包，中文权限审查详情）
- `/private/tmp/workwise-skills-p0-p2-final-zh-cn.png`（重新编译后的候选包，中文本地 Skill 分类边界）

## 应用内更新状态

- 应用内更新能力不是不可实现；正式 macOS 安装包在 Apple Developer ID 签名和公证均启用时，允许执行应用内下载、安装和自动重启。
- 本轮本地候选包只有 ad-hoc 签名且未公证，更新安全门禁按设计返回“无法检查更新”，不会用打开官网伪装成应用内升级。
- 最终中文界面已经明确展示签名阻断原因，并将“检查更新”和用户主动触发的“打开下载页”分成两个动作。
- 真实 `0.4.0 -> 私有签名 0.4.1 候选` 下载、退出安装、自动重启和数据保留闭环仍未执行，因此应用内更新尚不能签字交付。

## 自动化与产物校验

- TypeScript：通过。
- ESLint：通过。
- Vitest：246 个测试文件通过、2 个跳过；1767 项测试通过、2 项跳过。
- 生产构建：通过。
- ASAR：19992 个文件可读，454 个编译文件与生产输出一致。
- DMG：`hdiutil verify` 通过。
- macOS arm64 DMG SHA-256：`1ea1222de6c7707d4fd7f3eef4f46f0cfbaf091cc181bf86d6f401620874b168`。
- macOS arm64 ZIP SHA-256：`9619c7cf69ee6c957266774e2d9468227b04b656fc6496e1cd96113a27b31bc0`（`WorkWise-0.4.0-mac-arm64-p0-p2-final.zip`）。
- 签名：ad-hoc；未公证，只允许本机候选验收。

## 发布阻断项

1. 用户尚未确认界面、功能和准确正式版本号。
2. Apple Developer ID 签名、公证和 stapling 尚未用于本轮最终候选。
3. 真实 `0.4.0 -> 私有 0.4.1 候选` 应用内下载、退出安装、自动重启和数据保留闭环尚未完成。
4. macOS x64 与 Windows x64 最终候选尚未完成同等安装和截图验收。
5. 候选包未执行公开发布，不能推广到 stable、官网或 GitHub Release。
