# Leica GSI 外部候选：Sarosh 合成 GSI8 网络

## 固定来源与完整性

- 上游仓库：[Sarosh008/leica-gsi-network-adjustment](https://github.com/Sarosh008/leica-gsi-network-adjustment)，固定提交 [`e7ea21b726044d20e7b3376c4acfae74f1988131`](https://github.com/Sarosh008/leica-gsi-network-adjustment/tree/e7ea21b726044d20e7b3376c4acfae74f1988131)。
- 上游文件：[`synthetic_network.gsi`](https://raw.githubusercontent.com/Sarosh008/leica-gsi-network-adjustment/e7ea21b726044d20e7b3376c4acfae74f1988131/tests/fixtures/synthetic_network.gsi)，上游 Git blob SHA-1 `716eb47650838c53820c8a42b9d55d3bf3358cd7`；本地 SHA-256 `0360cc66837a5e126d5ec3621cb10cc4328a27ac1f62bdf6bdd3009dc3c83099`。
- 仓库声明 [MIT License](./LICENSE)，本地 LICENSE SHA-256 为 `8135fed3f2df91c4744096764ce06c192df4272a10214f7a3895f83d244405a4`。该许可证声明不替代对任何底层外业数据来源的独立确认。
- 上游 README 明确该文件由 `make_synthetic.py` 基于已知真值的五点网生成。

## 本地复核

对原样字节运行当前 WorkWise 严格 lexer：`lexed`、`gsi8`、11 条记录、44 个 word、无诊断。

## 证据边界

此文件**明确是合成数据**。它适合作为合法的正向词法基线或负向变异的起点，不能冒充真实/脱敏工程观测，不能解除任何 P0 验收门禁。
