# WorkWise 0.2.9 RC 前端体验与可用性走查

测试日期：2026-07-17（Asia/Shanghai）  
测试对象：`/Users/wangjiawei/Documents/WORKGPT-menu-localization/dist/mac-arm64/WorkWise.app`  
隔离配置：`/tmp/workwise-qa/frontend`  
方式：Computer Use 当前运行界面；未登录、未发送外部消息、未安装软件。

## 总体结论

字体大小的“即时应用 + 重启保存”已经通过，中文/英文切换和 macOS 应用菜单同步切换也通过。Skill、CLI 和 Write 的公开名称已正常本地化，未再出现 `pluginCliTitle` 一类键名。

第二轮候选版复测确认：此前的大号字体窄窗阻断已修复，右侧写作助手在约 820 px 时改为可收起浮层，收起后核心导航与正文完整可读；Tab 焦点轮廓也已增强。当前前端专项未发现发布阻断项。

## 走查步骤与健康状态

1. 首次配置（健康）：中文文案完整，主题、语言、API Key 和服务地址层级清晰；大号字体重启后仍保持中文。
2. 通用设置（健康）：小/中/大三档均即时改变界面字号；选择后出现应用状态；设置文件 revision 递增。
3. 重启持久化（健康）：重启隔离候选版后仍为 `locale=zh`、`uiFontScale=large`，界面同步保持中文和大号字体。
4. 语言与菜单（健康）：切换 English 后设置页和 macOS 菜单均为英文；切回简体中文后菜单为“文件 / 编辑 / 显示 / 窗口 / 帮助”。
5. 键盘 Tab（第二轮已通过）：第一轮焦点轮廓较弱；最新候选版已显示清晰的高对比 `focus-visible` 轮廓。
6. Skill 市场（健康）：标签和卡片为可读名称，搜索、分类、刷新、在线更新文案正确；长标题使用省略号，不再显示翻译键。
7. CLI 市场（健康）：显示“飞书命令行工具 / Office 文档工具 / Ego 浏览器助手”，状态标签和描述均正常。
8. Write 工具栏（健康）：打开文件前后“生成配图”“生成 PPT”均有中文可访问名称，当前候选版未显示禁用状态；离线 runtime 横幅说明和恢复入口清楚。
9. 窄窗口 + 大号字体（第二轮已通过）：第一轮三栏挤压问题已由右侧浮层和 820 px 最小窗口宽度解除。

## 发布阻断问题

> 第二轮复测状态：**已解除**。以下保留第一轮问题记录用于回归追踪。

### P2 — 大号字体在窄窗口下破坏核心导航与写作助手可读性

- 复现：通用设置选择“字体大小 → 大”；打开 Write 文档；把窗口宽度缩到约 820 px。
- 预期：侧栏自动折叠或转为抽屉，核心导航、文档和写作助手仍可读；至少不应把标签截成单字。
- 实际：左上“编程 / 写作”被截为“编… / 写…”，专注模式只剩零散文字；右侧“写作助手”和模型标签也被截断，正文被压缩成每行 2–4 个汉字。
- 建议：在大号字体或宽度小于约 960 px 时自动收起右侧助手；更窄时再收起左侧栏；同时给窗口设置与三栏布局一致的最小宽度。避免仅依赖 `text-overflow: ellipsis` 处理主导航。
- 证据：[11-narrow-window-large-font.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/11-narrow-window-large-font.png)
- 第二轮结果：约 820 px 时右侧助手转为浮层，点击收起后正文和左侧核心导航完整可读。窗口无法继续缩到 820 px 以下（候选版限制了最小宽度），因此更窄的左栏浮层断点无法从桌面窗口直接触发；但不可用的更窄三栏状态也不再能出现。
- 发布判断：**已解除阻断**。

## 其他问题

### P3 — Tab 焦点视觉提示过弱

- 复现：关闭首次配置后连续按 Tab，AX 焦点已到“写作”标签。
- 预期：有明显、连续的焦点环，键盘用户能立即判断当前控件。
- 实际：选中态和焦点态几乎一致，截图中难以识别当前键盘焦点。
- 建议：统一使用至少 2 px 的高对比 `:focus-visible` 外框，并与选中态分离。
- 证据：[07-keyboard-focus-write-tab.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/07-keyboard-focus-write-tab.png)
- 第二轮结果：Tab 焦点落到“生成 PPT”时出现清晰的蓝色双层轮廓，与选中态可区分。
- 发布判断：**已通过**。

## 第二轮复测（最新候选版）

测试 profile：`/tmp/workwise-qa/product-retest`。

1. **大号字体：通过。** 通用设置明确显示“字体大小：大”，主设置布局无溢出。证据：[12-retest-font-large.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/12-retest-font-large.png)
2. **供应商预设默认占位：通过。** 未选择预设时显示“请选择供应商预设”，且“添加预设”按钮禁用，不会误把任一供应商当作待添加项。截图中的既有密钥仅显示为掩码。证据：[13-retest-provider-placeholder.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/13-retest-provider-placeholder.png)
3. **帮助中心 Skill/CLI 路径：通过。** 帮助中明确写出“从左侧『插件』进入技能或命令行工具页面”，并说明安装、启用、禁用和同步入口。证据：[14a-retest-help-skill-cli-heading.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/14a-retest-help-skill-cli-heading.png)、[14b-retest-help-skill-cli-path.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/14b-retest-help-skill-cli-path.png)
4. **约 820 px 右侧助手浮层：通过。** 助手转为覆盖式浮层，保留明确收起按钮；收起后正文、编程/写作、专注模式和文件树均可读。证据：[15a-retest-820-assistant-overlay.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/15a-retest-820-assistant-overlay.png)、[15b-retest-820-assistant-closed.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/15b-retest-820-assistant-closed.png)
5. **更窄左栏浮层：受限通过。** 实际窗口最小宽度约 820 px，继续拖窄仍保持 820 px，因此桌面端无法进入更窄状态。该限制避免了第一轮出现的不可读三栏布局；本轮不能从真实窗口证明 820 px 以下的左栏浮层动画。
6. **Tab focus-visible：通过。** “生成 PPT”获得焦点时出现连续、高对比蓝色轮廓。证据：[16-retest-focus-visible.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/16-retest-focus-visible.png)

第二轮结论：**前端专项无发布阻断项。**

## 通过项证据

- 中文首次配置：[01-onboarding-zh.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/01-onboarding-zh.png)
- 小号字体基线：[02-settings-font-small.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/02-settings-font-small.png)
- 中号字体即时应用：[03-settings-font-medium-applied.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/03-settings-font-medium-applied.png)
- 大号字体即时应用：[04-settings-font-large-applied.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/04-settings-font-large-applied.png)
- 英文界面与菜单：[05-settings-english-large.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/05-settings-english-large.png)
- 重启后中文大号字体保持：[06-restart-zh-large-persisted.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/06-restart-zh-large-persisted.png)
- Skill 市场中文：[08-skill-market-zh-large.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/08-skill-market-zh-large.png)
- CLI 市场中文：[09-cli-market-zh-large.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/09-cli-market-zh-large.png)
- Write 的配图/PPT 控件：[10-write-image-ppt-controls.png](/Users/wangjiawei/Documents/WORKGPT-menu-localization/artifacts/qa/0.2.9-rc/frontend/10-write-image-ppt-controls.png)

## 证据边界

- 第一轮隔离 profile 未配置模型/API；第二轮不查看、不修改也不输出既有密钥。两轮均未实际执行生图或 PPT 生成，只确认按钮状态、标签、布局和错误恢复文案。最终文件交付由功能测试角色覆盖。
- 当前恢复连接插画未出现此前描述的“三个锯齿”；但单帧截图不能证明整段动画所有帧都正确，需要录屏或逐帧测试补证。
- 截图和 AX 树不能证明完整 WCAG 合规；颜色对比数值、屏幕阅读器朗读和所有键盘路径仍需专项测试。
