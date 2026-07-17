# WorkWise 0.2.9 RC 产品经理最终复测

测试日期：2026-07-17（Asia/Shanghai）  
候选应用：`/Users/wangjiawei/Documents/WORKGPT-menu-localization/dist/mac-arm64/WorkWise.app`  
方式：Computer Use，只读检查；未操作 `/Applications/WorkWise.app`，未删除或覆盖成果文件。

## 总体结论

**阻断发布。** 无 Key 首次进入时虽然已经提供清楚的“先使用本地写作”入口，但用户在引导页选择“简体中文”后点击该入口，工作台、默认 `welcome.md` 和 macOS 菜单仍回到英文；隔离设置文件也保持 `locale: en`、`revision: 0`。这是首次核心路径的语言保存回归。

Skill/CLI 可发现性与成果文件卡结构已基本正常；PPT Master 内容确认为 3.1.0+ 基线，但市场详情没有显示版本，且名称被渲染为 `Ppt Master`。

## 走查步骤与健康度

1. **无 Key 首次进入（不健康，P1）**：Key 为空时“先使用本地写作”按钮可见，提示“无需 API Key 也可本地写作和导出”，入口本身清楚；但所选简体中文未保存，进入 Write 后整页回到英文。
2. **中文 Welcome（不健康，P1）**：该首次路径打开的默认 `welcome.md` 仍为英文；与已选简体中文不一致。
3. **供应商预设占位（健康）**：当前候选既有复测证据显示未选择时为“请选择供应商预设”，添加按钮禁用，不再默认误导为 Xiaomi。
4. **帮助路径（健康）**：当前候选既有复测证据明确指向“左侧『插件』→ 技能或命令行工具”，与真实导航一致。
5. **Skill 与 PPT Master（基本健康）**：技能市场可搜索到并显示已添加；安装内容的 `SKILL.md` 明确写明“PPT Master 3.1.0+ 瘦身版，以官方 v3.1.0 为基线”。
6. **CLI（健康）**：飞书命令行工具、Office 文档工具、Ego 浏览器助手三项同时可见，均显示“已添加”，名称和安装形态可理解。
7. **成果文件卡（基本健康）**：`design_spec.md`、`spec_lock.md`、`WorkWise-候选版质量复测.pptx` 三张卡均有“另存为 / 在编辑器中打开 / 显示位置”；本角色按主任务要求未重复点击。主功能角色已经单独完成 9/9 实际动作验证。

## 问题分级

### P1 — 选择中文后“先使用本地写作”不保存语言

- 复现：全新无 Key profile → 首次配置选择“简体中文” → 点击“先使用本地写作”。
- 预期：进入中文 Write，macOS 菜单和默认 Welcome 同步中文；设置写入 `locale: zh`。
- 实际：Write、菜单和 Welcome 均为英文；设置仍为 `locale: en`、`revision: 0`。
- 影响：所有无 Key 首次中文用户必现，直接违背“安装时选中文后全界面中文”的核心验收要求。
- 发布判断：**阻断**。
- 证据：`01-local-writing-language-regression.png`。

### P3 — PPT Master 版本与标准名称未在市场详情中展示

- 市场标题显示 `Ppt Master`，不是产品标准写法 `PPT Master`。
- 详情只显示用途、安装状态和来源，不显示 3.1.0+；用户无法从产品界面确认已更新版本。
- 安装内容本身已确认是 3.1.0+，因此不阻断功能发布，但建议在详情增加“版本/基线”字段并固定品牌大小写。
- 证据：`03-ppt-master-discoverability.png`，以及安装目录 `SKILL.md` 首段。

### P3 — 窄写作助手中的 PPT 文件名与类型过度截断

- PPT 卡片可见名称只剩 `WorkWise-候选版...`，类型只剩 `applicatio...`。
- 三个操作按钮仍可见，不影响主要动作；建议用“PowerPoint 演示文稿 · 38 KB”替代 MIME，并给完整文件名 tooltip/可访问描述。
- 证据：`04b-artifact-cards-ppt.png`。

## 证据

- 本轮首次路径：[01-local-writing-language-regression.png](./01-local-writing-language-regression.png)
- CLI 三项同时可见：[02-cli-discoverability.png](./02-cli-discoverability.png)
- PPT Master 详情：[03-ppt-master-discoverability.png](./03-ppt-master-discoverability.png)
- Markdown 成果卡：[04a-artifact-cards-docs.png](./04a-artifact-cards-docs.png)
- PPT 成果卡：[04b-artifact-cards-ppt.png](./04b-artifact-cards-ppt.png)
- 供应商占位（当前候选既有证据）：`../frontend/13-retest-provider-placeholder.png`
- 帮助真实路径（当前候选既有证据）：`../frontend/14b-retest-help-skill-cli-path.png`

## 证据边界

- 同一候选 app path 已由功能角色占用，产品角色为避免干扰其会话，使用候选包的逐字节副本和全新 `--user-data-dir` 复测首次路径；应用页面来源明确指向该副本内同一 `app.asar`。
- 应用默认写作空间仍指向 `~/.workwise/write_workspace`，因此本轮只观察，未编辑、删除或覆盖其中内容。
- 成果文件卡按钮实际动作由功能角色覆盖；本报告只评价卡片名称、可发现性与文案。
- 截图和 AX 树不能证明完整 WCAG 合规。

