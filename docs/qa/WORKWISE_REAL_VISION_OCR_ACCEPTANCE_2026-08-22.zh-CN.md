# WorkWise 真实视觉与 OCR 回环验收

日期：2026-08-22  
分支：`codex/workwise-plan-final-0.4.0`  
提交：`fe3eacc`

## 验收范围

本次验收使用 macOS Vision `VNRecognizeTextRequest` 真模型，通过临时的 `127.0.0.1` HTTP 适配器调用当前分支代码。它证明 WorkWise 的协议、证据结构和 PDF 页码处理可以接收真实模型结果；它不冒充用户配置的第三方 Unlimited-OCR 或 DeepSeek 服务验收。

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

## 结论

当前分支的真实本机 Vision/OCR 协议回环已通过。仍待使用用户实际配置的供应商端点完成外部服务验收；在此之前，审计中的供应商验收状态保持 `PARTIAL`。
