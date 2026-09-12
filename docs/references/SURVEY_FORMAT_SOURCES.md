# 工程测量格式实现来源

本清单记录格式事实和测试依据，不把第三方解析代码或真实工程数据复制进 WorkWise；唯一例外是已单独记录许可证、不可变来源和完整性哈希的开放许可研究候选。

## P0 格式证据状态（2026-09-05）

以下来源能帮助核验格式事实，但没有一个来源本身授权把相应格式提升为
`adjustment-ready`。P0 仍必须满足 PRD 的真实/脱敏来源、独立 golden 与 negative、
单位/基准映射及候选包验收门槛。

### Carlson RW5 与 Trimble JobXML 官方资料（2026-09-06）

- [Carlson SurvCE RW5 File Format](https://update.carlsonsw.com/manuals/SurvCE/online/source/FileFormat.html) 明确定义 `OC.OP` 为测站、`TR/SS/BD/BR/FD/FR` 使用 `OP`/`FP`（测站/前视点），`LS.HI/HR` 为仪器高/棱镜高，`MO.UN` 为 `0=feet, 1=meter, 2=US feet`；`ZE`（天顶距）与 `VA`（垂直角）是不同字段，`AU` 枚举在该页未定义。WorkWise 因此只在声明了 `MO.UN` 时转换线性值；未知 `AU` 或角度参考不生成方向/天顶观测，原字段和锚点保留并保持 `archive-only`。
- [Trimble JobXML Schema 6.27](https://ww2.trimble.com/schema/JobXML/6_2/JobXMLSchema-6.27.xsd) 官方 XSD 的说明定义 JobXML 6.27、`JOBFile/FieldBook/Reductions/Environment` 结构，并明确所有角度/经纬度为十进制度、距离及仪器/目标高为米。该 schema 原件仅保存于本轮临时研究目录，未复制进仓库；当前 HeXML/JobXML 解析仍需逐元素互操作 golden，不能仅凭 XSD 提升为 `adjustment-ready`。

### RTKLIB GNSS 研究样本（2026-09-06）

[RTKLIB `71db0ffa0d9735697c6adfd06fdf766d0e5ce807`](https://github.com/tomojitakasu/RTKLIB/tree/71db0ffa0d9735697c6adfd06fdf766d0e5ce807) 的 `readme.txt` 声明 BSD-2-Clause 及附加条款，并列出 RINEX、RTCM、BINEX、NMEA、SP3、ANTEX、IONEX 及多种接收机协议支持。固定提交的研究原件隔离保存于 [`third-party/gnss-rtklib/`](./third-party/gnss-rtklib/)，每个文件均记录来源路径、Git blob SHA-1 与本地 SHA-256；262,144 字节的二进制文件按上游原样保留，不声称是完整录制。

| 文件 | 上游 Git blob SHA-1 | 本地 SHA-256 | WorkWise 用途 |
| --- | --- | --- | --- |
| `07590920.05o` | `43f8bcf43a4e33843bff3c85bf1954de4ad9edb1` | `8474af556633e9c03293a8fb1e2c1f55180b42336b17574a84fda06eb6a02f9e` | RINEX 2.10 观测头与边界研究 |
| `07590920.05n` | `f95d0080fe4faec9b28dcf97d7e120675ddf7e23` | `eb26dce205b59269147035be49db481d38dc51bb8601dac6e84c0c868bb8094a` | RINEX 2.10 导航头与边界研究 |
| `igl15253.sp3` | `9a91aac8aa751996e058f48e2fb5228ab98be847` | `7217b8820cda934638fd75e8c6863ce2301a864cc7c61529af1d54a3ac26c5ed` | SP3 标头/产品识别研究 |
| `testglo.rtcm2` / `testglo.rtcm3` | `a682eac58c6a0e69f181a112b94e88c5ab24a02d` / `32e98e875662b18e55dd812cc1171c182ee32256` | 见目录内清单 | RTCM 原始流识别；不进入基线平差 |
| `ubx_20080526.ubx`, `oem*_*.gps`, `javad_*.jps` | 见目录内固定来源 | 见目录内清单 | 二进制同步字/原始记录锚点研究 |

这些文件只用于检测、锚点和 `gnss-processing-required` 回归，不替代带固定基准和完整协方差的基线成果。

### 固定公开仓库样本（2026-09-06）

通过 `ego-browser` 检索并固定了 4 个公开仓库的 6 个测量格式样本，原件和来源清单位于
[`third-party/open-format-samples/`](./third-party/open-format-samples/)。每项均记录不可变
commit、Git blob SHA-1、本地 SHA-256、字节数和仓库声明的许可证，并由
`survey-public-fixtures.test.ts` 独立回归。

| 格式 | 文件 | 固定来源/许可 | 结果边界 |
| --- | --- | --- | --- |
| Leica GSI16 | `pynadjust-gsisample.gsi` | PynAdjust `804e0376` / Apache-2.0；OSGeoLabBp `8809157e` / CC0-1.0 | 可重复 lexer/记录锚点回归；仍为 archive-only |
| Trimble/Zeiss M5 | `osgeolab-sample.m5` | OSGeoLabBp `8809157e` / CC0-1.0 | 可重复 tagged-record 检查；不宣称厂商互操作 |
| Trimble JobXML | `trimble-jobxml-test.jxl` | JobXML `1039859f` / MIT | XML 检测和锚点回归；无独立基准/协方差 |
| LandXML | `openbim-landxml-example.xml`, `openbim-landxml-client.xml` | openBIM-surveyor `e88e0e79` / AGPL-3.0 | Units/点位结构回归；单位语义未独立验收，仍为 archive-only |
| Hatanaka/CRX、SINEX、ANTEX、SP3 | `orekit-hatanaka.crx`, `orekit-sinex.snx`, `orekit-antex.atx`, `orekit-sp3.sp3` | Orekit `53842a2e` / Apache-2.0 | GNSS 行锚点、压缩格式识别和产品头检查；仍需 GNSS 后处理或受审计转换器 |

这些样本的公开仓库许可只解决样本再分发边界，不证明其为真实外业或脱敏生产数据；因此
不能替代 PRD 要求的独立参考计算、单位/基准核验和候选包导入验收。这里的验收门槛是数据
可解释、可复算、精度合格且全链路可追溯，不以取得厂商转换器授权作为额外条件。最小 LandXML TIN 示例仅含
`P`/`F` 表面元素，解析器按无控制点处理并阻断，不把表面顶点猜作平差点。

### Leica GSI 单位与解析证据边界

仓库内的 GSI 合成夹具按第 6 位单位码逐 word 解码，并把原始数值、单位码、四字符
`information`、完整 raw lexeme 和来源记录锚点一起保留。长度码 `0/1/6/7/8` 分别按
米、英尺、0.1 mm、0.0001 ft 和 0.01 mm 的声明转换到 metre；角度码 `2/3/4/5` 分别
按 gon、十进制度、紧凑 DMS 和 6400 mil 转换到 radian。GSI8 与 GSI16 只改变数据区
容量，不改变末位精度。紧凑 DMS 的分、秒字段在转换前严格校验，非法单位码、维度冲突、
超安全整数和混排记录均以 `archive-only` 阻断且不产生部分观测。

这些合成断言证明有界解析、安全失败和 provenance 保留，不代表厂商授权或真实仪器往返。
当前 WI41 水准语义适配器 `leica-gsi-leveling-block-parser@0.4.0` 要求显式 WI83
初始化，并以相邻累计高程之差构建高差；完整记录可进入 `adjustment-ready`，仍须通过
固定控制、拓扑和精度策略。缺初始化或解析阻断时保持 `archive-only`；旧解析结果保留
只读，重新参与平差/交付前须重新导入。其他 GSI 方言不因此自动获得水准语义支持。
真实工程及独立数值证据见 [0.5.0 安装候选复测](../qa/evidence/survey-candidate-912e4d30b065/README.md)，
其中原件与既有 IN1 的转换差异、GUI 和签名更新验收仍未关闭。

| 格式 | 已核验来源 | 可复用材料 | 不能据此得出的结论 |
| --- | --- | --- | --- |
| Leica GSI8/GSI16 | [OSGeoLabBp](https://github.com/OSGeoLabBp/tutorials/tree/8809157e57a35d61ae85b3d324c8ca3a71a35e20)、[Sarosh](https://github.com/Sarosh008/leica-gsi-network-adjustment/tree/e7ea21b726044d20e7b3376c4acfae74f1988131)、[PynAdjust](https://github.com/icsm-au/PynAdjust/tree/804e0376aa995fe05976aeb47bf9dea2ff974408)、[GeoComPy](https://github.com/MrClock8163/GeoComPy/tree/dda293b4f28082235f3eff9c7826f140497b7cf4) 与 [Total Open Station GSI 说明](https://github.com/totalopenstation/totalopenstation/blob/main/docs/input_formats/if_leica_gsi.rst) | 四组许可/来源边界不同的 GSI 研究候选已隔离保存于 [`third-party/`](./third-party/README.md)，每组都带许可证、上游不可变链接和 SHA-256 | OSGeo 是教学样本、Sarosh 明确合成、PynAdjust 是转换测试工件、GeoComPy 含严格 lexer 会阻断的方言；均没有真实/脱敏外业来源和独立 P0 数值验收，不能提升为 `adjustment-ready` |
| COSA `.in1/.in2/.NET/.ou1/.ou2` | [COSA 操作说明](https://www.sohu.com/a/786069333_121124209)、[CosaSoft 产品页](https://www.survey3d.com/changguicehui/changgui-kesha.html) 与 [武汉大学作者期刊索引](https://chxg.cbpt.cnki.net/portal/journal/portal/client/paper/2523e684054208e5db90cbf340888072) | 用户已授权的本机挂载盘发现了成对 `.in1/.ou1` 真实工程文件；仅在原路径只读对照，不复制进仓库 | 原始文件不进入仓库；列序通过显式映射、单位/基准声明、独立参考计算和交付闭环决定是否 `adjustment-ready`，不以厂商转换器授权作为准入条件 |
| 南方 DAT / PA2005 | [南方 NTS-591R10 手册](https://pm.southsurvey.com/static/uploads/downfiles/20250911/591R10%E6%B5%8B%E9%87%8F%E6%9C%BA%E5%99%A8%E4%BA%BA%E6%93%8D%E4%BD%9C%E6%89%8B%E5%86%8C-1757582889.pdf)、[NTS-382 手册](https://pm.southsurvey.com/static/uploads/downfiles/20250915/NTS-382%E7%B3%BB%E5%88%97%E5%85%A8%E7%AB%99%E4%BB%AA%E8%AF%B4%E6%98%8E%E4%B9%A6%281%29-1757925461.pdf) 与 [PA2005 官方目录](https://o.southgis.com/download/init?typeId=ee487cff-13c6-421d-8005-030c127c1461) | NTS-591R10 对机型限定 TXT 的记录语义提供一手核验；其坐标输出为 NAME/CODE/N/E/Z 且允许自定义顺序 | 这不是 PA2005 DAT wire-format；不同机型/导出设置的字段可重排，手册也未完整定义分隔、转义、编码和可选字段。Q-11 继续 `n.a.`，不设默认列序 |
| 南方官方内容许可 | [南方测绘法律声明](https://pm.southsurvey.com/legalnote.html) | 仅以链接方式引用格式事实 | 官方声明禁止未经书面许可复制、传播或改编网站内容；PDF、论坛片段、示例和从其派生的数据不得进入 fixture 或仓库 |

补充检索记录：[CSDN 全站仪闭合导线教程（附原始数据）](https://blog.csdn.net/weixin_42523693/article/details/161133829) 的公开页面标记为 VIP 文章，正文在“仪器参数设置检查表”处截断；公开 HTML 中没有附件、网盘 URL、原始字段或可下载资源（`resourceId` 为空）。文章标题对“附原始数据”的声称无法在未付费内容中核验。因此该页面只能作为教程线索保留，不能绕过会员/验证码，也不能据此下载或纳入任何 P0 fixture。

已识别但**未复制**的 Leica 真实数据线索：Medjil 仓库中有路径为
[`InitialData/.../M_210112BOYA.GSI`](https://github.com/ibaran73/Medjil/blob/a16213177404227a391e3d0f436a06d02b3ed687/media/InitialData/Staff%20Range/Australia/WA/Boya/Range%20Calibration/20172297/20210112-26296-VU/M_210112BOYA.GSI)
的 GSI16 校准记录；目录与 [Landgate Boya 校准设施说明](https://www.landgate.wa.gov.au/location-data-and-services/surveying/instrument-calibration/)
使其很像真实数据，但固定提交没有给原始 `media/InitialData` 的独立许可。Landgate 的
[许可页](https://www.landgate.wa.gov.au/location-data-and-services/discovering-landgate-data/licensing/)
明确数据使用由具体许可条款约束。因此该线索不得下载、纳入仓库或用于 P0，除非 Landgate
书面确认原始记录的测试留存与再分发许可。

| 格式 | 依据 | 固定版本 | 许可证/使用方式 | WorkWise 边界 |
| --- | --- | --- | --- | --- |
| Sokkia SDR33 | Total Open Station `if_sokkia_sdr33.rst`，说明 `02TP`、`03NM`、`08TP`、`09F1` 的记录语义 | `totalopenstation/totalopenstation@95fc444ce2d8f6c663f19db7754e295f621e030a` | GPL-3.0；仅用于核对公开格式事实，未复制代码或 fixture | SDR20/SDR33 使用独立定长布局；未知方言阻断 |
| Sokkia SDR20/33 字段宽度 | 公开仪器导出样例用于人工核对字段边界 | 样例内容不进入仓库 | 不作为可再分发 fixture；仓库测试使用独立合成数据 | 仅当标头和字段均满足固定布局才生成观测 |
| RINEX | IGS/RTCM 公开 RINEX header 约定 | 2.x/3.x/4.x | 开放交换格式；测试为合成最小标头 | 观测/星历不等于基线成果 |
| RTCM | RTCM 2/3 帧同步和消息号约定 | 2.x/3.x | 测试为合成最小帧 | 只做有界预检，必须经 GNSS 解算 |
| u-blox UBX | UBX 二进制同步字与类/消息号布局 | 合成最小帧 | 不含厂商真实数据 | 只做帧锚点，不直接平差 |
| NovAtel OEM | OEM 二进制同步字和消息号布局 | 合成最小帧 | 不含厂商真实数据 | 只做帧锚点，不直接平差 |
| Septentrio SBF | SBF 同步字和 block id/length 布局 | 合成最小帧 | 不含厂商真实数据 | 只做块锚点，不直接平差 |
| BINEX | enhanced record 同步字约定 | 合成最小帧 | 不含真实数据 | 只做记录锚点，不直接平差 |
| Javad/Topcon/南方/中海达/华测/司南接收机原始文件 | JPS、TPS、STH、ZHD、HCN、CNB 厂商扩展 | 合成不透明字节 | 扩展名只提供低置信度识别，不宣称解析厂商字节 | 保留原文件并要求受审计 GNSS 解算 |
| Trimble 原始文件 | T00、T01、T02、T04 | 合成不透明字节 | 未打包厂商转换器 | `converter-required` |

### Total Open Station 公开样本（仅外部对照）

通过 `ego-browser` 在固定提交
[`95fc444ce2d8f6c663f19db7754e295f621e030a`](https://github.com/totalopenstation/totalopenstation/tree/95fc444ce2d8f6c663f19db7754e295f621e030a)
核验到 `sample_data/sokkia_sdr33.tops`、`sample_data/carlson_rw5/Leica1200.rw5`、
`sample_data/nikon_raw_v200/` 和 `sample_data/leica_gsi/`。仓库声明 GPL-3.0，但这些样本没有
独立的再分发许可说明，因此仅记录路径、提交和字段事实作为外部对照，不复制入 WorkWise，
也不把其结果当作厂商互操作或 `adjustment-ready` 证据。仓库内仍使用独立编写的 synthetic
SDR/RW5/GSI golden 与 negative fixture，避免将 GPL 样本或上游解析代码带入安装包。

厂商私有格式转换器必须另行记录可执行文件来源、固定哈希、版本、许可证、再分发结论、参数和网络隔离证明。本清单本身不批准任何转换器进入安装包。

### 本机授权挂载的 COSA 配对对照（2026-09-07）

以下结果来自用户已授权的 `/Volumes/MOVESPEED` 本机挂载。只读取原文件的大小、哈希、结构和结果摘要，未复制原始观测、点号或报告进仓库；对照工具输出也只保留哈希、计数和差异计数。7 组候选中 5 组通过同源核对，2 组被阻断或判为不一致。

| 配对范围 | 输入/结果字节数 | 输入/结果 SHA-256 | 只读对照结果 |
| --- | ---: | --- | --- |
| 望春桥站-泽民站-左线 `InPush(0627c01--0728c08)` | 14,568 / 70,189 | `2b409ac35577c1e1bac64f9d0b3d56298adf5d8fc9b4599ee321647fbfe1c290` / `15b79917baa0765d9bc0c5fd7ae74a43e4e88c39a017135d36e1aaf3b0d2e1f0` | `matched`; 3 known, 113 unknown, 290 sections, 116 heights; dof 177; max displayed-height difference `4.9744e-6 m` |
| 望春桥站-泽明站-右线 `s6g03-s7g48原始数据` | 5,033 / 32,129 | `7132cf3e774247bab97d85a65c217ad6ba92a2f6acb1aef8161184a9fbc11358` / `9c3f7e0f279b279b3d17d31973a780101f0002faf626805a0502a91932902734` | `blocked`; input 143 sections but paired report table 108 sections, `reference-source-count-mismatch`; not a passing pair |
| 梁芦区间 `InPush(0302c01--0314c03)` | 7,113 / 35,762 | `634f7b223e52ad4e80ba3a1c5dd027144d486d527269d0b4babac5e9a5d8ee525` / `8a4e663336147b1a3fad410f59b87be89fc0c95cd43573406e2d84b5d09df7f1` | `blocked`; same-stem report has 3 measured-height differences and 40 rounded-height mismatches; not accepted as a same-input reference |
| 芦徐区间 `InPush(0227c04--0227c16)` | 5,176 / 26,828 | `9b6b535de33d9a907ac49d5bbb5bb4bb8c69e69342dc0d1acf3297ba59290193` / `3498cf9781b0a76427c762814136a3ee3739c64e5a463e69428e1eb010d2b2ae` | `matched`; 2 known, 40 unknown, 103 sections, 42 heights; dof 63; max displayed-height difference `4.9246e-6 m` |
| 高梁区间 `InPush(02--0226c4)` | 8,035 / 40,091 | `1e7dbc246580ec688814b3d90f65aaf7d118bb35b456856a56a7139c3bfd2704` / `e80a264ddcb73ac69c58c504a8736165ef3efcfa4751ca3bb45a5d92882366bc` | `matched`; 2 known, 63 unknown, 160 sections, 65 heights; dof 97; max displayed-height difference `4.9979e-6 m` |
| 高高区间 `InPush(0223c01--0223c23)` | 8,865 / 43,475 | `b619461b31bb6d99c9a924e61abf2699af8414d198371851bac30f926cbcab35` / `268590d4e8fc467f4ea3142fa389e1387796f652795d8a9d239a4d4b66b74324` | `matched`; 2 known, 67 unknown, 176 sections, 69 heights; dof 109; max displayed-height difference `4.8076e-6 m` |
| 宁波 1 号线二期 B 测站 `InPush(b01--b13)` | 5,138 / 26,977 | `e4860e4053900958bd05b0c7d9cd46294bdda3bb8063c85bd04632cc889b3323` / `3a7905d1526f0157d2d7c456ab438065a741fba065086a89e8593a031284ca96` | `matched`; 3 known, 41 unknown, 102 sections, 44 heights; dof 61; GB18030 + known-point fullwidth-comma mapping; max displayed-height difference `4.8690e-6 m` |

这里的 `matched` 仅表示显式映射后的确定性水准网计算与报告打印精度一致，**不是**厂商格式互操作、安装包验收或专业人员签署。梁芦区间和右线样本的失败结果被保留，不能通过调整容差或忽略输入/结果配对问题来“验收”。

### 用户授权真实 COSA P0 闭环（2026-09-08）

用户授权的本机真实工程文件仅在原路径读取，未复制原始观测、点号或报告到仓库。以下证据只保留源文件和映射 SHA-256、记录计数、质量摘要以及成果文件哈希；交付文件写入隔离临时工作区并在脚本结束时删除。

| 源格式 | 输入 SHA-256 / 字节数 | 显式映射 | Runtime 闭环结果 | 成果文件 SHA-256 |
| --- | --- | --- | --- | --- |
| COSA `.in1` 水准网 `InPush(0325--z9).in1` | `c885737c43f6403bae6eacee84094e7feddb5d4ba2fd469b4d11994b101cf413` / 6,720 | [`cosa-in1-level-2known-ascii-mapping.json`](./cosa-in1-level-2known-ascii-mapping.json)，映射 SHA-256 `0844f29ecea6d808e1cf8f0fba757ed40778f11eaa691bf825500f50bb174313`；ASCII、2 条已知点、CSV 四字段测段，m/km | `completed`；134 条观测、61 点、75 自由度、1 次迭代；精度通过；与同源 `.ou1` 比对 `mismatches=0`，最大显示高程差 `4.9803e-6 m` | DOCX `c15e5e4e42b9c9e210af6ed3a7f8ea09f4eda78b3d89142dfa84b137b05135c0`；PDF `c80069db76d3193608c97937ac935bd03dc2c38e0a6561205d594e8405ca3a00`；XLSX `bc529121bf0c53d16d766c9f7f2fb0960f19caa8aa2317892d4dd2139288254a` |
| COSA `.in2` 平面控制网 `InPush(0325--z9).in2` | `187bac413941a65db23a3edbef9d82faef89c9bc61b4430d4df5a5c857cff709` / 8,769 | 严格 COSA `.in2` 解析器；UTF-8/ASCII 可解码、版本化先验精度与记录锚点 | `completed`；268 条观测、61 点、130 自由度、3 次迭代；精度通过；水平残差范数 `0.0101687545 m`，角度残差范数 `1.6203284e-5 rad` | DOCX `c8b0c97d938489140a3d30cafef0958a443ae12023ab650edeb58dddc6c0d4ba`；PDF `43a58640761c58abe8fcc1da503abf3a6bae5d42fa3566e342591c0eb229a942`；XLSX `a7afe813dd2ac9b8617e12d6719c2dec1c790727c176459c3e9053fe4e86f385` |

#### 第二组真实工程文件

| 源格式 | 输入 SHA-256 / 字节数 | 显式映射 | Runtime 闭环结果 | 成果文件 SHA-256 |
| --- | --- | --- | --- | --- |
| COSA `.in1` 水准网 `InPush(0325--y9).in1` | `9a543a6f0fa4c53b5dc8d9af7dc364f79de0ac151c50f1cdf2c4fcf06e1a72d4` / 5,811 | 同一显式 ASCII/2-known 映射，映射 SHA-256 `0844f29ecea6d808e1cf8f0fba757ed40778f11eaa691bf825500f50bb174313` | `completed`；116 条观测、52 点、66 自由度、1 次迭代；精度通过；闭合 `0.003672 m` | DOCX `08b06b6433eed1c9306b7cbd5adbb94f004d990a838ff60ceed22d8785bada45`；PDF `f315f3487550bd091974c2009aa3f38262d5948a7c9cd5b67f4980ec56487dac`；XLSX `2cd80fe89a74289bff917daec1b79abee6ed20648459f4063772d40a7bbfb9a3` |
| COSA `.in2` 平面控制网 `InPush(0325--y9).in2` | `9ea2215af9acc1506ed0a15064c32ff6986a4bfc65626566fa68cab52ec7061c` / 7,597 | 严格 COSA `.in2` 解析器；UTF-8/ASCII 可解码、版本化先验精度与记录锚点 | `completed`；232 条观测、52 点、115 自由度、2 次迭代；精度通过；水平残差范数 `0.0085327884 m`，角度残差范数 `1.5241666e-5 rad` | DOCX `9bc1bf4c98f95b73bdb3aa97631404ab34e21e64861070e1bdb685e627707e2d`；PDF `0d322f596a62fea8694b9418565fb930156e1f8bd0c471ca3347ba0e61e5cb92`；XLSX `c11bf268bf7483228c8f6667b7ecf050f701acf85c09ad4eefacf13fe1c826c8` |

这四条记录证明的是当前 Runtime 在用户提供的真实 COSA 样例上的导入、预检、确定性平差和成果文件闭环，不等同于厂商授权、安装包 GUI 验收、签名/公证或专业人员正式签署。`.in1` 的列布局必须通过随源文件保存的显式映射确认；未知布局继续阻断，不回退为猜测列序。

## NAS 授权的测量云 SUC 只读证据（P2）

在用户已授权的本机 NAS 挂载上进行了只读元数据核验：
`/Volumes/nas.railwise.cn/测绘地理信息部/2.泽民站地保/5-控制网复核/平面控制网/第{N}期/`（`N=3..28`）。共 26 期、
598 个 `.SUC` 文件，总字节数 956,556。按期号、相对路径、文件大小和单文件 SHA-256 排序组成的清单聚合 SHA-256 为
`efd8d2e37e58fe6a434637a8051e575b977678779f846a50a86c72dd5a813e3b`；该指纹不替代原始文件的授权或数值验收。

只读观察到的语法变体：每期 23 个文件，文本为 ASCII/UTF-8 可解码字节并使用 CRLF；每个文件包含四字段头记录、独立数字段记录和六字段数值记录。`Start/End` 日期字符串在不同期出现 `YYYY-MM-DD`、`YYYY.MM.DD HH:MM:SSZ`、制表符分隔及 `YYYY.MM.DDHH:MM:SS` 等形态；第 23 期还有外层引号风格变体。第 26 期原始 `End` 行的日期/时间分隔可使未规范化扫描误判为“末行异常”；规范化后复核确认 `End` 仍为最后非空记录，该情况应作为适配器的负向识别用例。

该挂载访问仅在用户已授权的 NAS 会话内进行，没有修改、重命名、删除或执行 NAS 文件；原始字节、观测值和工程文件均不复制进仓库。NAS 资料未附带供应商公开格式规格，字段语义、角度/距离/高程单位和基准均未经 PRD 或供应商确认。因此 SUC 按 F-FMT-11 保持 `archive-only`：只能做原件保留和结构识别，不得据此生成点位/观测/平差网或标记为 `adjustment-ready`，也不纳入仓库测量样本。
