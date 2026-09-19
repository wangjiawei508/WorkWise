# Survey 私有原生升级验收

此流程为隔离候选包补充真实 updater 证据，不发布 GitHub Release、不上传 R2、不修改官网或 stable/frontier feed。入口为 `release.yml` 的 `private_updater_acceptance=true`；该开关排除其他发布、修复和旧公开验收路径。

## 验证范围

- GitHub 托管的临时 macOS arm64 runner；拒绝本机和 self-hosted runner。
- 同一完整源码 HEAD、候选 bundle 身份和签名要求；内部基线版本 `0.0.0` 升至仓库当前版本。版本覆盖只发生于包 metadata，仓库公开版本文件不修改。
- 基线与目标分别签名、公证。构建目录和实际 DMG 安装出的应用均核对完整源码 HEAD、bundle、版本、签名、公证票据和精确 loopback 更新配置。
- HTTPS 服务仅监听 `127.0.0.1`，仅提供本次随机路径下的清单与实际目标 ZIP。临时证书仅在 runner 用户域、针对 loopback SSL 受信，退出时删除信任、恢复 keychain 列表并清理临时 keychain。
- 实际应用调用 `electron-updater`，经 Squirrel 安装并重启；必须取得原生阶段报告、HTTPS 下载记录、已安装目标 ASAR 摘要匹配和隔离数据保留证据。手工替换应用或单独下载 ZIP 不能通过。
- 候选安装、配置、工具目录及 updater 缓存独立。失败保留报告，清理失败也判失败；不关闭 TLS 校验，不改变本机 Gatekeeper。

## 执行与结果

从已经验证的分支提交启动：

```sh
gh workflow run release.yml --repo wangjiawei508/WorkWise \
  --ref codex/railwise-survey-convergence \
  -f private_updater_acceptance=true -f candidate_only=true
```

检查 Actions 的 `private-updater-arm64-<完整HEAD>` 附件，必须同时核实 `private-updater.json` 和 `native-updater.json`。目标安装包单独保留在 `private-updater-target-arm64-<完整HEAD>` 附件中。不要将仅有 workflow 绿灯、脚本单元测试或基线安装成功视为往返完成。

本轮新增流程的专用测试验证 HTTPS 传输、隔离目录、版本/身份、精确 feed、清理失败和工作流互斥；真实往返结果以单独运行记录为准。本流程不证明历史正式用户数据迁移、专业测量结果符合性、用户本人 UI 确认，或 Intel/Windows 平台验收。目标包重新安装后的 GUI 验收仍需按精确源码与包摘要记录。
