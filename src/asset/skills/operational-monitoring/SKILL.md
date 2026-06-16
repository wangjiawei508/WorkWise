---
name: operational-monitoring
description: 城市轨道交通运营期结构长期变形监测通用作业技能。当用户讨论运营期沉降监测、内径收敛、净空断面、三维激光扫描、水平位移、联络通道监测、轨行区垂直位移、基准网联测与稳定性分析、一等水准/监测Ⅱ级水准、aBFFB、i角检验、限差校核、闭合差、科傻（COSA）平差、单位权中误差、偶然中误差/全中误差、测点埋设与验收、点位命名、初始值采集、期次外业、成果表生成、监测期报/总结/年报、预警与加密观测、超限点处置、监测资料归档、监测实施方案编制/专家评审/变更控制、变形控制标准/工后变形限值等任意主题时调用本技能。
argument-hint: 用户当前的运营监测作业问题或交付任务
user-invocable: true
---

# 运营期结构长期变形监测

## 适用范围

适用于城市轨道交通（地铁/城际/有轨）**运营期**对既有线本体及保护区周边结构开展的长期变形监测，监测对象包含：

- 车站、明挖矩形隧道、U 型槽、盾构区间、出入段线、车辆段、停车场的**结构与道床沉降**
- 联络通道（冷冻法、机械法/盾构法）沉降
- 道岔区、高架段、附属用房沉降
- 既有建（构）筑物垂直位移
- 盾构隧道**内径收敛**（手持激光测距 / 全站仪 / 三维激光扫描）
- 矩形盾构与机械法联络通道**净空断面**（三维激光扫描）
- 轨行区结构**水平位移**
- 巡视巡查、裂缝/病害观测（辅助）

不适用于建设期施工监测、基坑专项监测、轨道几何状态检测、自动化在线监测的硬件选型设计。

## 触发后请遵循的工作流

收到任务后，**先判别归属环节**，再加载对应的 reference。判别顺序：

1. **监测实施方案（编制 / 评审 / 变更）** → `./references/monitoring-scheme.md`
2. **规范体系 / 监测频率 / 等级限差** → `./references/regulations-and-frequency.md`
3. **测点布设、埋设、验收、命名** → `./references/monitoring-points.md`
4. **基准网（地面控制网 / 上下联测 / 工作基点稳定性）** → `./references/baseline-network.md`
5. **沉降外业（一等水准 / 监测Ⅱ级 / 中视附合）** → `./references/settlement-monitoring.md`
6. **内径收敛 / 净空断面 / 三维激光扫描** → `./references/convergence-monitoring.md`
7. **水平位移（全站仪）** → `./references/horizontal-displacement.md`
8. **平差、精度评定、变量计算、成果表** → `./references/data-processing.md`
9. **期次成果表/简报/期报** → `./references/period-report.md`
10. **总结报告 / 年度报告** → `./references/summary-report.md`
11. **预警判定、加密观测、处置闭环** → `./references/warning-and-disposal.md`
12. **资料归档与交付** → `./references/archive-and-delivery.md`

## 项目参数化输入（首次接触新项目时主动向用户确认）

| 参数 | 示例取值 | 影响 |
| --- | --- | --- |
| 线路 / 工程范围 | 全线 / 某区间 / 保护区 | 测点布置与频率 |
| 高程基准 | 1985 国家高程基准（二期） / 1956 / 当地 | 数据衔接 |
| 平面基准 | 相对坐标系 / 地方坐标系 / CGCS2000 | 水平位移成果 |
| 监测频率 | 1 次/月、2 月、3 月、6 月、年度等 | 期次编号 |
| 监测等级 | 沉降 Ⅱ级 / 一等水准 / 监测Ⅱ级 | 限差与仪器 |
| 工后变形控制值 | 一般 ≤15mm，敏感段 ≤10mm | 预警阈值 |
| 预警 / 报警阈值 | 由招标文件/方案/合同约定 | `warning-and-disposal.md` |
| 业主 / 监理 / 总包 | —— | 报送链路 |

> **缺省策略**：在用户未提供参数前，按 GB/T 50308-2017、GB 50911-2013 默认值给出建议，并显式声明"以项目方案/合同为准"。

## 核心技术红线（速查）

| 类别 | 关键限差 | 出处 |
| --- | --- | --- |
| 国家一等水准 | 往返不符 1.8√R mm；环闭合 2√F mm；检测较差 3√R mm | GB/T 12897-2006 |
| 监测Ⅱ级（垂直） | 测站高差中误差 ±0.15mm；附合/环闭合 ±0.3√n mm；检测较差 0.4√n mm；相邻基准点高差中误差 ±0.5mm | GB/T 50308-2017 |
| 监测Ⅱ级（视距） | 视距 ≤30m；前后视距差 ≤0.5m；累计 ≤1.5m；视线高 ≥0.3m；基辅读数差 ≤0.3mm；基辅高差差 ≤0.4mm | GB/T 50308-2017 |
| i 角 | ≤15″；日变化 <3″ | 一等水准要求 |
| 水平位移Ⅱ级 | 相邻基准点点位中误差 ±3.0mm；测角中误差 ±1.8″；最弱边相对中误差 ≤1/70000 | GB/T 50308-2017 |
| 收敛（激光测距） | 仪器精度 ±1mm；同一测线独立观测 3 次取中数 | 项目方案 |
| 三维激光扫描 | 拼接残差 ≤2mm；椭圆拟合粗差按 3σ 剔除 | 项目方案 |
| 基准点稳定性判别 | \|ΔH\| ≤ 2√2·m₀ ⇒ 稳定不改正 | GB 50911-2013 |

## 输出口径（默认）

- **数值精度**：高程 0.01mm；变形量 0.1mm；坐标 0.1mm；扫描点云 mm 级
- **正负号约定**：沉降量"沉降为负、隆起为正"；净空收敛"扩张为正、收缩为负"；水平位移"朝基坑/朝预警方向为正"——以项目方案约定为准，在每份成果表抬头明示
- **变量统计**：本期变化量 / 累计变化量 / 速率（mm/d 或 mm/月）/ 最大值点号 / 超限点点号
- **数据衔接**：测点重测时累计值必须从首次埋设开始累加，方案中应保留"原点号 vs 新点号"映射

## 行为约束

1. **不臆造规范条文与限差**。引用规范必须给出"GB/T ××× 第 X 节"或方案/合同条款号；不确定时直接告知用户需复核。
2. **不替用户决定项目级阈值**。预警/报警阈值、监测频率均以合同或专家评审通过的方案为准。
3. **不输出平台化建设建议**。本技能聚焦"通用作业流程与交付物"，不涉及监测系统选型、Agent 工场、平台架构。
4. **跨期数据必须可追溯**。任何"成果表 / 曲线图"产物，需说明初始值期次、本期号、相邻期号、平差软件与版本。
5. **超限即提示**。出现"测站超限、闭合差超限、稳定性超限、变形量超预警值"任一情况时，必须先提示停止外推结论、按 `warning-and-disposal.md` 进入复测闭环。

## 可复用资产（assets/）

落到具体交付物时，**优先复制 `./assets/` 下的模板/表头/脚本**填充，避免临场拍脑袋设计字段。

### 模板（`./assets/templates/`）
- [监测实施方案](./assets/templates/monitoring-scheme.md) — 5 篇章节骨架，覆盖工作大纲、QC、信息化、重难点、附录
- [期监测报告](./assets/templates/period-report.md) — 期报 8 节模板
- [总结/年度报告](./assets/templates/summary-report.md) — 阶段/年/总结报告模板
- [预警快报](./assets/templates/warning-bulletin.md) — 黄/橙/红快报正文
- [控制网联测报告](./assets/templates/control-network-report.md) — 限差校核 + 平差结论 + 稳定性
- [监测日报](./assets/templates/daily-log.md)
- [周报 / 月报](./assets/templates/weekly-monthly-report.md)
- [i 角检验记录](./assets/templates/i-angle-check.md)
- [测点埋设记录](./assets/templates/point-installation-record.md)
- [测点验收记录](./assets/templates/point-acceptance-record.md)

### 成果表表头（`./assets/schemas/`）
- [沉降成果表 CSV](./assets/schemas/settlement-result-table.csv)
- [收敛成果表 CSV](./assets/schemas/convergence-result-table.csv)
- [水平位移成果表 CSV](./assets/schemas/horizontal-result-table.csv)

### 脚本与清单
- [归档骨架初始化脚本](./assets/scripts/init-archive-tree.sh) — `./init-archive-tree.sh <项目根目录>` 一键生成 13 大类目录树
- [期次归档自检清单](./assets/checklists/archive-self-check.md)

> 模板中的 `{{...}}` 为占位符，使用时按项目实际值替换；表头 CSV 可直接导入 Excel/WPS 后填数。

## 推荐加载顺序

新项目启动（方案阶段）：`monitoring-scheme` → `regulations-and-frequency` → `monitoring-points` → `baseline-network` →（控制标准）`warning-and-disposal`

新项目启动（实施阶段）：`monitoring-points` → `baseline-network` → `settlement-monitoring` →（按需）`convergence-monitoring` / `horizontal-displacement` → `data-processing` → `period-report` → `archive-and-delivery`

日常期次作业：`settlement-monitoring` / `convergence-monitoring` → `data-processing` → `period-report` →（异常时）`warning-and-disposal`

季度/年度交付：`summary-report` → `archive-and-delivery`

## 参考资料索引

- [监测实施方案的编制](./references/monitoring-scheme.md)
- [规范与频率](./references/regulations-and-frequency.md)
- [测点布设、埋设、验收、命名](./references/monitoring-points.md)
- [基准网联测与稳定性分析](./references/baseline-network.md)
- [沉降监测外业](./references/settlement-monitoring.md)
- [收敛与三维激光扫描](./references/convergence-monitoring.md)
- [水平位移监测](./references/horizontal-displacement.md)
- [数据处理与精度评定](./references/data-processing.md)
- [期次成果表与期报](./references/period-report.md)
- [总结报告与年度报告](./references/summary-report.md)
- [预警与处置](./references/warning-and-disposal.md)
- [归档与交付](./references/archive-and-delivery.md)
