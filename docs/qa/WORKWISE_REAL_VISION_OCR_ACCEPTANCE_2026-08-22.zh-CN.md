# WorkWise 真实视觉与 OCR 回环验收

日期：2026-08-22
分支：`codex/workwise-plan-final-0.4.0`
提交：`175ef10`（UI 修复）；多模态接入待本轮提交

## 验收范围

本次验收覆盖两条真实模型路径：macOS Vision `VNRecognizeTextRequest` 回环，以及用户当前配置的 DeepSeek `deepseek-v4-flash-vision-exp`。前者证明本地 OCR 协议、证据结构和 PDF 页码处理；后者通过 WorkWise Runtime 的附件上传、模型能力声明和真实图片问答闭环验证。

## 图片视觉证据

- 输入：真实扫描页 `/private/tmp/workwise-uocr-page-1.png`。
- 客户端：`kun/dist/vision/vision-evidence-service.js` 的 `HttpVisionEvidenceService`。
- 服务：`Apple-Vision-VNRecognizeTextRequest`，仅监听 `127.0.0.1`。
- 结果：`status=ready`，返回 OCR 文本、结构化摘要、18 个布局项和语义字段。
- OCR 关键内容：`Settlement point BM-01 is stable.`、`Measured displacement: +1.24 mm.`。

## 多页 PDF OCR

- 输入：`/private/tmp/workwise-uocr-complex-scan.pdf`，两页图像型扫描文档。
- 结果：健康检查通过，身份为 `service=Unlimited-OCR;version=macos-vision-loopback-1;model=Apple-Vision-VNRecognizeTextRequest`。
- 结果文件包含 `<!-- page:1 -->`、`<!-- page:2 -->`，且页码排序正确。
- 关键内容校验通过：`Settlement point BM-01 is stable.`、`WORKWISE-UOCR-REAL-MODEL-ROUNDTRIP`、`delta_H = H_current - H_initial`。
- 端到端耗时：`2073 ms`。

## DeepSeek 多模态 Runtime 闭环

- 模型：`deepseek-v4-flash-vision-exp`，官方 DeepSeek API，未切换 OpenAI Official，也未修改用户持久化配置。
- Runtime capability manifest：`inputModalities=[text,image]`、`outputModalities=[text]`、`messageParts=[text,image_url]`。
- WorkWise Runtime 通过 `/v1/attachments` 上传 `/private/tmp/workwise-uocr-page-1.png`，再用同一附件启动真实 turn。
- 结果：turn `completed`，模型返回 `UNLIMITED OCR REAL MODEL ACCEPTANCE`；裸 API 与 Runtime 路径结果一致。
- 计费归类：该实验模型按 DeepSeek V4 Flash 价格档处理；视觉输入不走 Base64 文本回退。

## 结论

当前分支的本机 Vision/OCR 回环和用户实际 DeepSeek 供应商端点验收均已通过。文本模型的 Unlimited-OCR 回退仍按既有独立链路保留；本次多模态模型可直接接收图片，不依赖该回退。
