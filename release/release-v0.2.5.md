# WorkWise 0.2.5

## 稳定性与安全

- 新增 canonical containment 服务，拦截符号链接、Windows junction、UNC/设备路径、路径逃逸和替换前 TOCTOU。
- 附件按 `attachmentId + thread + workspace` 绑定，并执行单文件 5 MiB、单 Turn 8 个的硬限制。
- Skill 包增加安装前后双重校验，限制文件数量、深度、单文件与总大小，并拒绝链接、submodule 和特殊文件。
- Web Fetch 对每次请求和重定向重新验证 DNS/IP，阻止私网、回环、link-local、CGNAT、DNS rebinding、超大下载和异常重定向。
- SSE、模型流、工具参数/结果、请求体、Turn、Shell 输出和后台进程均增加不可突破的资源上限。

## 数据可靠性与退出清理

- 设置升级为 `WorkWiseSettingsV2`，支持 revision 冲突检测、只读旧数据导入、迁移备份和幂等清单。
- 设置、会话 JSONL、附件、Write 文件、工具/Skill 清单和导出文件使用串行队列、同目录临时文件、fsync 与原子替换。
- Windows 替换失败不再直接覆盖旧文件；启动时可恢复遗留 backup，JSONL 可修复不完整尾行。
- 新增统一取消注册表；Turn、SSE、审批、Shell 和子进程支持父子作用域取消，退出时按顺序清理并提供 5 秒宽限。

## Write、Git 与插件体验

- Write 发送前必须保存成功；未取得 Turn ID 时恢复输入和引用选区。
- Write 助手升级为文件级会话，支持重命名迁移、删除归档和 workspace scratch 会话。
- 修复长/未闭合代码围栏、真实列表编号和任务标记、选区浮层滚动/缩放定位，以及设置响应竞态。
- 支持工作区内嵌套 Git 仓库发现与选择，Review 严格限定在所选 canonical repository root。
- 审批随 Turn 终态自动过期；Skill 安装/更新后广播代际快照，斜杠菜单自动合并刷新。
- CLI 托管中心改用 GitHub Releases API 解析官方资产 URL，并保留系统代理、SHA-256 校验和失败回滚；ego-lite 保持外部应用引导。

## 品牌与兼容

- 用户界面、公开 API、WorkWise 自有路径、日志、资源、构建和发布脚本统一为 WorkWise。
- 正式 preload 接口为 `window.workwise`；旧接口仅保留 deprecated 转发代理。
- 新安装只写入 `~/.workwise` 和工作区 `.workwise`；旧路径仅用于 0.3.x 之前的只读迁移。
- 新增品牌边界 CI，法律来源、内部 MIT 运行时、迁移模块和 Windows 升级标识之外禁止旧产品命名。

## 验证

- OpenSpec strict validation、品牌边界、ESLint、TypeScript、主程序与内部运行时 Vitest、生产构建纳入质量门禁。
- Windows 增加路径、junction、spawn、Git 与原子持久化回归任务。
- Release 前执行 2 小时稳定性循环；夜间工作流分两段执行 8 小时稳定性循环。

## 发布与更新

- 正式安装包和自动更新元数据统一由 GitHub Actions 发布到 GitHub Releases，不需要额外的对象存储凭据。
- macOS Release 同时生成 arm64/x64 updater ZIP；Windows Release 附带 blockmap，并在公开前回下载校验 YAML 元数据与 SHA-256 清单。
