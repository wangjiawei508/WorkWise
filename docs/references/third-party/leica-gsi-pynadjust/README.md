# Leica GSI 外部候选：PynAdjust `gsisample.gsi`

## 固定来源与完整性

- 上游仓库：[icsm-au/PynAdjust](https://github.com/icsm-au/PynAdjust)，固定提交 [`804e0376aa995fe05976aeb47bf9dea2ff974408`](https://github.com/icsm-au/PynAdjust/tree/804e0376aa995fe05976aeb47bf9dea2ff974408)。
- 上游文件：[`gsisample.gsi`](https://raw.githubusercontent.com/icsm-au/PynAdjust/804e0376aa995fe05976aeb47bf9dea2ff974408/pynadjust/tests/resources/gsisample.gsi)，上游 Git blob SHA-1 `2616a7f787010d0a3baee5385cf1e26b2f0046e2`；本地 SHA-256 `fa59e2312924139b112dee1b5c2694ca48e8649c45e1e88d9ede2903ee4b19c8`。
- 仓库声明 [Apache License 2.0](./LICENSE)，本地 LICENSE SHA-256 为 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`。该许可证声明不替代对样本底层数据来源的独立确认。
- 上游将该文件用于 GSI→MSR 转换测试并检查配套预期输出；它是独立实现的转换器测试工件。

## 本地复核

对原样字节运行当前 WorkWise 严格 lexer：`lexed`、`gsi16`、147 条记录、1,024 个 word、无诊断。

## 证据边界

此文件可作为独立实现的 GSI16 转换研究候选；上游没有给出原始仪器导出、实际工程脱敏或独立 P0 数值验收的来源说明。因此它不能作为真实/脱敏 P0 golden，也不能把 Leica GSI 提升为 `adjustment-ready`。
