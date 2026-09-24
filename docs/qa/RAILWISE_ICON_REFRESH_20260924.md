# 2026-09-24 用户图标替换

采用用户提供的 `ChatGPT Image 2026年9月24日 12_10_29.png`，原图保存在 `src/asset/img/railwise-icon-source.png`。保留左右两种蓝色飘带标识，裁掉展示背景，圆角以透明像素保留，没有重新生成或重绘标识。`npm run generate:icons` 可从原始 PNG 重建全部资源；沿用历史资源路径和安装身份。

| 位置 | 行为 |
| --- | --- |
| macOS 运行中 Dock | 启动时依据系统明暗主题选择，系统主题变化时实时更新；保留标准留白 |
| macOS Finder、未运行的应用、DMG | 浅色静态 ICNS。没有声明支持系统 Icon Composer 的 Dark/Tinted 图标选择 |
| Windows EXE、安装器、快捷方式、窗口/托盘 | 固定右侧深色 ICO/PNG；不依赖 Explorer 自动选择主题图标 |
| 应用内会话活动标识 | 跟随应用主题切换浅色/深色 PNG |
| Linux | 静态深色 PNG |

生成的 ICO 包含 16/24/32/48/64/128/256 像素，ICNS 包含 16 至 1024 像素及 Retina 资源。图片放大不能增加原始细节。首轮 `iconutil` 转换失败，未使用残留旧 ICNS；最终由已存在的跨平台 Resvg/ICNS 生成器生成，已检查元素尺寸和透明边缘。

源码验证：图标加载和活动标识 17 项通过；桌面 TypeScript、相关 ESLint、生产构建通过。待补本增量的精确安装包显示和 macOS Dock 深浅切换证据，Windows 实机 Explorer 图标缓存行为尚未验收。`b9ea004` 整改链候选不包含本图标增量。
