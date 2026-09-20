# 官网介绍和候选截图限定部署

`content-only` 只允许写入产品页面、04/05/06 三张中文浅色 JPEG 和 `candidate-screenshots.json`。旧截图、公共 include、下载清单、安装包、stable/frontier feed、GitHub Release 和公开版本均不在写入范围。原 `full` 流程保持兼容。

## 来源和保护条件

- `source_sha` 必须是完整的小写 40 位提交哈希；工作流 checkout 精确提交并再次比对 HEAD。
- 五个内容文件和两个受保护文件必须与该提交逐字节一致；图片必须匹配来源 JSON 中的 SHA-256，并声明 `zh-CN`、`light`、`released: false`。
- 远端 `includes/workwise_product.php` 与 `data/workwise-product.json` 必须匹配源提交哈希；写入前后以及回滚后均检查，绝不覆盖这两个文件。
- 新旧页面的 `id="download"` section PHP 源码必须完全相同；还要在远端真实 PHP 运行环境、真实 header/footer/include 下各自执行并比较下载区渲染哈希。因此下载区以外的变量改动也不能改变下载区呈现。
- 页面与截图先备份，再按固定白名单写入。中断或后置保护失败会自动回滚；公开验证失败由工作流触发显式回滚。原本不存在的新增图片和来源 JSON 会删除，原有图片按备份恢复。不同 source_sha 不能回滚该批次。
- 公网验证检查服务器页面/图片/来源清单字节、下载区渲染，以及公开页面中的三张图片引用和实际图片哈希。验证失败不代表部署成功。

## 可审查命令

下面仅是运行方式。本次实现没有执行部署；`SOURCE_SHA` 应替换为包含已审查文案、截图和脚本的完整提交，`DEPLOY_ID` 应为唯一值。

```sh
node scripts/deploy-workwise-product-page.mjs validate --source website --version 0.5.0 --mode content-only --source-sha "$SOURCE_SHA"
node scripts/deploy-workwise-product-page.mjs deploy --source website --version 0.5.0 --mode content-only --source-sha "$SOURCE_SHA" --deploy-id "$DEPLOY_ID"
node scripts/deploy-workwise-product-page.mjs verify-public --source website --version 0.5.0 --mode content-only --source-sha "$SOURCE_SHA" --deploy-id "$DEPLOY_ID"
node scripts/deploy-workwise-product-page.mjs rollback --source website --version 0.5.0 --mode content-only --source-sha "$SOURCE_SHA" --deploy-id "$DEPLOY_ID"
```

具备既有授权且完成审查后，可用仓库中已有 SSH secrets 的工作流：

```sh
gh workflow run deploy-workwise-product-page.yml -R wangjiawei508/WorkWise --ref main -f version=0.5.0 -f confirmation=DEPLOY-WORKWISE-PRODUCT-PAGE-v0.5.0 -f mode=content-only -f source_sha="$SOURCE_SHA"
```

工作流定义须先进入 `main`，源提交须在 GitHub 可读取。不要省略 `-R`：本机 gh 的默认仓库可能指向上游仓库。

## 真正的官网预览

当前仓库只有页面覆盖文件，没有完整 header/footer、CSS 及其依赖。本机也没有原生 PHP，Docker daemon 未运行。占位 header/CSS 无法作为视觉验收证据。

可行的受限只读办法是复用已固定 SSH host key 的工作流，在真实 PHP 容器中对私有 staging 的候选页面执行 PHP：用 `token_get_all` 仅把 `T_DIR` 替换为真实产品目录，设置公开站点的 `DOCUMENT_ROOT`/`HTTP_HOST`/`REQUEST_URI`，输出已渲染 HTML。模板使用服务器原文件，不覆盖官网文件；PHP 源码和配置不应作为 artifact 导出。公开 CSS、字体、图片可按 HTML 实际引用通过 HTTPS 获取。渲染 HTML 可用本地静态服务在桌面/手机视口检查，并保留来源 SHA 与资源哈希。

这条方式导出的是实际 PHP 渲染结果，不是假造模板。但当前尚未运行，不可标记官网视觉验收通过。若必须本地运行完整 PHP 网站，则需要另行取得经过检查的完整模板及依赖包；不能只取 header/footer 两个文件后用桩函数冒充完整网站，也不能无筛选导出服务器 PHP 配置。

## 验证

```sh
node --test scripts/workwise-content-deploy.test.mjs
WORKWISE_CONTENT_PHP_TEST=php node --test scripts/workwise-content-deploy.test.mjs
```

事务测试实际执行 Bash 和临时文件读写/回滚；其中 PHP transport 为明确标注的测试替身。第二条额外用真实 PHP 执行源码/渲染保护器，工作流在 content-only 模式强制运行该项。它验证保护器，不代替真实官网模板的整页渲染和视觉验收。
