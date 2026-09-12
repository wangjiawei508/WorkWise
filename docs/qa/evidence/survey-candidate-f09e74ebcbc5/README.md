# 2026-09-08 私有候选包测量内核复核

此处是候选包内 Runtime 的真实资料闭环证据，**不是 GUI 操作验收或发布批准**。

- 主工作区基线：`9210efe15bbc3331f202cd866c74d7acee95b33f`，原工作区未提交、未重置。
- 独立源码副本：`/private/tmp/workwise-survey-acceptance-yTue1b/source`。
- 本地快照提交：`f09e74ebcbc51331ca04e2227ff9632b61913689`；打包前后 Git 状态为空。
- 应用：`WorkWise Candidate f09e74ebcbc5.app`；包内版本 `0.4.2`，arm64，Electron `43.1.1`，Node ABI `148`。0.5.0 是本轮开发计划名称，未修改公共版本。
- Bundle ID：`com.wangjiawei508.workwise.candidate.headf09e74ebcbc5`。
- ASAR SHA-256：`e8ac874d7af270341ae4b8dcf9e0fa6b9851375c6ff6d8a6c9dbfd1b1c99c684`。
- ASAR 校验：18,364 个文件、461 个编译文件；包内 SQLite smoke 通过；签名完整性校验通过，adhoc 签名，无 Team ID、未公证。
- 本地安装副本：`/private/tmp/workwise-survey-acceptance-yTue1b/final-installed/WorkWise Candidate f09e74ebcbc5.app`；复制后签名校验和 ASAR 哈希核对通过。
- 检查脚本：`scripts/check-survey-production-delivery.mjs`，SHA-256 `2212d2fb6a3cec27bb391deca7a3b0857c256a084d87879933aa663d58b7c936`。该外部检查脚本的 ASAR 磁盘读取修复晚于快照，不属于打包应用；应用生产源码及包内 Runtime 未在构建后修改。

检查脚本由候选自己的 Electron 可执行文件以 Node 模式运行，直接加载候选中的 EngineeringService、SurveyService、确定性平差内核及报告依赖；每次创建独立临时工程，不启动 GUI、模型、IM 或更新器。真实输入只读，仓库只保存哈希、汇总计数和误差，没有复制原始观测、点号或工程报告。

| 资料 | 观测数 | 成果点数 | 最大点位标准差（m） | PDF 页数 | 同源 COSA 高程比较 |
| --- | ---: | ---: | ---: | ---: | --- |
| [左线 IN1](left-in1.json) | 134 | 61 | 0.0006225647883912831 | 6 | 61 点、0 不匹配 |
| [左线 IN2](left-in2.json) | 268 | 61 | 0.0028839281527792827 | 6 | 未进行 OU2 坐标对比 |
| [右线 IN1](right-in1.json) | 116 | 52 | 0.0006278729092993502 | 5 | 52 点、0 不匹配 |
| [右线 IN2](right-in2.json) | 232 | 52 | 0.0022575678463075317 | 6 | 未进行 OU2 坐标对比 |

四组均通过来源完整性、导入预检、确定性平差和内核精度门禁；DOCX/PDF 包含全部成果点，XLSX 包含对应坐标和闭合指标，输出文件哈希及持久化 manifest 一致。成果仍为 `draft`。两组 IN1 的比较容差为原报告打印分辨率的一半加 `1e-9 m`，最大高程差分别为 `4.9802540367238635e-6 m`、`4.872153235524479e-6 m`。

最终 dir 包不含 `app-update.yml`，不能用作真实更新器往返基线。较早 `1978cd1a83ec` 映像因 prepackaged 路径多包一层目录，已判定为不合格安装映像，未作为最终候选；其原件留在隔离临时目录供取证。

GUI 启动和修正 DMG 的自动审批未通过：先返回 `429 Too Many Requests`，随后 CC Switch 代理返回 `404`，说明当前账户组不支持 `codex-auto-review` 模型。没有绕过该审批启动应用；最新候选尚无明暗主题、窄窗口、键盘、连续会话及文件选择的真实 GUI 截图，也未完成真实更新器往返。OpenSpec 15、29、36 保持未完成。
