# 数据处理说明

本文件用于从 Excel、Word、PDF、CSV 中提取地保监测数据，并整理成可用于日报、周报、月报、预警判断的结构化数据。

## 目录

- 归一化 CSV 字段
- 穿越全站仪 CSV 字段
- 穿越静力水准 CSV 字段
- Excel 处理
- Word 处理
- PDF 处理
- 汇总计算
- 数据校核

## 归一化 CSV 字段

优先使用 `assets/data-input-template.csv`。字段说明如下：

| 字段 | 含义 |
|---|---|
| `report_date` | 报告日期或观测日期 |
| `period_label` | 日报/周报/月报期号 |
| `monitoring_item` | 监测项目名称 |
| `monitoring_method` | 自动化、人工、巡视、控制网 |
| `structure_zone` | 上行线、下行线、桥面、桥墩、车站、区间等 |
| `point_id` | 测点编号 |
| `current_change_mm` | 本次或本期变化量 |
| `rate_mm_per_d` | 变化速率 |
| `cumulative_mm` | 累计变化量 |
| `warning_threshold_mm` | 预警值；可为空 |
| `alarm_threshold_mm` | 报警值；可为空 |
| `control_threshold_mm` | 控制值；可为空 |
| `same_direction_count` | 连续同向次数；可为空 |
| `mean_rate_3_times_mm_per_d` | 连续三次平均速率；可为空 |
| `note` | 来源或备注 |

若某行提供了预警值、报警值、控制值，脚本必须优先使用该行阈值。

## 穿越全站仪 CSV 字段

穿越工况自动化全站仪快报优先使用 `assets/crossing-total-station-input-template.csv`。该模板保留通用字段，并增加高频出报字段：

| 字段 | 含义 |
|---|---|
| `project_name` | 项目全称 |
| `report_cadence` | 15min、2h、4h 或项目指定间隔 |
| `report_start`、`report_end` | 本次报告统计时段 |
| `initial_time` | 初始采集时间 |
| `previous_time` | 上次监测时间 |
| `current_time` | 本次监测时间 |
| `ring_no` | 盾构/顶管环号、里程或施工位置 |
| `position_label` | 点位或结构位置说明 |
| `influence_zone` | 是否在正投影/重点影响区，如 `正投影区`、`延伸范围`、`非重点区` |
| `validity` | `有效`、`缺测`、`遮挡`、`离线`、`复核中` 等 |

整理原则：

- `monitoring_method` 写 `自动化全站仪` 或 `测量机器人`，不要写成泛泛的“自动化”后丢失仪器类型。
- `current_change_mm` 为本次监测值相对上次监测值的变化量；`cumulative_mm` 为本次监测值相对初始值的累计变量。
- 2 小时和 4 小时报若同时需要“时段最大值”，仍应保留表内最新批次数据，并在汇总或备注中说明时段最大值。
- 若源表已按项目坐标方向计算水平位移，沿用源表；若只有坐标差，必须先按本项目方向轴转换后再填入。
- 缺测行可保留点号和分区，数值留空或 `/`，并在 `validity`、`note` 说明原因。

## 穿越静力水准 CSV 字段

穿越工况上海华桓静力水准沉降快报优先使用 `assets/crossing-static-level-input-template.csv`。该模板保留通用字段，并增加接口追溯字段：

| 字段 | 含义 |
|---|---|
| `project_name` | 项目全称 |
| `report_cadence` | 15min、2h、4h 或项目指定间隔 |
| `previous_time`、`current_time` | 华桓接口参考时间、本期时间 |
| `monitoring_item` | `结构沉降`、`道床沉降`、`沉降` 等，不写水平位移或倾斜 |
| `monitoring_method` | `上海华桓静力水准自动化监测平台` |
| `point_id` | 报表点号，默认取接口 `name`，映射后写确认后的报表点号 |
| `sensor_sn` | 传感器编号，取接口 `sn` |
| `current_change_mm` | 本次变化，取接口 `curOffset` |
| `cumulative_mm` | 累计变化，取接口 `totalOffset` |
| `current_value`、`previous_value` | 本期测值 `curValue`、参考测值 `refValue` |
| `current_original_value`、`previous_original_value` | 本期/参考原始值 |
| `shhh_project_id`、`shhh_point_id` | 华桓项目和测点追溯 ID |
| `sample_minutes` | `findSZByIdAndDate` 的 `sampMinutes`，单位分钟 |

整理原则：

- 华桓静力水准接口 `findSZByIdAndDate` 中 `type=2` 为沉降，`curOffset` 为本期变化，`totalOffset` 为累计变化；不要再用人工初始值或全站仪坐标公式二次反算。
- 报表截止时间和接口本期时间必须一致；历史补报时显式传入 `statDate` 和 `endDate`，不能用平台最新时间回填历史报表。
- `sampMinutes` 是接口取样时长，需按项目设置确认；不要自动等同于 15 分钟、2 小时或 4 小时报表频率。
- 单位优先用接口 `unit`；为空时按静力水准沉降 mm 口径处理，并在源摘要中留痕。
- 正负号方向必须写入报表备注；没有项目说明时先标注待确认。
- 缺测、离线、异常状态不得填 0；数值留空或 `/`，并在 `validity`、`note` 说明。

## Excel 处理

1. 使用 `openpyxl` 或 `pandas` 查看工作簿表页、尺寸、公式和值。
2. 优先读取辅助表：`info`、`监测日期`、`适配设置页`、`Z1`、`Z2`、`R1`、`R2`、`统计表`、`统计分析`。
3. 提取元数据：
   - 项目名称。
   - 委托/建设单位。
   - 监测单位。
   - 日期和期号。
   - 天气、温度、施工工况。
   - 报警状态和报警内容。
4. 提取监测行：
   - 测点编号。
   - 本次变化量。
   - 变化速率。
   - 累计变化量。
   - 监测项目、监测方法、监测部位。
5. 整理为归一化 CSV。
6. 需要判定状态时运行 `scripts/evaluate_alarms.py`。

### Excel 注意事项

- 有些工作簿含随机扰动公式或易变公式，不要随意重算。
- 有些公式引用已断裂，但显示值可能来自上次计算缓存；需要同时看公式和可见值。
- 表页名称和点号前缀因项目而异，不能只凭点号猜测监测项。
- 隐藏计算表往往比封面和前台页更可靠。

## Word 处理

Word 报告主要用于提取结构、标题、表格和固定措辞。需要提取：

- 标题层级和章节名称。
- 表格表头和行类别。
- 报告日期、编号和统计期。
- 工作量表。
- 监测数据汇总表。
- 预警/消警描述。
- 附件清单。

编辑既有 Word 时，应保留原有标题层级、表格顺序、签字栏和模板风格。

## PDF 处理

若环境有 `pdftotext`，先提取为临时文本文件再检索。没有时使用 `pypdf` 或 `pdfplumber`。

重点提取：

- 封面元数据。
- 监测分析报告。
- 汇总表。
- 报警阈值和正负号说明。
- 会议纪要或专家意见结论。

若 PDF 是扫描件或图片型，文本抽取为空时不要硬编内容，应转为 OCR 或请用户提供可编辑版。

## 汇总计算

每个“监测项目 + 监测部位”都应分别计算：

1. `本次最大点号`：本次变化量绝对值最大的点。
2. `本次最大值`：该点本次变化量。
3. `本次最大点对应累计值`。
4. `累计最大点号`：累计变化量绝对值最大的点。
5. `累计最大点对应本次变化量`。
6. `累计最大值`。
7. `状态`：正常、预警、报警、红色预警或待确认阈值。

不要把“本次最大”和“累计最大”强行合并。

## 数据校核

- 单位默认毫米；若源资料为米，必须换算。
- 正负号方向与报告备注一致。
- 日期与统计期一致。
- 自动化和人工数据不要混在同一统计区间。
- 行级阈值覆盖默认阈值。
- 状态判定与阈值表一致。
