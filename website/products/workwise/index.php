<?php
$workwiseIncludeRoot = __DIR__ . '/../../includes';
require_once $workwiseIncludeRoot . '/workwise_product.php';
$workwiseManifest = rw_workwise_manifest();
$workwiseDocs = rw_workwise_docs();
$currentPage = 'products';
$bodyClass = 'page-product page-product-workwise';
$pageTitle = 'WorkWise · DeepSeek V4 Pro 与可靠 AI 工作台';
$pageDesc = 'WorkWise 0.4.1 修复插件市场安装和自动更新恢复，并提供统一插件市场、DeepSeek Harness 结构化附件处理与清晰可读的桌面工作区。';
$pageKeywords = 'WorkWise,WorkWise 0.4.1,统一插件市场,Codex 插件,DeepSeek V4 Pro,DeepSeek Harness,结构化视觉,应用内更新,Skills,MCP,AI 工作台';
$pageHeroVisualKey = 'product-workwise';
$pageOgImage = 'https://www.railwise.cn/images/heroes/desktop/product-workwise.jpg';
$workwiseReleaseUrl = (string)$workwiseManifest['releaseUrl'];
$workwiseRepoUrl = (string)$workwiseManifest['repositoryUrl'];
$workwiseVersion = 'v' . (string)$workwiseManifest['version'];
$workwiseReleaseDate = (string)$workwiseManifest['publishedAt'];
$workwiseDownloads = array_map(static function (array $item): array {
  return [
    'platform' => (string)$item['name'],
    'platformClass' => strpos((string)($item['id'] ?? ''), 'macos-') === 0 ? 'is-macos' : 'is-windows',
    'file' => (string)$item['file'],
    'size' => (string)$item['size'],
    'url' => (string)$item['url'],
    'icon' => (string)$item['icon'],
    'desc' => (string)$item['description'],
  ];
}, is_array($workwiseManifest['platforms'] ?? null) ? $workwiseManifest['platforms'] : []);
$workwiseShots = [
  ['src' => '/products/screenshots/workwise/01-write-home.png', 'title' => 'Write 写作工作台首页', 'desc' => 'Code / Write 双工作台入口清晰。'],
  ['src' => '/products/screenshots/workwise/02-chat-start.png', 'title' => '新会话', 'desc' => '从问题开始，进入可沉淀的协作流。'],
  ['src' => '/products/screenshots/workwise/03-doc-outline.png', 'title' => '文档大纲', 'desc' => '按章节组织长文档。'],
  ['src' => '/products/screenshots/workwise/04-doc-editing.png', 'title' => '文档编辑', 'desc' => '边写边改，支持预览与交付导出。'],
  ['src' => '/products/screenshots/workwise/05-skills-market.png', 'title' => 'Skills 市场', 'desc' => '把经验沉淀成可安装资产。'],
  ['src' => '/products/screenshots/workwise/06-plugin-market.png', 'title' => '插件市场', 'desc' => 'MCP 与插件统一管理。'],
  ['src' => '/products/screenshots/workwise/07-mobile-chat.png', 'title' => '移动端接入', 'desc' => '连接移动端和后台任务。'],
];
$workwiseWriteShots = [
  ['src' => '/products/screenshots/workwise/01-write-home.png', 'title' => '双工作台入口', 'desc' => 'Code / Write 按场景切换。'],
  ['src' => '/products/screenshots/workwise/03-doc-outline.png', 'title' => '文档大纲', 'desc' => '长文档结构先行。'],
  ['src' => '/products/screenshots/workwise/04-doc-editing.png', 'title' => '文档编辑', 'desc' => '写作、预览、导出贯通。'],
  ['src' => '/products/screenshots/workwise/05-skills-market.png', 'title' => 'Skills 市场', 'desc' => 'AI Word 等能力可沉淀复用。'],
];
$workwiseCapabilities = [
  ['title' => 'DeepSeek V4 Pro 正式可用', 'desc' => '内置 V4 Pro 与 V4 Flash：主 Agent 默认 Pro，Write 行内补全默认 Flash；正式 Pro 提供 1M 上下文和最高 384K 输出。', 'icon' => 'fas fa-bolt', 'tone' => 'workwise-code'],
  ['title' => 'DeepSeek Harness 附件视觉证据', 'desc' => 'WorkWise Runtime 按模型能力发送结构化 text/image 部分；文本模型使用本机回环分析器生成 OCR、布局、语义和视觉摘要，失败时明确终止，不把图片退回为模型提示中的 Base64 文本。', 'icon' => 'fas fa-eye', 'tone' => 'workwise-write'],
  ['title' => '统一插件市场', 'desc' => '把 Skill、MCP 和 CLI 放进同一目录，按推荐、已安装、可更新、需配置、分类和来源筛选，并集中查看版本、许可证、权限、认证与健康状态。', 'icon' => 'fas fa-boxes-stacked', 'tone' => 'workwise-plugin'],
  ['title' => 'Codex 与 MCPB 兼容', 'desc' => '支持 WorkWise .wwx、Codex .codex-plugin、标准 .mcpb、Codex marketplace 和 MCP Registry；仅依赖 Codex App Connector 的能力会明确标注。', 'icon' => 'fas fa-puzzle-piece', 'tone' => 'workwise-skills'],
  ['title' => '可验证安装与回滚', 'desc' => '安装前检查来源、许可证、权限、哈希、路径和依赖，使用 staging 原子切换；权限扩张必须重新审查，并保留单版本回滚。', 'icon' => 'fas fa-shield-halved', 'tone' => 'workwise-update'],
  ['title' => '克制的原生玻璃界面', 'desc' => '玻璃效果仅用于启动窗口、标题栏和临时浮层；侧边栏、编辑器与文档区域保持实色、高对比和清晰可读。', 'icon' => 'fas fa-layer-group', 'tone' => 'workwise-session'],
  ['title' => 'Code 工作台', 'desc' => '围绕本地仓库理解、修改、测试与发布，提供 Repo Map、定义引用与诊断信息。', 'icon' => 'fas fa-code', 'tone' => 'workwise-code'],
  ['title' => 'Write 写作工作台', 'desc' => '从结构化写作到 DOCX、PDF 等交付，导出产物经过格式校验。', 'icon' => 'fas fa-pen-nib', 'tone' => 'workwise-write'],
  ['title' => 'Design 设计工作台', 'desc' => '多页画板、文档专属 Agent 会话和选中元素定向修改；支持可编辑 PPTX 原生导入，并为复杂页面保留整页视觉参考。', 'icon' => 'fas fa-object-group', 'tone' => 'workwise-update'],
  ['title' => 'PPT 生产与交付', 'desc' => '内置经审计的 PPT Master 4.3.0，从项目确认、Python 环境、生成、交付验证到 PPTX 导出形成完整链路。', 'icon' => 'fas fa-file-powerpoint', 'tone' => 'workwise-write'],
  ['title' => 'Flow Preview 工作台', 'desc' => '类型化节点、持久化执行、运行历史、发布校验和失败恢复，Preview 能力可视化编排复杂任务。', 'icon' => 'fas fa-diagram-project', 'tone' => 'workwise-update'],
  ['title' => '通用附件与本地检索', 'desc' => '支持 PDF、DOCX、XLSX、PPTX、TXT、Markdown、CSV 及 PNG/JPEG/WebP，长文档按需读取并保留页码、工作表或幻灯片来源。', 'icon' => 'fas fa-paperclip', 'tone' => 'workwise-write'],
  ['title' => '应用内更新', 'desc' => '接入 railwise.cn 更新源，下载、保存工作内容、建立检查点后再重启更新。', 'icon' => 'fas fa-arrows-rotate', 'tone' => 'workwise-session'],
  ['title' => '可靠任务执行', 'desc' => '任务、节点、检查点与租约可恢复；完成需满足最终响应和必要产物校验。', 'icon' => 'fas fa-list-check', 'tone' => 'workwise-session'],
  ['title' => '多智能体协作', 'desc' => 'DeepSeek V4 进入统一的 WorkWise Agent Runtime，通用、探索、审查、研究 Agent 可拆分子任务并保留状态与预算边界。', 'icon' => 'fas fa-people-arrows', 'tone' => 'workwise-skills'],
  ['title' => 'MCP V2 与安全凭据', 'desc' => '统一管理 MCP、OAuth PKCE 与凭据引用；令牌进入系统安全存储，不写入插件目录、普通 JSON、日志或命令参数。', 'icon' => 'fas fa-plug', 'tone' => 'workwise-plugin'],
  ['title' => '本地工作区与 Git', 'desc' => '四级信任、非破坏性 Git 检查点与预览回滚，方便长期项目稳步推进。', 'icon' => 'fas fa-laptop-code', 'tone' => 'workwise-local'],
];
$workwiseStatus = [
  ['label' => '正式可用', 'title' => '核心链路已可交付', 'text' => implode('、', $workwiseManifest['capabilityStatus']['stable'] ?? []) . '。', 'icon' => 'fas fa-circle-check'],
  ['label' => '预览能力', 'title' => '持续扩展智能体能力', 'text' => implode('、', $workwiseManifest['capabilityStatus']['preview'] ?? []) . '。', 'icon' => 'fas fa-flask'],
  ['label' => '发展方向', 'title' => '上游 Harness 兼容评估与能力扩展', 'text' => implode('、', $workwiseManifest['capabilityStatus']['roadmap'] ?? []) . '。', 'icon' => 'fas fa-route'],
];
$workwiseAdvantages = [
  ['title' => '从聊天到可靠任务', 'desc' => '任务在中断后可恢复；只有最终响应、必要节点和产物都校验通过才算完成。', 'icon' => 'fas fa-list-check'],
  ['title' => '插件安装先审查再执行', 'desc' => '来源、版本、许可证、权限、脚本、网络域和完整性摘要集中展示，第三方更新默认只通知。', 'icon' => 'fas fa-shield-halved'],
  ['title' => '在线目录也能离线追溯', 'desc' => 'Git 与 HTTPS 目录记录 ETag、commit SHA 和可信快照；离线时仍可查看上次同步结果与来源。', 'icon' => 'fas fa-cloud-arrow-down'],
  ['title' => 'PPT 往返编辑更可靠', 'desc' => '可编辑 PPTX 原生导入保留文字、形状、图片和连线；复杂页面可使用整页参考图并按页重新导入。', 'icon' => 'fas fa-object-group'],
  ['title' => '桌面工作区更可控', 'desc' => '四级工作区信任、凭据引用和非破坏性 Git 检查点，让复杂任务更容易回看与恢复。', 'icon' => 'fas fa-laptop-code'],
  ['title' => '写作与经验可以积累', 'desc' => 'Word 模板、AI Word 与经审计的专业 Skills，让写作、排版和方法复用进入同一套工作流。', 'icon' => 'fas fa-file-export'],
  ['title' => '附件先在本地处理', 'desc' => '文档和图片在本地解析，长文档按需检索；图片视觉证据只作为不可信参考，回答可以回到页码、工作表或幻灯片来源。', 'icon' => 'fas fa-paperclip'],
  ['title' => '更新过程可控', 'desc' => '首次点击只下载；再次点击才重启更新，应用会先保存编辑内容、列出活动任务并建立检查点。', 'icon' => 'fas fa-arrows-rotate'],
];
$workwiseExportFeatures = [
  ['title' => 'Word 模板系统', 'desc' => '内置学术论文、行政公文、商务报告和技术文档模板，可调整中西文字体、行距与缩进。', 'icon' => 'fas fa-file-word'],
  ['title' => '文档交付校验', 'desc' => 'DOCX、XLSX、PPTX、PDF 等成果在交付前进行格式校验，避免伪装文件混入成果。', 'icon' => 'fas fa-file-export'],
  ['title' => '设计与演示联动', 'desc' => 'Design 画板可导入和导出 PPTX，也可输出 PNG、SVG，或保存到 Write 工作区继续编排报告。', 'icon' => 'fas fa-object-group'],
  ['title' => '已审计专业 Skills', 'desc' => '专业能力包经过来源、路径、体积和交付边界检查，降低安装与复用风险。', 'icon' => 'fas fa-shield-halved'],
];
$workwiseUseCases = [
  ['title' => '长文档写作', 'desc' => '从 Markdown 到 Word / PDF，减少反复搬运。', 'icon' => 'fas fa-file-export'],
  ['title' => '桌面端 AI 工作区', 'desc' => '用图形化界面管理会话、模板、Skills 和项目资料。', 'icon' => 'fas fa-desktop'],
  ['title' => '项目资料整理', 'desc' => '把资料、会话和成果放进同一个工作区。', 'icon' => 'fas fa-folder-tree'],
  ['title' => '知识与模板沉淀', 'desc' => '将常用方法做成 Skills，团队直接复用。', 'icon' => 'fas fa-boxes-stacked'],
  ['title' => '投标与汇报材料', 'desc' => '梳理结构、提炼要点，辅助形成交付稿。', 'icon' => 'fas fa-list-check'],
  ['title' => '代码项目协作', 'desc' => '围绕本地仓库完成解释、修改、测试和发布。', 'icon' => 'fas fa-code-branch'],
];
$pageJsonLd = [
  [
    '@context' => 'https://schema.org',
    '@type' => 'SoftwareApplication',
    'name' => 'WorkWise',
    'alternateName' => '桌面端 AI 工作台',
    'applicationCategory' => 'BusinessApplication',
    'operatingSystem' => 'Windows, macOS',
    'softwareVersion' => $workwiseVersion,
    'datePublished' => $workwiseReleaseDate,
    'description' => $pageDesc,
    'url' => 'https://www.railwise.cn/products/workwise/',
    'image' => $pageOgImage,
    'downloadUrl' => 'https://www.railwise.cn' . ($workwiseDownloads[0]['url'] ?? '/downloads/workwise/'),
    'codeRepository' => $workwiseRepoUrl,
    'publisher' => [
      '@type' => 'Organization',
      'name' => '宁波睿威工程技术有限公司',
      'url' => 'https://www.railwise.cn/',
    ],
  ],
  [
    '@context' => 'https://schema.org',
    '@type' => 'BreadcrumbList',
    'itemListElement' => [
      ['@type' => 'ListItem', 'position' => 1, 'name' => '首页', 'item' => 'https://www.railwise.cn/'],
      ['@type' => 'ListItem', 'position' => 2, 'name' => '产品矩阵', 'item' => 'https://www.railwise.cn/products'],
      ['@type' => 'ListItem', 'position' => 3, 'name' => 'WorkWise', 'item' => 'https://www.railwise.cn/products/workwise/'],
    ],
  ],
];
$rwConversionDock = [
  'eyebrow' => 'WORKWISE DEMO',
  'title' => '预约 WorkWise 场景演示',
  'description' => '带上真实文档、项目目录或插件场景，我们按你的工作流演示 Code / Write / Skills / 插件市场。',
  'subject' => 'WorkWise 产品演示',
  'product' => 'workwise',
  'source' => 'product',
  'primary_label' => '预约演示',
];
require_once __DIR__ . '/../../includes/header.php';
?>

<link rel="stylesheet" href="/css/product-detail.css?v=<?php echo filemtime(__DIR__ . '/../../css/product-detail.css'); ?>">

<section class="pd-hero rw-scene-hero">
  <?php echo rw_render_hero_picture('product-workwise', ['loading' => 'eager', 'fetchpriority' => 'high']); ?>
  <div class="container mx-auto px-6 max-w-7xl">
    <div class="pd-breadcrumb">
      <a href="/">首页</a>
      <i class="fas fa-chevron-right"></i>
      <a href="/products">产品矩阵</a>
      <i class="fas fa-chevron-right"></i>
      <span>WorkWise</span>
    </div>
    <div class="pd-hero-grid">
      <div class="pd-hero-text">
        <div class="pd-eyebrow"><span class="dot"></span> DeepSeek V4 原生默认支持 <span class="pd-product-badge brand-workwise">WorkWise</span></div>
        <h1 class="pd-title">WorkWise · 让 AI 进入真实工作流</h1>
        <p class="pd-subtitle">主 Agent 默认 V4 Pro · Write 默认 V4 Flash</p>
        <p class="pd-desc">WorkWise 以 DeepSeek V4 作为开箱即用的默认模型底座。0.4.1 修复插件市场命令解析、可执行文件定位和自动更新恢复，并继续提供可验证安装、在线目录同步、Codex 插件兼容和 DeepSeek Harness 结构化附件处理。</p>
        <div class="pd-cta-row">
          <a href="#download" class="pd-btn primary" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'product_hero', 'label' => 'WorkWise 站内下载', 'product' => 'workwise', 'source' => 'product', 'destination' => 'local_mirror']); ?>>站内下载 <i class="fas fa-download"></i></a>
          <a href="https://kb.railwise.cn/products/workwise/" class="pd-btn ghost" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'product_hero', 'label' => 'WorkWise 知识库', 'product' => 'workwise', 'source' => 'product', 'destination' => 'knowledge_base']); ?>>知识库文档 <i class="fas fa-book-open"></i></a>
          <a href="<?php echo htmlspecialchars($workwiseReleaseUrl); ?>" target="_blank" rel="noopener" class="pd-btn ghost" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'product_hero', 'label' => 'WorkWise Release', 'product' => 'workwise', 'source' => 'product', 'destination' => 'github_release']); ?>>查看 Release <i class="fas fa-arrow-up-right-from-square"></i></a>
          <a href="/contact?subject=<?php echo urlencode('WorkWise 产品演示'); ?>&product=workwise&source=product" class="pd-btn ghost" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'product_hero', 'label' => 'WorkWise 预约演示', 'product' => 'workwise', 'source' => 'product', 'destination' => 'contact']); ?>>预约演示 <i class="fas fa-comments"></i></a>
        </div>
        <div class="pd-stack">
          <span>Code</span>
          <span>Write</span>
          <span>Design</span>
          <span>Skills</span>
          <span>MCP</span>
          <span>WWX / Codex / MCPB</span>
          <span>克制的玻璃界面</span>
          <span>DOCX / PPTX / PDF</span>
          <span>Flow Preview</span>
          <span>V4 Pro · Agent 默认</span>
          <span>V4 Flash · Write 默认</span>
          <span>1M 上下文</span>
          <span>附件本地解析</span>
          <span>本地优先</span>
          <span><?php echo htmlspecialchars($workwiseVersion); ?></span>
        </div>
      </div>
      <div class="pd-hero-visual">
        <div class="pd-screenshot featured">
          <div class="pd-browser-bar">
            <span></span><span></span><span></span>
            <div class="pd-url">WorkWise · Write 工作台</div>
          </div>
          <img src="<?php echo htmlspecialchars(optimizeImage('/products/screenshots/workwise/01-write-home.png')); ?>" alt="WorkWise 写作工作台" fetchpriority="high" decoding="async">
        </div>
      </div>
    </div>
  </div>
</section>

<section class="pd-section">
  <div class="container mx-auto px-6 max-w-7xl">
    <div class="pd-section-head">
      <div class="pd-eyebrow dark">DEEPSEEK V4 NATIVE</div>
      <h2>不是一个模型选项，而是开箱即用的默认模型底座</h2>
      <p class="pd-section-sub">以下产品口径与 WorkWise GitHub README、软件介绍一致；模型状态同时以 DeepSeek 官方文档为依据。0.4.1 已交付能力与后续增强分别标注。</p>
    </div>
    <div class="pd-caps-grid">
      <article class="pd-cap">
        <div class="pd-cap-head">
          <span class="pd-cap-ico workwise-code"><i class="fas fa-bolt"></i></span>
          <div>
            <span class="pd-eyebrow dark">WORKWISE <?php echo htmlspecialchars($workwiseVersion); ?> · AVAILABLE NOW</span>
            <h3>主 Agent 默认 Pro，Write 默认 Flash</h3>
            <p>首次启动只需配置 DeepSeek API Key 和可选服务地址，一次配置供对话、写作和手机连接共用，也可按组织要求添加兼容服务。主 Agent 默认使用 <code>deepseek-v4-pro</code>，Write 行内补全默认使用 <code>deepseek-v4-flash</code>。</p>
            <a href="https://github.com/wangjiawei508/WorkWise/blob/main/docs/product-introduction.zh-CN.md" target="_blank" rel="noopener" class="cli-inline-link">查看 WorkWise 软件介绍 <i class="fas fa-arrow-up-right-from-square"></i></a>
          </div>
        </div>
      </article>
      <article class="pd-cap">
        <div class="pd-cap-head">
          <span class="pd-cap-ico workwise-skills"><i class="fas fa-diagram-project"></i></span>
          <div>
            <span class="pd-eyebrow dark">1M CONTEXT · UP TO 384K OUTPUT</span>
            <h3>不是简单转发接口</h3>
            <p><?php echo htmlspecialchars($workwiseVersion); ?> 继续按 DeepSeek V4 的 100 万 token 上下文配置运行时，并支持思考模式、工具调用、长对话延续、上下文压缩和缓存用量统计。当前稳定默认路径仍是 Chat Completions；Responses 协议兼容能力需通过新版模型验收后再默认启用。</p>
            <a href="https://api-docs.deepseek.com/quick_start/pricing" target="_blank" rel="noopener" class="cli-inline-link">查看 DeepSeek 官方模型说明 <i class="fas fa-arrow-up-right-from-square"></i></a>
          </div>
        </div>
      </article>
      <article class="pd-cap">
        <div class="pd-cap-head">
          <span class="pd-cap-ico workwise-update"><i class="fas fa-forward"></i></span>
          <div>
            <span class="pd-eyebrow dark">2026-08-13 · DEEPSEEK-V4-PRO-0813</span>
            <h3>V4 Pro 已正式发布，无需重装 WorkWise</h3>
            <p>正式 V4 Pro 的 API 模型 ID 仍是 <code>deepseek-v4-pro</code>，官方基础地址仍是 <code>https://api.deepseek.com</code>。WorkWise 0.4.1 已使用这两个稳定标识，因此服务端模型升级可直接生效。Responses/Anthropic 的完整推理续接与精确推理档位映射属于后续增强，不描述为 0.4.1 已交付能力。</p>
            <a href="https://api-docs.deepseek.com/updates" target="_blank" rel="noopener" class="cli-inline-link">查看 DeepSeek 官方更新日志 <i class="fas fa-arrow-up-right-from-square"></i></a>
          </div>
        </div>
      </article>
    </div>
  </div>
</section>

<section class="pd-section">
  <div class="container mx-auto px-6 max-w-7xl">
    <div class="pd-section-head">
      <div class="pd-eyebrow dark">WHY WORKWISE</div>
      <h2>WorkWise 的差异化优势</h2>
      <p class="pd-section-sub">它不是单纯的聊天窗口，而是把 Desktop 的本地工作区、代码、写作、设计、Skills 管理和成果交付能力合并到真实产品里。</p>
    </div>
    <div class="ww-advantage-layout">
      <div class="ww-advantage-visual">
        <div class="ww-visual-tag">WorkWise Workflow</div>
        <img src="<?php echo htmlspecialchars(optimizeImage('/products/screenshots/workwise/05-skills-market.png')); ?>" alt="WorkWise Skills 市场与工作流能力" loading="lazy" decoding="async">
        <div class="ww-visual-points">
          <span><i class="fas fa-layer-group"></i> Skills</span>
          <span><i class="fas fa-file-word"></i> DOCX</span>
          <span><i class="fas fa-file-pdf"></i> PDF</span>
          <span><i class="fas fa-plug"></i> MCP</span>
        </div>
      </div>
      <div class="ww-advantage-list">
        <?php foreach ($workwiseAdvantages as $item): ?>
        <div class="ww-advantage-card">
          <span><i class="<?php echo htmlspecialchars($item['icon'], ENT_QUOTES, 'UTF-8'); ?>"></i></span>
          <div>
            <h3><?php echo htmlspecialchars($item['title'], ENT_QUOTES, 'UTF-8'); ?></h3>
            <p><?php echo htmlspecialchars($item['desc'], ENT_QUOTES, 'UTF-8'); ?></p>
          </div>
        </div>
        <?php endforeach; ?>
      </div>
    </div>
  </div>
</section>

<section class="pd-section dark">
  <div class="container mx-auto px-6 max-w-7xl">
    <div class="pd-section-head">
      <div class="pd-eyebrow">CORE CAPABILITIES</div>
      <h2>核心能力</h2>
      <p class="pd-section-sub">围绕 Code、Write、Design、可靠任务、Skills 和插件市场，覆盖从处理问题到交付成果的完整链路。</p>
    </div>
    <div class="pd-caps-grid">
      <?php foreach ($workwiseCapabilities as $item): ?>
      <div class="pd-cap">
        <div class="pd-cap-head">
          <span class="pd-cap-ico <?php echo htmlspecialchars($item['tone'], ENT_QUOTES, 'UTF-8'); ?>"><i class="<?php echo htmlspecialchars($item['icon'], ENT_QUOTES, 'UTF-8'); ?>"></i></span>
          <div>
            <h3><?php echo htmlspecialchars($item['title']); ?></h3>
            <p><?php echo htmlspecialchars($item['desc']); ?></p>
          </div>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
    <div class="ww-status-grid">
      <?php foreach ($workwiseStatus as $item): ?>
        <div class="ww-status-card">
          <span class="ww-status-icon"><i class="<?php echo htmlspecialchars($item['icon'], ENT_QUOTES, 'UTF-8'); ?>"></i></span>
          <div>
            <span class="ww-status-label"><?php echo htmlspecialchars($item['label'], ENT_QUOTES, 'UTF-8'); ?></span>
            <h3><?php echo htmlspecialchars($item['title'], ENT_QUOTES, 'UTF-8'); ?></h3>
            <p><?php echo htmlspecialchars($item['text'], ENT_QUOTES, 'UTF-8'); ?></p>
          </div>
        </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="pd-section" id="download">
  <div class="container mx-auto px-6 max-w-7xl">
    <div class="pd-section-head">
      <div class="pd-eyebrow dark">DOWNLOAD</div>
      <h2>下载与安装</h2>
      <p class="pd-section-sub">WorkWise <?php echo htmlspecialchars($workwiseVersion); ?> 已发布。选择与你的设备匹配的客户端，站内镜像优先下载。</p>
    </div>
    <div class="cli-release-grid">
      <div class="cli-release-card">
        <span>当前版本</span>
        <strong><?php echo htmlspecialchars($workwiseVersion); ?></strong>
        <p>WorkWise <?php echo htmlspecialchars($workwiseVersion); ?> stable 的站内安装包已同步到下载目录。</p>
      </div>
      <div class="cli-release-card">
        <span>安装包</span>
        <strong>3</strong>
        <p>macOS Apple Silicon、macOS Intel、Windows x64 三个安装包。</p>
      </div>
      <div class="cli-release-card">
        <span>发布时间</span>
        <strong><?php echo htmlspecialchars($workwiseReleaseDate); ?></strong>
        <p>精选插件市场、特色 Skills、应用内更新修复和高可读桌面界面进入稳定版本。</p>
      </div>
      <a href="<?php echo htmlspecialchars($workwiseReleaseUrl); ?>" target="_blank" rel="noopener" class="cli-release-card" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'download_release', 'label' => 'WorkWise GitHub Release', 'product' => 'workwise', 'source' => 'product', 'destination' => 'github_release']); ?>>
        <span>Release</span>
        <strong>查看 GitHub Release</strong>
        <p>适合核对上游说明、问题反馈和历史版本。</p>
      </a>
    </div>

    <div class="ww-download-picker">
      <div class="ww-download-picker__head">
        <div>
          <span class="ww-download-picker__eyebrow">CHOOSE YOUR PLATFORM</span>
          <h3>选择适合你的客户端</h3>
          <p>macOS 按芯片选择，Windows 提供 x64 安装包。三个版本均来自 WorkWise <?php echo htmlspecialchars($workwiseVersion); ?> 正式 Release。</p>
        </div>
        <a href="<?php echo htmlspecialchars($workwiseReleaseUrl, ENT_QUOTES, 'UTF-8'); ?>" target="_blank" rel="noopener" class="ww-download-picker__release" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'download_platforms', 'label' => 'WorkWise GitHub Release', 'product' => 'workwise', 'source' => 'product', 'destination' => 'github_release']); ?>>查看完整 Release <i class="fas fa-arrow-up-right-from-square"></i></a>
      </div>
      <div class="ww-download-grid">
        <?php foreach ($workwiseDownloads as $download): ?>
        <a href="<?php echo htmlspecialchars($download['url'], ENT_QUOTES, 'UTF-8'); ?>" class="ww-download-option <?php echo htmlspecialchars($download['platformClass'], ENT_QUOTES, 'UTF-8'); ?>" download <?php echo rw_tracking_attrs('conversion_click', ['location' => 'download_card', 'label' => $download['platform'], 'product' => 'workwise', 'source' => 'product', 'destination' => 'local_mirror']); ?>>
          <div class="ww-download-option__mark"><i class="<?php echo htmlspecialchars($download['icon'], ENT_QUOTES, 'UTF-8'); ?>"></i></div>
          <div class="ww-download-option__body">
            <div class="ww-download-option__eyebrow">
              <span><?php echo $download['platformClass'] === 'is-macos' ? 'macOS' : 'Windows'; ?></span>
              <span><?php echo htmlspecialchars($workwiseVersion, ENT_QUOTES, 'UTF-8'); ?></span>
            </div>
            <h3><?php echo htmlspecialchars($download['platform'], ENT_QUOTES, 'UTF-8'); ?></h3>
            <p><?php echo htmlspecialchars($download['desc'], ENT_QUOTES, 'UTF-8'); ?></p>
            <div class="ww-download-option__meta">
              <span><?php echo htmlspecialchars($download['size'], ENT_QUOTES, 'UTF-8'); ?></span>
              <span><?php echo htmlspecialchars(pathinfo($download['file'], PATHINFO_EXTENSION), ENT_QUOTES, 'UTF-8'); ?> 安装包</span>
            </div>
            <code class="ww-download-option__file"><?php echo htmlspecialchars($download['file'], ENT_QUOTES, 'UTF-8'); ?></code>
            <span class="ww-download-option__action">立即下载 <i class="fas fa-download"></i></span>
          </div>
        </a>
        <?php endforeach; ?>
      </div>
    </div>
  </div>
</section>

<section class="pd-section ww-docs-section">
  <div class="container mx-auto px-6 max-w-7xl">
    <div class="pd-section-head">
      <div class="pd-eyebrow dark">DOCUMENTATION</div>
      <h2>从下载到交付的使用文档</h2>
      <p class="pd-section-sub">详细教程由 RailWise 知识库维护；DeepSeek Harness 接入边界同时提供可核对的仓库说明，版本、下载与产品页保持同步。</p>
    </div>
    <div class="ww-doc-grid">
      <?php foreach ($workwiseDocs as $key => $doc): ?>
      <a class="ww-doc-card" href="<?php echo htmlspecialchars($doc['url'], ENT_QUOTES, 'UTF-8'); ?>" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'product_docs', 'label' => $doc['title'], 'product' => 'workwise', 'source' => 'product', 'destination' => 'knowledge_base']); ?>>
        <span class="ww-doc-card__icon"><i class="fas <?php echo htmlspecialchars($doc['icon'], ENT_QUOTES, 'UTF-8'); ?>"></i></span>
        <span class="ww-doc-card__copy"><strong><?php echo htmlspecialchars($doc['title'], ENT_QUOTES, 'UTF-8'); ?></strong><small><?php echo htmlspecialchars($doc['desc'], ENT_QUOTES, 'UTF-8'); ?></small></span>
        <i class="fas fa-arrow-up-right-from-square ww-doc-card__arrow"></i>
      </a>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="pd-section dark">
  <div class="container mx-auto px-6 max-w-7xl">
    <div class="pd-section-head">
      <div class="pd-eyebrow">WRITE & EXPORT</div>
      <h2>写作与导出</h2>
      <p class="pd-section-sub">这里不是简单截图展示，而是 WorkWise 当前很实用的交付能力。</p>
    </div>
    <div class="ww-write-layout">
      <div class="ww-write-copy">
        <span class="ww-write-kicker">AI WORD SKILLS</span>
        <h3>从 Markdown、画板到 Word / PPTX / PDF，把内容真正交付出去</h3>
        <p>WorkWise 的交付能力重点不是“能聊天”，而是把 Word 模板、专业 Skills、长文档编辑、Design 画板与 DOCX / PPTX / PDF 成果放进同一条链路里。</p>
        <div class="ww-export-grid">
          <?php foreach ($workwiseExportFeatures as $item): ?>
          <div class="ww-export-card">
            <span><i class="<?php echo htmlspecialchars($item['icon'], ENT_QUOTES, 'UTF-8'); ?>"></i></span>
            <h4><?php echo htmlspecialchars($item['title'], ENT_QUOTES, 'UTF-8'); ?></h4>
            <p><?php echo htmlspecialchars($item['desc'], ENT_QUOTES, 'UTF-8'); ?></p>
          </div>
          <?php endforeach; ?>
        </div>
      </div>
      <div class="ww-write-visual">
        <div class="pd-screenshot featured">
          <div class="pd-browser-bar">
            <span></span><span></span><span></span>
            <div class="pd-url">Write / Design · Verified Export</div>
          </div>
          <img src="<?php echo htmlspecialchars(optimizeImage('/products/screenshots/workwise/04-doc-editing.png')); ?>" alt="WorkWise 文档编辑与导出" loading="lazy" decoding="async">
        </div>
        <div class="ww-export-flow">
          <span>Markdown</span>
          <i class="fas fa-arrow-right"></i>
          <span>Word Templates / Design</span>
          <i class="fas fa-arrow-right"></i>
          <span>DOCX / PPTX / PDF</span>
        </div>
      </div>
    </div>
    <div class="ww-gallery-strip">
      <?php foreach ($workwiseWriteShots as $shot): ?>
      <figure>
        <img src="<?php echo htmlspecialchars(optimizeImage($shot['src'])); ?>" alt="<?php echo htmlspecialchars($shot['title']); ?>" loading="lazy" decoding="async">
        <figcaption>
          <strong><?php echo htmlspecialchars($shot['title']); ?></strong>
          <span><?php echo htmlspecialchars($shot['desc']); ?></span>
        </figcaption>
      </figure>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="pd-section">
  <div class="container mx-auto px-6 max-w-7xl">
    <div class="pd-section-head">
      <div class="pd-eyebrow dark">USE CASES</div>
      <h2>推荐使用场景</h2>
      <p class="pd-section-sub">适合长期积累、反复迭代、重视交付质量的工作。</p>
    </div>
    <div class="pd-usecase-grid">
      <?php foreach ($workwiseUseCases as $item): ?>
      <div class="pd-usecase-card">
        <span class="pd-usecase-ico"><i class="<?php echo htmlspecialchars($item['icon'], ENT_QUOTES, 'UTF-8'); ?>"></i></span>
        <h3><?php echo htmlspecialchars($item['title'], ENT_QUOTES, 'UTF-8'); ?></h3>
        <p><?php echo htmlspecialchars($item['desc'], ENT_QUOTES, 'UTF-8'); ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="pd-section pd-conversion">
  <div class="container mx-auto px-6 max-w-7xl">
    <div class="pd-section-head">
      <div class="pd-eyebrow dark">FEEDBACK</div>
      <h2>反馈与发布规则</h2>
      <p class="pd-section-sub">WorkWise <?php echo htmlspecialchars($workwiseVersion); ?> 的 macOS 安装包已完成 Developer ID 签名与公证；已安装 0.3.5 的用户可通过稳定更新入口升级。</p>
    </div>
    <div class="pd-faq-grid">
      <div class="pd-faq-card">
        <h3>发布规则</h3>
        <p>公开 Release 只保留三个面向用户的安装包，不发布 Linux 客户端，不公开中间构建文件。</p>
      </div>
      <div class="pd-faq-card">
        <h3>更新方式</h3>
        <p>首次点击更新只下载；再次点击“重启并更新”。应用会先保存编辑内容、列出活动任务并建立检查点，再停止 Runtime 完成安装。</p>
      </div>
      <div class="pd-faq-card">
        <h3>反馈入口</h3>
        <p>问题、建议和复现步骤请优先通过 GitHub Issues 或官网联系页提交。</p>
      </div>
    </div>
    <div class="pd-cta-actions" style="margin-top:2rem;">
      <a href="<?php echo htmlspecialchars($workwiseReleaseUrl); ?>" target="_blank" rel="noopener" class="pd-btn primary large" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'product_cta', 'label' => 'WorkWise Release', 'product' => 'workwise', 'source' => 'product', 'destination' => 'github_release']); ?>>查看 Release <i class="fas fa-arrow-up-right-from-square"></i></a>
      <a href="https://kb.railwise.cn/products/workwise/" class="pd-btn ghost large" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'product_cta', 'label' => 'WorkWise 知识库', 'product' => 'workwise', 'source' => 'product', 'destination' => 'knowledge_base']); ?>>查看知识库 <i class="fas fa-book-open"></i></a>
      <a href="/contact?subject=<?php echo urlencode('WorkWise 产品演示'); ?>&product=workwise&source=product" class="pd-btn ghost large" <?php echo rw_tracking_attrs('conversion_click', ['location' => 'product_cta', 'label' => 'WorkWise 联系支持', 'product' => 'workwise', 'source' => 'product', 'destination' => 'contact']); ?>>联系支持 <i class="fas fa-comments"></i></a>
    </div>
  </div>
</section>

<?php require_once __DIR__ . '/../../includes/footer.php'; ?>
