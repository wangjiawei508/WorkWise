# WorkWise 0.2.5 公开行为差距表

本表只记录公开可观察的功能与问题，不包含参考项目在 WorkWise 最后 MIT 基线之后的源码、补丁或实现细节。链接仅用于确认公开行为线索；WorkWise 按自身架构独立设计、实现与测试。

| 功能描述 | 问题表现 | WorkWise 验收行为 | 公开链接 |
|---|---|---|---|
| 跨平台文档与扩展路径 containment | 同一路径规则在 POSIX、Windows 根路径、链接或 junction 下可能产生不同结果 | 所有文件、附件、Skill、指令和仓库根都以 canonical root 判定；越界统一返回 `unsafe_path` | [公开提交：跨平台 containment](https://github.com/KunAgent/Kun/commit/9fb5ecf90430bca3aff2fad4fa563f7b69b3ee80) |
| Windows 根路径发布校验 | Windows rooted path 被 POSIX 规则误判，导致发布门禁或安装路径校验异常 | Windows x64 CI 覆盖盘符、UNC、junction 和 rooted path；安装包路径校验在目标平台通过 | [公开提交：Windows rooted path](https://github.com/KunAgent/Kun/commit/5605d743f2f5be53a8ea15d41819d0a2c0893f5b) |
| 原生扩展打包完整性 | 原生模块、Chromium sandbox 或运行时资源缺失时，安装包可构建但启动失败 | 打包后执行原生资源清单、启动冒烟和平台安装验证，缺失任何必需资源即阻止发布 | [公开提交：原生扩展打包校验](https://github.com/KunAgent/Kun/commit/8f8a30b37d5fb12d0c455e8684cd54ff8ee2861f) |
| Agent 流资源上限 | 超大帧、累计输出或回放缓存可能造成内存持续增长、卡死或白屏 | SSE、模型帧、累计文本、工具结果和回放均执行硬上限；超限可恢复并返回结构化错误 | [公开提交：Agent 流资源限制](https://github.com/KunAgent/Kun/commit/06f2c99f881865f7684b5bb5e7f95698c257050e) |
| 输入与安全边界校验 | 路径、请求、附件或工具输入只做表层校验时可绕过信任边界 | containment、请求体、附件、Skill 和 Web Fetch 在进入业务逻辑前执行共享安全策略 | [公开提交：安全验证边界](https://github.com/KunAgent/Kun/commit/d050c9bc785307f76396e5bf489404c3a7de7f72) |
| Write 与设计工作区持久化 | 保存、切换或强制退出并发时可能丢草稿、错配会话或留下半写文件 | Write 发送前持久化，按文件隔离会话，所有替换写串行且原子；崩溃后恢复完整旧值或新值 | [公开提交：工作区耐久性](https://github.com/KunAgent/Kun/commit/a563bc309e238762dcd0e01494a14fde95d67d76) |
| 后台任务与应用退出 | 退出时轮询、IM、工作流、语音、LSP 或子进程继续运行 | 退出先关闭入口，再分层取消并等待清理；五秒宽限后终止剩余受管进程树 | [公开提交：后台任务退出取消](https://github.com/KunAgent/Kun/commit/35ecd800c24aa1114cd547e2e5b7d77103342e9b) |
| IM 生命周期关闭 | 应用退出或删除渠道后，桥接任务、端口或未完成请求仍然存活 | 删除渠道与退出都取消对应 scope，等待 bridge、Turn、SSE 和持久化结束后再移除状态 | [公开提交：IM 生命周期关闭](https://github.com/KunAgent/Kun/commit/42e516c1d36018c4793b5eb8bf5f099479fb16ad) |
| Schedule 乱序响应 | 旧轮询结果晚于新设置返回时，会覆盖更新后的界面状态 | 请求带 generation；过期响应不得覆盖较新的 Schedule 或 Settings 状态 | [公开提交：忽略过期轮询](https://github.com/KunAgent/Kun/commit/fe1a76c55a2705d7a8b7c110d31a0c3713c53230) |
| Design 独立工作区入口 | 现版本不提供完整的设计项目入口、主题板和可追溯资产流 | 0.2.5 明确不引入；后续版本须具备独立项目边界、可审阅主题板、资产来源与导出验收 | [公开提交：Design 主题板](https://github.com/KunAgent/Kun/commit/61487092e5efc24b1cbcf99b69e4826f881d6503) |
| MiMo 与 MiniMax 多模态模型 | 当前模型设置不能完整表达这两类模型的文本、图像输入/输出与能力差异 | 0.2.5 明确不引入；后续独立适配须经过能力探测、协议验证、隐私提示、降级和多模态回归测试 | [公开版本：0.2.26](https://github.com/KunAgent/Kun/releases/tag/v0.2.26) |
| PPT 托管 Skill 连续执行 | 托管 Skill 安装后，跨 Turn 继续生成时可能丢失工作流状态或无法继续 | PPT Master 在同一文档/线程中可恢复受管 Skill 状态，失败保留输入并给出可诊断错误 | [公开提交：PPT Skill continuation](https://github.com/KunAgent/Kun/commit/cd6a380b8fcf81d8f646c61db1599ff84972fa63) |
