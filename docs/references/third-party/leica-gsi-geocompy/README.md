# Leica GSI 外部候选：GeoComPy

此目录保存的是从 GeoComPy 仓库取得的**原样、仓库声明为 MIT 的测试候选**，用于格式研究和回归边界核查；它们不是 WorkWise 的 P0 真实/脱敏 golden fixture，也不得据此把 Leica GSI 标为 `adjustment-ready`。

## 固定来源与完整性

来源仓库：[MrClock8163/GeoComPy](https://github.com/MrClock8163/GeoComPy)，固定提交 [`dda293b4f28082235f3eff9c7826f140497b7cf4`](https://github.com/MrClock8163/GeoComPy/tree/dda293b4f28082235f3eff9c7826f140497b7cf4)。仓库声明以 [MIT License](./LICENSE) 发布；随附的 `LICENSE` 必须与这些副本一同保留。该声明不替代对样本底层数据来源的独立确认。

| 本地文件 | 上游不可变来源 | SHA-256 | 观察到的内容 | 当前处理结论 |
| --- | --- | --- | --- | --- |
| `dna_data.gsi` | [`tests/data/dna_data.gsi`](https://raw.githubusercontent.com/MrClock8163/GeoComPy/dda293b4f28082235f3eff9c7826f140497b7cf4/tests/data/dna_data.gsi) | `8c4b03dbe6c747f2ca70092d4857c4612d3641a423b2cc441171dc825dcb816d` | GeoComPy 的 DNA 测试数据；包含 GSI8 宽度的记录与特殊 `?` 字段 | 当前 WorkWise 严格 lexer 对该原样文件返回 `illegal-character`，故不能作为通行 fixture |
| `tps_data.gsi` | [`tests/data/tps_data.gsi`](https://raw.githubusercontent.com/MrClock8163/GeoComPy/dda293b4f28082235f3eff9c7826f140497b7cf4/tests/data/tps_data.gsi) | `4eb03f8c56b607a41ee0329b7c1b9e1b89384f5a7a972b2794c09055e3a242dc` | GeoComPy 的 TPS 测试数据；既含行首 `*` 的 GSI16 记录，也含 GSI8 记录 | 当前 WorkWise 严格 lexer 按混合数据宽度 fail-closed，返回 `mixed-data-width` |

## 证据边界

- 上游将它们置于 `tests/data`，但没有声明它们是外业实测、已脱敏工程数据，或获得了可作为行业验收样本的授权。因此它们只能是**开放许可的词法/兼容候选**，不能满足 PRD F-FMT-40 的“真实/脱敏 + 独立 golden/negative”门槛。
- 该目录不在 `kun/src/engineering/fixtures/`，任何测试、导入目录或格式目录都不得自动发现或采用这些文件。
- 若未来要将任一 Leica 样本提升为 P0 验收输入，仍需：来源声明与再分发许可、真实或充分脱敏证明、独立数值 golden/negative、单位/基准映射、以及候选包内端到端验收记录。
