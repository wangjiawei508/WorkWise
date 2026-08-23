# WorkWise 真实视觉与 OCR 回环验收

日期：2026-08-22
原始验收分支：`codex/workwise-plan-final-0.4.0`
当前发布候选：`codex/release-0.4.0-final`，`b2402a5f8454baa649a0470cb7ae3aca91352a97`

## 验收范围

本次验收覆盖两条真实模型路径：macOS Vision `VNRecognizeTextRequest` 回环，以及用户当前配置的 DeepSeek `deepseek-v4-flash-vision-exp`。前者证明本地 OCR 协议、证据结构和 PDF 页码处理；后者通过 WorkWise Runtime 的附件上传、模型能力声明和真实图片问答闭环验证。

## 图片视觉证据

- 输入：真实扫描页 `/private/tmp/workwise-uocr-page-1.png`。
- 客户端：`kun/dist/vision/vision-evidence-service.js` 的 `HttpVisionEvidenceService`。
- 服务：`Apple-Vision-VNRecognizeTextRequest`，仅监听 `127.0.0.1`。
- 结果：`status=ready`，返回 OCR 文本、结构化摘要、18 个布局项和语义字段。
- OCR 关键内容：`Settlement point BM-01 is stable.`、`Measured displacement: +1.24 mm.`。

## 多页 PDF OCR

- 输入：`/private/tmp/workwise-real-ocr-input/combined.pdf`，两页图像型扫描文档。
- 结果：`service=Unlimited-OCR / Apple-Vision-VNRecognizeTextRequest`，页码 `[1,2]`、`pageSequenceValid=true`、`nonEmptyPages=2`。
- 关键内容校验通过：`VISION-ACCEPTANCE-042`、`Status: READY`。
- 端到端耗时：`1472 ms`；输出：`/private/tmp/workwise-real-uocr-output-b2402a5/unlimited-ocr.md`。

## DeepSeek 多模态 Runtime 闭环

- 模型：`deepseek-v4-pro`，使用用户现有第三方 DeepSeek 配置，未切换 OpenAI Official，也未修改正式安装版配置。
- WorkWise Runtime 通过结构化附件启动真实图片问答，结果：`thread=thr_2gpkj5ps`、`turn=turn_27lab8jr`、答案 `WW-VISION-20260823`。
- 事件证据包含 `ocr`、`layout`、`semantics`、`visual`；请求和日志均不含 `data:image` 或 `dataBase64`。

## 结论

当前候选的本机 Vision/OCR 回环和 DeepSeek `deepseek-v4-pro` 图片问答均已通过。文本模型的 Unlimited-OCR 回退仍按既有独立链路保留；飞书单聊 `/status` 也已在隔离候选中完成。macOS 通知点击定位尚未取得系统级点击证据，保持未完成状态。
