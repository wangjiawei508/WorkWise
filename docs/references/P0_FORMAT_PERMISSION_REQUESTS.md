# P0 格式样本与许可请求台账

本文是发送前的本地工作底稿，不构成已获许可的证明，也不包含任何项目数据、客户数据或未经授权的厂商样本。

## 使用规则

- 只有收到有权主体的书面回复后，才可下载、留存、解析或纳入相应样本。
- 每份书面回复必须逐项明确：允许的样本、版本、脱敏状态、留存范围、私有测试范围、私有化交付再分发范围、公开再分发范围、署名/保密/期限要求。
- 未确认的范围一律视为“不允许”；公开再分发默认“不允许”。
- 即使获得材料，也仍须完成 PRD 规定的独立 golden/negative、单位与基准映射、候选包端到端验收，才可考虑从 `archive-only` 提升。

## 1. Leica GSI16：Landgate Boya 校准记录的替代脱敏样本

| 项目 | 内容 |
| --- | --- |
| 状态 | 草稿待发送；尚未联络、尚未下载任何未授权记录 |
| 建议收件人 | `geodesy@landgate.wa.gov.au`（Landgate Geodesy 官方联络邮箱） |
| 来源依据 | [Landgate Geodesy](https://www.landgate.wa.gov.au/location-data-and-services/surveying/geodesy/)、[仪器校准设施说明](https://www.landgate.wa.gov.au/location-data-and-services/surveying/instrument-calibration/)、[数据许可说明](https://www.landgate.wa.gov.au/location-data-and-services/discovering-landgate-data/licensing/) |
| 请求目标 | 获得可用于 parser/回归测试的脱敏 Leica GSI16 校准或原始观测样本，或获得明确的书面许可与适用条款 |
| 特别边界 | 不请求、不下载、不复制 Medjil 中线索所指的原始 `M_210112BOYA.GSI`；若对方不允许，则该线索继续保持不可用 |

**主题：** Request for permission to use a de-identified Leica GSI16 calibration fixture for parser testing

```text
Dear Landgate Geodesy Team,

I am developing WorkWise Survey, a local engineering-survey data workbench. We identified a possible Leica GSI16 calibration-record lead associated with the Boya Staff Calibration Range in a public source tree. We will not download, redistribute, or use that record without written permission.

Could Landgate provide either:
1. a de-identified Leica GSI16 calibration/raw-observation fixture suitable for parser and regression testing; or
2. written permission and the applicable licence/attribution terms for retaining and redistributing a de-identified equivalent fixture?

We would preserve the original bytes, source/version/date, SHA-256, data classification, and licence notice. The fixture would be used only to validate import and diagnostic behaviour; no location, instrument serial number, account, certificate, or personal data is needed. We would not represent any result as Landgate endorsement or a calibration result.

We would also appreciate confirmation of any restrictions on modification, private-delivery redistribution, publication, or derivative test files.

Regards,
WorkWise Survey engineering
```

## 2. COSA / COSAWIN：全套输入、网络与输出样本

| 项目 | 内容 |
| --- | --- |
| 状态 | 草稿待发送；尚未联络、尚未取得样本或许可 |
| 首轮收件人 | `nxluo@sgg.whu.edu.cn`（罗年学，测量数据处理软件设计）；`jmguo@sgg.whu.edu.cn`（郭际明，测量控制网数据处理） |
| 首轮抄送 | `ipisc@whu.edu.cn`（武汉大学知识产权信息服务中心；仅请求确权/转介，不假定其为授权签字方） |
| 正式许可升级路径 | 武汉大学科技成果转化服务中心（技术转移中心）`027-68761162`；先索取有权签署人、业务邮箱与流程，不猜测邮箱 |
| 来源依据 | [罗年学官方主页](https://www.sgg.whu.edu.cn/info/1395/1212.htm)、[郭际明官方主页](https://www.sgg.whu.edu.cn/info/1429/2128.htm)、[武汉大学知识产权信息服务中心服务页](https://ipisc.whu.edu.cn/servicegoods)、[测绘学院技术许可公示](https://main.sgg.whu.edu.cn/info/1381/40531.htm)、[武汉大学出版社对 COSA 的研制归属说明](https://www.wdp.com.cn/books/2024-08-28/10878.html) |
| 请求目标 | 已脱敏 `.in1`、`.in2`、`.NET` 与匹配 `.ou1`、`.ou2` 的最小可复现实例、格式/版本说明，以及分层使用许可 |
| 特别边界 | 两位教授可协助技术确认与材料来源判断，但不能被假定为可单独授予版权或再分发权；必须由武汉大学有权主体书面确认 |

**主题：** 申请 COSA/COSAWIN（CODAPS/LEVEL）脱敏测试样本及格式兼容验证授权

```text
罗年学教授、郭际明教授：

您好！我们正在开发工程测量数据工作台的私有测试能力，拟对 COSAWIN/COSA-CODAPS 与 COSA_LEVEL 的文件进行兼容性解析和结果校验。公开资料显示相关系统由武汉大学测绘学院研制，故先向二位请教；如您并非有权处理该事项的联系人，恳请指引至贵校有权的成果转化/知识产权部门。

为避免使用未经授权的资料，烦请在贵校确有权提供且已完成脱敏的前提下，考虑提供或告知申请途径：
1. 最小可复现实例：脱敏 .in1、.in2、.NET 及其对应 .ou1、.ou2 文件（如不同版本的扩展名或对应关系不同，请一并说明）；最好包含一组正常样本及一组不含敏感信息的错误/边界样本。
2. 与样本匹配的格式说明：软件/导出版本与配置、字符编码、记录/字段含义与顺序、单位、坐标系/投影/高程基准、必要的外部参数，以及可用于核验的预期结果或判定规则。
3. 书面许可范围：是否允许我们将样本和预期结果在受控私有代码库/测试环境中留存、复制并用于自动化回归测试；是否允许随私有化交付包再分发；是否允许任何公开或第三方再分发。我们接受将公开再分发默认明确为“不允许”，并会严格按您书面限定的范围、期限和署名/保密要求执行。

我们不请求软件安装包、源代码或反编译资料；收到材料前不会将任何样本纳入产品、测试库或对外发布。若需签署保密协议、材料使用协议或走正式流程，请告知所需材料、联系人和办理方式。

感谢您拨冗指导！

[姓名]
[单位/项目]
[电话]
[工作邮箱]
```

## 3. 南方 PA2005：DAT/TXT 导出格式与 Q-11 确认

| 项目 | 内容 |
| --- | --- |
| 状态 | 草稿待发送；尚未联络、尚未取得样本或字段定义 |
| 首选收件人 | `mail@southsurvey.com`（南方国际官网当前 Contact Info 公示邮箱） |
| 电话升级路径 | `400-7000-700` 转 `1`，请求转接“软件产品技术支持/平差软件维护负责人”；只索取正式流程和有权书面答复渠道，不口头确认格式或许可 |
| 备用收件人 | `master@southsurvey.com` 仅见于 2018 年官方迁址公告；不作为首轮收件人，仅在首选邮箱无回应时再考虑抄送 |
| 来源依据 | [南方国际 Contact Info](https://www.southinstrument.com/contact/)、[南方中文官网联系我们](https://pm.southsurvey.com/about/id/6.html)、[官方软件下载中心](https://nc.southsurvey.com/download/cid/3.html)、[官方 C10 用户手册](https://pm.southsurvey.com/static/uploads/downfiles/20250911/C10%E6%89%8B%E7%B0%BF%E7%94%A8%E6%88%B7%E4%BD%BF%E7%94%A8%E6%89%8B%E5%86%8C-20231109%281%29-1757582022.pdf)；[政府公开监测报告](https://www.zhanjiang.gov.cn/attachment/0/181/181626/1727320.pdf)将产品记为“南方测绘仪器公司‘平差易PA2005’”，用于核对渠道归属 |
| 请求目标 | PA2005 对应版本/模块的 DAT/TXT wire-format 书面确认，尤其是 Q-11 的精确定义、字段顺序与编码；如可行，再取得无可识别项目坐标的最小脱敏样本及分层使用许可 |
| 特别边界 | 不把其他机型 TXT 手册、现有公开下载项或电话答复视为 PA2005 格式规范；没有书面确认时，Q-11 不设默认列序，格式继续 `archive-only` |

**主题：** 申请书面确认 PA2005 DAT/TXT 导出格式及脱敏测试样本授权

```text
南方测绘软件产品技术支持/平差软件维护负责人您好：

我们正在实现工程测量数据导入兼容，不请求软件、注册码或客户工程数据。烦请书面确认 PA2005（请注明适用版本/模块）DAT/TXT 导出格式：
1. DAT/TXT 的固定列序、字段名/编码/含义、分隔符、字符集、行结束符、可选/空字段、数值单位与角度表示、坐标/高程基准，以及点号和观测类型编码；尤其请确认“Q-11”的精确定义、字段顺序、编码与最小示例。
2. 如可提供，请授权我们仅限内部私有自动化测试使用一份完全脱敏、无可识别项目坐标的最小原始样本（以及对应解析期望/反例）。请明确允许边界：内部测试、源代码/二进制再分发、公开展示、署名、保密要求。
3. 请确认资料/数据的版权或授权主体、授权范围和有效版本/日期。未获书面确认的资料不会纳入产品样本。

如需 NDA、申请表或指定工单流程，请告知。谢谢。

此致
[姓名/单位/联系方式]
```

## 发送前检查

- [ ] 核对每个地址仍来自官方页面，且没有把个人技术联系人误记为授权人。
- [ ] 不附加任何项目/客户数据、现有 fixture、二进制、日志或未授权样本。
- [ ] 不承诺采购、合作、公开发布、产品兼容性结论或许可对价。
- [ ] 实际发送人、姓名、单位、电话和工作邮箱由项目负责人确认后填写。
- [ ] 发送动作本身经项目负责人即时确认。
