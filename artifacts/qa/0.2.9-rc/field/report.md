# WorkWise 0.2.9 RC 现场工程师用户验收报告

- 角色：工程监测项目现场工程师 / 非开发者员工
- 候选包：`dist/mac-arm64/WorkWise.app`
- 隔离配置：`/tmp/workwise-qa/field`，运行时端口 `8912`
- 测试日期：2026-07-17（Asia/Shanghai）
- 结论：**环境阻断，未进入业务验收；不得视为通过。**

## 发布阻断

### P1：Computer Use 无法取得候选窗口

- 操作：完整加载 Computer Use skill 后，用 `node_repl + sky` 调用候选包绝对路径的 `get_app_state({ disableDiff: true })`。
- 实际结果：调用超过 45 秒始终无返回、无 AX 树、无截图，也没有可供复现的错误文本；工具仅持续显示 `Script running with cell ID 3`。
- 处置：终止该调用并停止 UI 操作，避免在无法确认目标窗口时误触 `/Applications/WorkWise.app`。
- 证据：未取得截图；这是环境阻断本身的一部分。
- 发布判定：必须在能稳定区分隔离候选窗口和正式版后重新执行全部用例。

## 未执行用例

以下用例均因候选窗口不可访问而未执行，不能标记通过：

1. 打开 `railwise-field-test.md`。
2. 通过 RailWise KB 入口询问公开内容，并核验来源链接与隐私文案。
3. 生成并保存现场检查清单，观察任务是否暂停及完成态。
4. 验证成果文件查找、另存为、显示位置与导出入口。
5. 从文档发起 5 页 PPT，验证 PPT Master 与 `.pptx` 交付。
6. 收集普通员工视角的困惑文案。

## 重测前置条件

- 确认候选包实例已经启动，并能通过唯一 app path、bundle id 或独立显示名被 Computer Use 精确识别。
- 候选窗口应显式显示 `field` 隔离 profile 标记，或使用独立 bundle id，避免与正式版同名窗口混淆。
- 重测时继续禁止外部 IM 发送、安装软件、发布和读取密钥。
