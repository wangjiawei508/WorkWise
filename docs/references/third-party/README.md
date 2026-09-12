# 第三方测量格式研究候选

这里的文件用于许可证、格式结构和兼容边界研究。它们不会被测试自动发现，不属于生产导入目录，也不构成真实/脱敏 P0 验收证据。

| 来源 | 覆盖 | 仓库许可声明 | 当前 lexer 结果 | P0 状态 |
| --- | --- | --- | --- | --- |
| [OSGeoLabBp `labor.gsi`](./leica-gsi-osgeolab/README.md) | GSI16 | CC0 1.0 | 59 记录 / 236 words，接受 | 教学样本，非真实/脱敏 |
| [Sarosh `synthetic_network.gsi`](./leica-gsi-sarosh/README.md) | GSI8 | MIT | 11 记录 / 44 words，接受 | 明确合成，非真实/脱敏 |
| [PynAdjust `gsisample.gsi`](./leica-gsi-pynadjust/README.md) | GSI16 | Apache-2.0 | 147 记录 / 1,024 words，接受 | 转换器测试工件，来源未证实 |
| [GeoComPy GSI 测试数据](./leica-gsi-geocompy/README.md) | GSI8、GSI16 混合 | MIT | 特殊字段/混合宽度均被严格 lexer 阻断 | 负向与方言研究候选，非真实/脱敏 |
| [RTKLIB GNSS 研究原件](./gnss-rtklib/MANIFEST.md) | RINEX、SP3、RTCM、u-blox、NovAtel、Javad | BSD-2-Clause（含上游附加条款） | 固定提交原件用于检测/锚点回归 | 公开研究数据，不是基线 golden |
| [固定公开格式研究样本](./open-format-samples/README.md) | Leica GSI、Trimble M5/JobXML | Apache-2.0、CC0-1.0、MIT | 固定 commit 原件用于解析/来源回归 | 公开仓库测试/教学样本，仍为 archive-only |

每个子目录都保留固定上游提交、来源链接、许可证副本和 SHA-256。若要将任何文件提升为 P0，必须另行完成来源/脱敏/再分发确认、独立数值 golden 与 negative、单位/基准映射及候选包验收。
