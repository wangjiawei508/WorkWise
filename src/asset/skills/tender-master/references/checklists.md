# 基准表 / 台账 / 质检 / 评审模板

## 三份基准表模板（步骤②，列结构固定不可改）

### 评分对标表（前3列AI填，后列人工）
| 编号 | 评分项名称 | 分值 | 得分条件 | 拟响应章节(人工) | 自评满足度(人工) |
| --- | --- | --- | --- | --- | --- |
| P-001 | | | | | |

### 技术响应表（★全链路锚点，前3列AI填）
| T编号 | 招标技术原文 | 招标参数要求 | 是否★/实质性 | 响应章节(人工) | 偏离判定(人工) | 佐证(人工) |
| --- | --- | --- | --- | --- | --- | --- |
| T-001 | 核心交换机背板带宽≥2Tbps | ≥2Tbps | 否 | | | |

> 每行 T-NNN = 目录一个子节 = 提示词一条 = 正文一个响应小节，一一对应不可断链。

### 废标核查表（前2列AI填）
| 编号 | 废标条款原文 | 废标类型 | 触发条件 | 是否★ | 我方核查(人工) | 状态(人工) |
| --- | --- | --- | --- | --- | --- | --- |
| F-001 | | | | | | |

---

# Bid Checklists

## Requirement Ledger Template

Use this table shape for extracted requirements:

| ID | Source | Clause | Type | Requirement | Risk | Response Location | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-001 | file/page/section | clause number | mandatory/scored/contractual/format/evidence | exact or concise paraphrase | blocker/high/medium/low | chapter/section/form | certificate/case/letter/data | open/covered/待确认 |

## Extraction Checklist

- Scoring method and point allocation
- Pass/fail clauses and disqualification items
- Vendor qualification, certificates, licenses, authorizations
- Product or service technical parameters
- Functional requirements and acceptance criteria
- Implementation schedule, milestones, staffing, delivery location
- After-sales, training, warranty, SLA, maintenance
- Security, data, privacy, localization, integration, compatibility
- Contract deviations, payment, penalties, IP, confidentiality
- Required response forms, seals, signatures, copies, file formats
- Clarification deadlines, bid opening time, submission channel

## Chapter Brief Template

Use this before drafting a chapter:

| Field | Content |
| --- | --- |
| Chapter | number and title |
| Goal | what the evaluator should believe after reading |
| Source requirements | requirement IDs and tender anchors |
| Scoring intent | points this chapter should win |
| Claims allowed | only claims supported by tender text or user evidence |
| Evidence needed | certificates, cases, screenshots, staffing, diagrams, tables |
| Structure | section outline |
| Must avoid | unsupported promises, contradictions, forbidden deviations |
| Acceptance checks | coverage, clarity, formatting, evidence, risk |

## Quality Checklist

Blocker checks:

- Missing response to a mandatory or scored requirement
- Unsupported qualification, certificate, case, authorization, staffing, or product claim
- Tender deadline, submission format, seal/signature, or form requirement omitted
- Contradiction between chapters or with tender clauses
- Placeholder text such as `TODO`, `待补充`, `公司名称`, `项目名称`, or template-only language
- Scope, price, schedule, warranty, or legal commitment invented by the agent

Warning checks:

- Repeated generic prose without evaluator-specific value
- Long sections that do not map to scoring criteria
- Weak evidence matrix or missing attachment reference
- Unclear ownership, timeline, acceptance method, or risk control
- Diagram or table lacks direct connection to requirements

## Expert Review Scorecard

Use a 0-5 score for each reviewer dimension:

| Reviewer | Main Question | Score | Findings | Revision Target |
| --- | --- | --- | --- | --- |
| Compliance officer | Can this pass formal and qualification review? | 0-5 | blockers/warnings | clause/chapter |
| Technical architect | Is the technical solution feasible and responsive? | 0-5 | gaps/risks | chapter/diagram |
| Scoring evaluator | Does it maximize rubric points? | 0-5 | weak points | scoring item |
| Delivery lead | Can the team deliver and operate it? | 0-5 | staffing/schedule/service | chapter/table |
| Commercial/legal reviewer | Are commitments controlled and contract-safe? | 0-5 | legal/business risks | clause/appendix |

After review, output:

1. Overall score and pass/fail risk.
2. Top blockers.
3. Highest-score-impact revisions.
4. Evidence needed from the user.
5. Recommendation: continue drafting, revise, or stop for user confirmation.
