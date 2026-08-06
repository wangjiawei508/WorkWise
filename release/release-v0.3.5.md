# WorkWise 0.3.5

0.3.5 是 0.3.4 之后的 Design、Write、Flow 和 PPT 交付稳定版，重点修复真实 PPTX 导入、编辑、导出和重新导入链路中的几何保真问题。

## 关键变更

- 同步经审计的 PPT Master 4.3.0 运行包，并补齐从项目确认、Python 环境、生成、交付验证到 PPTX 导出的完整生产链路。
- 新增可编辑 PPTX 原生导入；保留可编辑文字、形状、图片和连线，对不适合编辑的页面保留整页参考图，并支持按页面重新导入。
- 修复真实 PPTX 第 7 页的箭头方向、负向线段、圆环描边和居中文字定位；完成 35 页工程监测汇报实测回归。
- 修复 Design 属性面板 React 更新循环、元素选择/目标定位和导入反馈；Design、Write、Flow 的工作区导航与侧栏状态保持稳定。
- 修复 Write 编制 PPT 的确认契约、交付文件验证和 Runtime 工具类型契约；提高 Windows SQLite 持久化测试在慢速 I/O 下的稳定性。

## 验证

- root 测试：227 个测试文件通过，1565 项测试通过。
- WorkWise Runtime：75 个测试文件通过，640 项测试通过。
- OpenSpec、品牌边界、文档依赖许可证、lint、typecheck、生产构建和 Electron smoke 全部通过。
- Windows 路径/持久化和 macOS/Windows Electron smoke 在 GitHub Actions 全部通过。

## 版本边界

已安装 0.3.4 的用户可通过稳定更新入口升级到本版。Extension 开放平台仍是后续路线，不属于 0.3.5 的已交付能力。
