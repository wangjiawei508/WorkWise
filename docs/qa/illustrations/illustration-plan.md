# WorkWise 0.5.0 工程测量文档配图计划

## 来源文档

- 文档：`docs/plans/WORKWISE_0.5.0_FINAL_PLAN.md`
- 插入锚点：`## 目标` 之后，用于解释“外业观测 → 确定性平差 → 可审查成果”的产品闭环。
- 受众：工程测量专业人员、产品验收人员。

## 配图项

| 文件名 | 实际相对路径 | 插入位置 | 视觉目标 | 事实约束 | 风格 | 比例 |
| --- | --- | --- | --- | --- | --- | --- |
| `engineering-survey-observation-adjustment-delivery.png` | `docs/qa/illustrations/assets/engineering-survey-observation-adjustment-delivery.png` | 0.5.0 配图验收文档“实际插入映射”章节 | 读者立即理解工程测量从外业观测、网形与平差到报告/证据包的完整链路 | 设备与控制网关系可信；不展示虚构工程数值、品牌、现场人物或阈值 | 克制蓝灰色工程技术插画 | 4:3 |

## 生成与检查记录

- 生成能力：Codex 内置图片生成工具（无需读取第三方 `.env`、用户目录密钥或旧 Claude/Gemini 凭据）。
- 最终文件：PNG，`1448 × 1086`，RGB，非交错。
- SHA-256：`f559d24742cd61ff6f8986392dddd1db0fd3214294572d96cab7d913ac5b3938`。
- 像素检查：已检查主体、设备、网形、箭头方向、裁切、水印和品牌误用；未发现会阻断本次文档配图验收的问题。
- 降级项：图片中的表格只作为成果包意象，不作为任何工程数值证据；数值真值仍来自本地确定性运行时。

## 最终提示词

```text
Use case: scientific-educational
Asset type: 4:3 report illustration for the WorkWise 0.5.0 engineering-survey acceptance document
Primary request: Create a polished professional engineering surveying illustration that visually explains the chain from field observations to deterministic adjustment and reviewed deliverables.
Scene/backdrop: clean light-gray technical drafting surface, restrained blue-gray palette.
Subject: on the left a total station on a tripod and a digital level observing prisms and leveling staffs across a small control network; in the center a precise network diagram with control points, observations, residual vectors, and a subtle covariance ellipse motif; on the right a clearly reviewed report stack and spreadsheet evidence package, connected by a single orderly workflow.
Style/medium: crisp editorial vector illustration with technically credible surveying equipment and geometry, suitable for a formal Chinese engineering report.
Composition/framing: landscape 4:3, three connected stages, generous safe margins, high information density without looking like a web dashboard.
Lighting/mood: neutral professional daylight, calm and trustworthy.
Constraints: no people, no company logos, no brand marks, no readable sentences, no fake numeric data, no decorative glassmorphism, no neon gradients, no watermark. Keep equipment proportions plausible and the network geometry unambiguous.
Avoid: generic AI robot imagery, colorful card grids, illegible text, duplicated tripod legs, impossible instrument geometry.
```
