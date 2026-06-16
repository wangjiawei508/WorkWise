# 穿越工况上海华桓静力水准沉降快报

本文件用于盾构、顶管、管廊、基坑、桥梁等风险源穿越轨道交通控制保护区时，从上海华桓自动化监测平台获取静力水准沉降数据，并按 15 分钟、2 小时、4 小时或项目指定频率生成沉降快报。静力水准只处理沉降/竖向位移，不使用全站仪平差坐标、水平位移或桥墩倾斜计算规则。

若项目为地下盾构穿越既有地下区间，且用户提供通途西路类工程师模板，需要把全站仪平面变形和静力水准沉降合成一个完整 workbook，应同时读取 `crossing-underground-shield-combined-report.md`。本文件只负责华桓平台/API 的沉降数据口径。

## 平台和接口

- 常见平台入口：`http://yun.shhhcl.com/project/login#{{页面或项目入口号}}`。
- 登录接口由前端调用 `/project/login/do`，密码前端使用 md5，部分页面启用验证码；用于浏览器登录和查项目，不建议把网页登录作为正式取数唯一依据。
- Apifox 接口文档：`https://s.apifox.cn/6e0dc985-00ab-4113-ae3b-9ed366ab85cb`。
- 接口服务器：`http://yun.shhhcl.com/TESTAPI`。

关键接口：

| 接口 | 用途 | 关键参数 |
|---|---|---|
| `POST /API/finddateById` | 获取项目最新本期/上期时间 | `id` 项目 ID |
| `POST /API/findSZByIdAndDate` | 获取沉降等“其他数据”本期变化和累计变化 | `id`、`statDate`、`endDate`、`type=2`、`direction=0`、`sampMinutes` |
| `POST /API/historyCurveByprojectId` | 获取两个时间之间原始数据 | `id`、`statDate`、`endDate`、`decimalCount` |

`findSZByIdAndDate` 的 `type` 枚举中 `2` 为沉降；其他类型包括水位、固定测斜、倾角、收敛、自动测斜、GNSS 等。静力水准沉降快报固定使用 `type=2`，除非项目接口文档另行确认。

## 必需输入

| 类别 | 内容 |
|---|---|
| 平台信息 | 平台 URL、项目 ID、登录账号或已登录 Cookie |
| 报表口径 | 出报间隔、报表截止时间、上期参考时间、取样时长 `sampMinutes` |
| 项目信息 | 项目全称、监测单位、施工单位、涉及线路和结构、施工工况 |
| 数据口径 | 静力水准测点列表、点名映射、分区、影响区、阈值、正负号说明 |
| 模板资料 | 快报模板、完整报表模板、点位图、影响范围图、现场照片 |

用户只给平台和用户名时，先提示：

```text
要生成华桓静力水准穿越期沉降快报，请补充：平台密码或已登录 Cookie、华桓项目 ID（若没有我先登录平台按用户名可见项目查找）、出报频率、报表截止时间、上期参考时间或上一期报表、取样时长 sampMinutes、当前施工工况、测点分区/点名映射、报警阈值、报表模板和图片资料。正式计算优先用接口 findSZByIdAndDate 的 curOffset/totalOffset，不用截图手抄。
```

## 取数路线

### 路线 A：接口直取

已知项目 ID 时优先走接口，不需要网页登录：

```bash
python scripts/fetch_shhh_static_level.py \
  --api-base "http://yun.shhhcl.com/TESTAPI" \
  --project-id "{{项目ID}}" \
  --project-name "{{项目全称}}" \
  --report-cadence "4h" \
  --report-cutoff-time "{{YYYY-MM-DD HH:mm:ss}}" \
  --previous-time "{{YYYY-MM-DD HH:mm:ss}}" \
  --samp-minutes 60 \
  --warning-threshold-mm 5 \
  --alarm-threshold-mm 7 \
  --control-threshold-mm 10 \
  --output-dir "平台数据输出"
```

如果不传 `--report-cutoff-time` 和 `--previous-time`，脚本会调用 `finddateById`，使用平台返回的 `currentTimePoint` 和 `lastTimePoint`。补跑历史报表时必须显式传入时间，不能用平台最新数据回填历史报表。

### 路线 B：网页登录找项目

未知项目 ID 时，先登录 `http://yun.shhhcl.com/project/login#{{入口号}}`，在页面中按用户名可见项目筛选，记录项目 ID、项目名称和测点/分区。由于登录页可能启用验证码，自动脚本不应硬猜验证码；可使用浏览器、Chrome 会话或人工登录后 Cookie 完成项目确认。确认项目 ID 后回到路线 A 取数。

## 计算口径

- `本次变化量`：接口 `curOffset`，表示 `statDate` 相对 `endDate` 的本期变化。
- `累计变化量`：接口 `totalOffset`，表示本期相对平台初始值的累计变化。
- `本次测值`：接口 `curValue`；`参考测值`：接口 `refValue`。
- `变化速率`：源接口未给出时，按 `curOffset / 时间差天数` 计算，单位 mm/d；如果参考时间与本期时间相同或缺失，速率留空。
- `单位`：优先使用接口 `unit`；为空时按静力水准沉降 mm 口径处理，并写入摘要。
- `正负号`：以项目报表或方案为准；未确认时可暂写“+ 为隆起，- 为下沉（待项目确认）”。
- `阈值`：优先项目方案/安评/运营单位要求；缺失时状态写“待确认阈值”，不要套用其他项目阈值。

## CSV 字段

优先使用 `assets/crossing-static-level-input-template.csv`。脚本输出字段与通用报表 CSV 兼容，核心字段如下：

| 字段 | 含义 |
|---|---|
| `project_name` | 项目全称 |
| `report_cadence` | 15min、2h、4h 或项目指定间隔 |
| `previous_time`、`current_time` | 参考时间、本期时间 |
| `monitoring_item` | 通常写 `结构沉降`、`道床沉降` 或 `沉降` |
| `monitoring_method` | 固定写 `上海华桓静力水准自动化监测平台` 或项目确认名称 |
| `point_id` | 报表点号，默认取接口 `name` |
| `sensor_sn` | 传感器编号，取接口 `sn` |
| `current_change_mm` | 本次变化量，取 `curOffset` |
| `cumulative_mm` | 累计变化量，取 `totalOffset` |
| `current_value`、`previous_value` | 本期测值、参考测值 |
| `shhh_project_id`、`shhh_point_id` | 华桓项目和测点追溯 ID |

## 报表表达

- 报表标题写“静力水准自动化沉降监测快报”或项目模板指定名称。
- 数据来源写“上海华桓静力水准自动化监测平台”。
- 表格只保留沉降相关列：点号、位置/分区、本次变化、累计变化、状态、备注；不要保留全站仪水平位移、倾斜列。
- 最大值分开统计：本次最大点和值、累计最大点和值。
- 缺测、离线、异常值不得填 0；保留 `/` 并在备注写明数据状态。
- 结论应写本时段沉降数据是否平稳、是否达到预警/报警、是否需要加密监测或现场复核。

正常结论示例：

```text
本时段上海华桓静力水准自动化沉降监测数据总体平稳，各测点本次变化量和累计变化量均未达到预警值。后续按 {{4小时}} 频率持续采集，并结合现场施工推进情况关注重点影响区测点变化趋势。
```

## 交付检查

- 项目 ID、项目名称、点号和分区经过人工确认。
- 报表时间不得晚于接口实际数据时间；历史补报不得用未来数据。
- `curOffset` 和 `totalOffset` 没有被二次反算或覆盖。
- 本次最大和累计最大分别按绝对值统计。
- 阈值、正负号、单位写清楚；接口 `unit` 为空时在摘要中留痕。
- 输出 Excel 和 PDF 文件名包含项目名称、日期、名义小时和“静力水准沉降快报”。
