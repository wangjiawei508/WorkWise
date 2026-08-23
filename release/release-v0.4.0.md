# WorkWise 0.4.0

0.4.0 将原有分散的 MCP、Skill 和 CLI 入口升级为统一插件市场，并补齐可验证安装、在线目录同步、Codex 插件兼容和跨平台原生玻璃界面。

## 关键变更

- 新增统一插件市场，支持推荐、已安装、可更新、需配置、分类和来源筛选，以及版本、许可证、权限、认证、依赖、健康状态和回滚信息审查。
- 支持 WorkWise `.wwx`、Codex `.codex-plugin`、标准 `.mcpb`、Codex marketplace 和 MCP Registry 目录；第三方目录默认只通知更新，不静默执行新内容。
- MCP 安装统一写入 V2 配置，令牌进入系统安全存储；GitHub Skill 固定不可变 commit，npm、PyPI 和 Release 记录精确版本与完整性摘要。
- 新增原子 staging、路径/链接/ZIP 炸弹检查、许可证证据、SHA-256 校验、单版本回滚和权限扩张重新审查；安装、权限更新和回滚的 MCP 激活失败会自动补偿。
- 首批目录提供 GitHub、Playwright、Context7、DBHub、AntV、Filesystem、Memory、Sequential Thinking 等推荐项，并将已有 Lark CLI、OfficeCLI、Ego Browser 和 MarkItDown 标记为系统受管能力。
- 新增固定 uv 0.12.3 和 Python 3.12.12 的受管 PyPI 运行时，隔离依赖索引、锁定 wheel/lock 哈希并验证实际运行时版本。
- macOS 使用原生 vibrancy，Windows 使用 Mica/Acrylic；启动窗口、标题栏、侧栏和浮层采用玻璃效果，编辑器、终端和文档区域保持不透明，并支持降低透明度和 GPU 回退。
- 接入 DeepSeek `deepseek-v4-pro` 结构化 Vision Harness；附件请求保持结构化 `text/image` parts，不把图片内联为 `data:image` 或 `dataBase64`。

## 验证

- 发布源代码以最终 `v0.4.0` 标签为准，版本固定为 `0.4.0`；Windows 安装包验证同时检查 `workwise-markitdown.exe` 已进入 `app.asar.unpacked`。
- macOS Vision Unlimited-OCR 两页 PDF 回环通过：页码 `[1,2]` 顺序正确、两页非空、耗时 `1472 ms`，关键内容包含 `VISION-ACCEPTANCE-042` / `Status: READY`。
- DeepSeek `deepseek-v4-pro` 真实图片问答通过：`thread=thr_2gpkj5ps`、`turn=turn_27lab8jr`、答案 `WW-VISION-20260823`；请求/日志不含 `data:image` 或 `dataBase64`。
- OpenSpec、品牌边界、许可证策略、ESLint、主/运行时 TypeScript、生产构建和差异检查全部通过。
- GitHub Actions 继续执行 Linux 全量质量门禁、Windows 安全测试、Electron smoke 和三客户端候选安装包验证。
- 隔离候选已完成飞书单聊唯一 `/status` 闭环，目标 chat 为 `oc_fc46b98b7bfd1185caca08e0da71d37c`，账本状态 `delivered`、`result_json.ok=true`；本轮不测试微信、不发送额外消息。macOS 通知点击定位仍待系统级点击证据。

## 升级说明

- 已安装 0.3.5 的用户可在正式候选和三平台安装包验证通过后升级。
- 第三方插件自动更新默认关闭；权限、许可证、脚本或网络域变化必须重新审查。
- 公共投稿市场不属于 0.4.0，后续单独立项。
