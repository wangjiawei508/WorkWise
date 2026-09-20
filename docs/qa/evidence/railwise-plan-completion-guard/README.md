# Typed Plan 完成守卫

## 修复前反例

源提交 `9974e69c65e2f76bf3318e713191b4125cb0e75e`。独立合成 Runtime 测试批准四步测量计划，本地 HTTP 模型替身仅回答一次“已完成”，没有发出任何工具调用。

[原始结果](./before-text-only-result.json)记录：四步回执均为 `null`，工具调用和新增平差均为 0，但 Task 与 Turn 为 `completed`，原始 plan 仍为 `started`。这证明完成判定缺少批准步骤回执检查；不是外部模型可用性问题。[原始反例脚本](./before-text-only-probe.ts)保留当时绝对路径和漏洞期望，不能当作修复后通过的回归用例直接运行。

既有 fbb 实际模型验收另有四个持久调用及成果文件，未受该反例推翻。成功路径不能证明空执行、部分执行或错误后的完成条件正确。

## 修复

TaskController 在通用回答/文件验收前，要求批准计划的每步成功回执、精确参数和前序绑定一致；缺失走已有有界重试/停滞流程。内部 Task/Turn 计划身份贯穿继续和重启，HTTP 普通发言不能注入执行标记。丢失绑定拒绝完成，普通咨询仍可正常回答。

Runtime 的只读 plan 投影返回 `execution.complete/completedStepIds/pendingStepIds`，界面按这些回执显示每步状态。历史缺回执的完成记录显示需处理，不补造回执、不改写历史、不自动执行副作用。部分执行后停滞/等待也会触发受作用域保护的权威数据刷新。

独立复核发现并修复了两个恢复入口：升级前没有新字段的 Task 通过既有 thread/project/task 绑定查回原计划；工程任务的通用 retry/resume 在任何 mutation 前返回 409，引导使用 typed plan 的继续或重规划，防止降级为普通聊天而绕过完成守卫。新旧记录的真实 Runtime shutdown/recreate 回归保留原 Task、首步回执和网络 revision，只执行剩余步骤。

Runtime 定向 7 文件 97 项及最终全量 2807 项通过/22 跳过。桌面最终全量 2790 项通过/2 跳过。双端类型、构建、严格 OpenSpec 11项通过；lint为0错误及1条既有 Workbench Hook warning。本目录保留最终命令原日志。界面覆盖中英文零步/部分/全部回执、历史误完成、停滞刷新与只读无 POST。最终源码验证和独立审查不能代替新签名包复验；9974 签名包仍保留为缺陷基线。

## 包内反例方法

[`verify-packaged-text-only.cjs`](./verify-packaged-text-only.cjs)绑定独立记录的 ASAR 摘要、精确源提交、0.5.0 版本和候选路径，导入前重新校验 codesign。它只在新建临时合成目录启动实际包内 Runtime，由回环 HTTP 模型替身返回固定完成文字；要求文字真实写入 transcript、四步回执为空、调用/平差数为0。`reproduce` 模式要求旧缺陷存在；`reject` 模式要求因明确的缺回执代码而进入非成功终态，防止把网络/解析失败误判为守卫有效。

9974 的签名包反例也已复现，见[精确包原始记录](../railwise-convergence-9974e69c65e2/README.md)。新修复包验证待补。

本测试只使用本地合成网络和 HTTP 模型替身，没有真实模型请求、生产工程、专业签认或公开发布操作。
