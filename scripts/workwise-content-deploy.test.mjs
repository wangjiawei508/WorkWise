import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { CONTENT_FILES, PROTECTED_FILES, PHP_RENDER_DOWNLOAD, PHP_COMPARE_DOWNLOAD_SOURCE, PHP_RENDER_PAGE, remoteContentScript, sha256, validateContentSource, validatePreviewScreenshots, verifyPublicContent } from './workwise-content-deploy.mjs'
import { createPreviewServer, previewResourceUrl } from './preview-workwise-content.mjs'

const sourceSha = 'a'.repeat(40)
const q = (value) => `'${value.replaceAll("'", "'\\''")}'`
const put = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value) }
const page = (intro) => `<?php $version='0.5.0'; ?>${intro}<section id="download">stable download</section>`

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'workwise-content-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const site = join(root, 'site'), stage = join(root, 'stage'), backup = join(root, 'backup')
  const files = [...CONTENT_FILES, ...PROTECTED_FILES].map((relative) => {
    const data = Buffer.from(relative === CONTENT_FILES[0] ? page('new introduction') : `new ${relative}`)
    put(join(stage, relative), data)
    return { relative, data, sha256: sha256(data) }
  })
  for (const relative of PROTECTED_FILES) put(join(site, relative), files.find((f) => f.relative === relative).data)
  put(join(site, CONTENT_FILES[0]), page('old introduction'))
  put(join(site, CONTENT_FILES[1]), 'original image')
  put(join(site, 'products/screenshots/workwise/01-workbench-dark.png'), 'untouched legacy image')
  // This transport fake tests the real Bash transaction and filesystem behavior.
  // It deliberately does not claim to validate PHP execution or website rendering.
  const fakePhp = join(root, 'fake-php.cjs')
  put(fakePhp, `const fs=require('node:fs'),crypto=require('node:crypto');
const code=process.argv[3]||'',input=fs.readFileSync(0,'utf8');
if(process.argv[2]==='-l')process.exit(0);
if(code.includes('explode(')){process.stdout.write(JSON.stringify(input.split('\\0')));}
else if(code.includes('$sections =')){const s=JSON.parse(input).map(p=>p.match(/<section\\b[^>]*\\bid="download"[^>]*>.*?<\\/section>/s)?.[0]);if(!s[0]||s.length!==2||s[0]!==s[1])process.exit(65);}
else {const s=input.match(/<section\\b[^>]*\\bid="download"[^>]*>.*?<\\/section>/s)?.[0];if(!s)process.exit(65);process.stdout.write(crypto.createHash('sha256').update(s).digest('hex'));}
`)
  const runtime = `site_root=${q(site)}\nstage=${q(stage)}\nbackup=${q(backup)}
container_run() {
  if [ "$1" = mv ] && [ -n "\${FAIL_ONCE:-}" ] && [ "$4" = "\${FAIL_TARGET:-$4}" ] && [ ! -e "$FAIL_ONCE" ]; then touch "$FAIL_ONCE"; return 9; fi
  "$@"
}
container_write() { tee "$1" >/dev/null; }
php_run() { ${q(process.execPath)} ${q(fakePhp)} "$@"; }
`
  const validated = { sourceSha, files }
  const run = (action, extraEnv = {}) => spawnSync('bash', [], { input: remoteContentScript(action, validated, runtime), encoding: 'utf8', env: { ...process.env, ...extraEnv } })
  return { root, site, stage, backup, validated, run }
}

test('exact payload allowlist excludes official metadata and historical screenshots', () => {
  assert.equal(CONTENT_FILES.length, 5)
  assert.equal(CONTENT_FILES.filter((f) => f.endsWith('.jpg')).length, 3)
  assert.ok(PROTECTED_FILES.every((f) => !CONTENT_FILES.includes(f)))
  assert.ok(CONTENT_FILES.every((f) => !/stable|release|01-|02-|03-/.test(f)))
})

test('deploy and explicit rollback restore old files and remove introduced images/provenance', (t) => {
  const f = fixture(t)
  const result = f.run('deploy')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(f.run('verify').status, 0)
  for (const file of f.validated.files) assert.equal(sha256(readFileSync(join(f.site, file.relative))), file.sha256)
  assert.equal(f.run('rollback').status, 0)
  assert.equal(readFileSync(join(f.site, CONTENT_FILES[0]), 'utf8'), page('old introduction'))
  assert.equal(readFileSync(join(f.site, CONTENT_FILES[1]), 'utf8'), 'original image')
  for (const relative of CONTENT_FILES.slice(2)) assert.equal(existsSync(join(f.site, relative)), false)
  assert.equal(readFileSync(join(f.site, 'products/screenshots/workwise/01-workbench-dark.png'), 'utf8'), 'untouched legacy image')
  for (const relative of PROTECTED_FILES) assert.equal(sha256(readFileSync(join(f.site, relative))), f.validated.files.find((f) => f.relative === relative).sha256)
})

test('mid-transaction failure runs rollback and preserves original exit status', (t) => {
  const f = fixture(t)
  const result = f.run('deploy', { FAIL_ONCE: join(f.root, 'failed-once'), FAIL_TARGET: join(f.site, CONTENT_FILES[2]) })
  assert.equal(result.status, 9, result.stderr)
  assert.equal(readFileSync(join(f.site, CONTENT_FILES[0]), 'utf8'), page('old introduction'))
  assert.equal(readFileSync(join(f.site, CONTENT_FILES[1]), 'utf8'), 'original image')
  for (const relative of CONTENT_FILES.slice(2)) assert.equal(existsSync(join(f.site, relative)), false)
})

for (const relative of PROTECTED_FILES) test(`reject changed protected remote ${relative} before backup/write`, (t) => {
  const f = fixture(t)
  put(join(f.site, relative), 'remote differs')
  assert.notEqual(f.run('deploy').status, 0)
  assert.equal(existsSync(f.backup), false)
  assert.equal(readFileSync(join(f.site, CONTENT_FILES[0]), 'utf8'), page('old introduction'))
})

test('changed download section and corrupted stage are rejected before mutation', (t) => {
  const f = fixture(t)
  put(join(f.site, CONTENT_FILES[0]), page('old').replace('stable download', 'different download'))
  assert.notEqual(f.run('deploy').status, 0)
  assert.equal(existsSync(f.backup), false)
  put(join(f.site, CONTENT_FILES[0]), page('old introduction'))
  put(join(f.stage, CONTENT_FILES[1]), 'corrupt transfer')
  assert.notEqual(f.run('deploy').status, 0)
  assert.equal(existsSync(f.backup), false)
})

test('verification catches modified payload and rollback refuses a different source identity', (t) => {
  const f = fixture(t)
  assert.equal(f.run('deploy').status, 0)
  put(join(f.site, CONTENT_FILES[2]), 'changed after deployment')
  assert.notEqual(f.run('verify').status, 0)
  put(join(f.backup, 'source-sha'), 'b'.repeat(40))
  assert.notEqual(f.run('rollback').status, 0)
  assert.equal(readFileSync(join(f.site, CONTENT_FILES[2]), 'utf8'), 'changed after deployment')
})

test('source validation rejects abbreviated/mismatched SHA and changed tracked bytes', (t) => {
  const f = fixture(t)
  const git = (args) => execFileSync('git', ['-C', f.stage, ...args], { encoding: 'utf8' }).trim()
  git(['init', '-q'])
  const screenshots = f.validated.files.filter((x) => x.relative.endsWith('.jpg')).map((x) => ({ path: x.relative.split('/').at(-1), sha256: x.sha256 }))
  put(join(f.stage, CONTENT_FILES[4]), JSON.stringify({ locale: 'zh-CN', theme: 'light', released: false, screenshots }))
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'])
  const sha = git(['rev-parse', 'HEAD'])
  assert.equal(validateContentSource(f.stage, sha).files.length, 7)
  assert.throws(() => validateContentSource(f.stage, sha.slice(0, 7)), /40-hex/)
  assert.throws(() => validateContentSource(f.stage, '0'.repeat(40)), /Checkout/)
  put(join(f.stage, CONTENT_FILES[1]), 'uncommitted replacement')
  assert.throws(() => validateContentSource(f.stage, sha), /differs from the exact commit/)
})

test('real PHP rendering catches upstream variable changes and resolves __DIR__', { skip: !process.env.WORKWISE_CONTENT_PHP_TEST }, () => {
  const php = process.env.WORKWISE_CONTENT_PHP_TEST
  const section = '<section id="download"><?php echo $version, __DIR__; ?></section>'
  const first = `<?php $version='0.5.0'; ?>${section}`
  const second = `<?php $version='0.6.0'; ?>${section}`
  const render = (input) => execFileSync(php, ['-r', PHP_RENDER_DOWNLOAD, '--', '/site/products/workwise'], { input, encoding: 'utf8' })
  assert.equal(render(first), sha256('<section id="download">0.5.0/site/products/workwise</section>'))
  assert.notEqual(render(first), render(second))
  assert.equal(spawnSync(php, ['-r', PHP_COMPARE_DOWNLOAD_SOURCE], { input: JSON.stringify([first, second]) }).status, 0)
  assert.notEqual(spawnSync(php, ['-r', PHP_COMPARE_DOWNLOAD_SOURCE], { input: JSON.stringify([first, second.replace('echo $version', 'echo "changed"')]) }).status, 0)
  assert.notEqual(spawnSync(php, ['-r', PHP_RENDER_DOWNLOAD, '--', '/site/products/workwise'], { input: `${first}${section}` }).status, 0)
  const full = '<html><title>Preview</title><body>candidate</body></html>'
  assert.equal(execFileSync(php, ['-r', PHP_RENDER_PAGE, '--', '/site/products/workwise'], { input: full, encoding: 'utf8' }), full)
  const failure = spawnSync(php, ['-r', PHP_RENDER_PAGE, '--', '/site/products/workwise'], { input: '<?php trigger_error("PRIVATE_CONFIG_CANARY", E_USER_WARNING); ?>', encoding: 'utf8' })
  assert.notEqual(failure.status, 0)
  assert.equal(failure.stdout, '')
  assert.equal(failure.stderr, 'Website preview rendering failed')
})

test('public verification rejects stale introduction/download/title/provenance despite current screenshots', async (t) => {
  const f = fixture(t)
  const images = CONTENT_FILES.filter((p) => p.endsWith('.jpg')).map((p) => `<img src="/${p}">`).join('')
  const expected = `<html><title>Survey</title><section class="pd-hero">new introduction${images}</section><section class="pd-section" id="download">stable 0.5.0</section></html>`
  const fetcher = (html, corruptProvenance = false) => async (url) => {
    const path = new URL(url).pathname.slice(1)
    if (path === 'products/workwise/') return new Response(html)
    const file = f.validated.files.find((item) => item.relative === path)
    return new Response(corruptProvenance && path.endsWith('.json') ? 'old provenance' : file.data)
  }
  await verifyPublicContent(f.validated, expected, fetcher(expected))
  for (const html of [expected.replace('new introduction', 'old introduction'), expected.replace('stable 0.5.0', 'stable 0.4.0'), expected.replace('<title>Survey', '<title>WorkWise')]) {
    await assert.rejects(verifyPublicContent(f.validated, expected, fetcher(html)), /rendering differs/)
  }
  await assert.rejects(verifyPublicContent(f.validated, expected, fetcher(expected, true)), /Public content hash mismatch/)
})

test('preview requires all three actual local image sources and rejects placeholder or metadata-only references', () => {
  const paths = CONTENT_FILES.filter((file) => file.endsWith('.jpg')).map((file) => `/${file}`)
  const valid = paths.map((path) => `<img src="${path}?v=preview" alt="candidate">`).join('')
  assert.doesNotThrow(() => validatePreviewScreenshots(valid))
  assert.doesNotThrow(() => validatePreviewScreenshots(paths.map((path) => `<img\n src='${path}'>`).join('')))
  const remaining = paths.slice(0, 2).map((path) => `<img src="${path}">`).join('')
  for (const missing of [
    '',
    `<img src="${paths[0]}">`,
    `<!-- <img src="${paths[2]}"> -->`,
    `<script>const example = '<img src="${paths[2]}">';</script>`,
    `<meta content="${paths[2]}"><a href="${paths[2]}">screenshot</a>`,
    `<img data-src="${paths[2]}" src="/images/placeholder.jpg">`,
    `<img src="https://www.railwise.cn${paths[2]}">`,
    `<img src="//www.railwise.cn${paths[2]}">`,
    `<img src="${paths[2].replace('.jpg', '.webp')}">`
  ]) assert.throws(() => validatePreviewScreenshots(remaining + missing), /Preview must render a local img src/)
})

test('preview proxy allows only fixed-origin static GETs and serves hash-verified local images', async (t) => {
  const f = fixture(t)
  const html = '<html>candidate preview</html>'
  put(join(f.stage, 'index.html'), html)
  put(join(f.stage, 'render-metadata.json'), JSON.stringify({ htmlSha256: sha256(html), files: f.validated.files }))
  const requests = []
  const server = createPreviewServer(f.stage, async (url, options) => {
    requests.push({ url: String(url), options })
    return new Response('body{}', { headers: { 'content-type': 'text/css' } })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  assert.equal(await (await fetch(`${origin}/products/workwise/`)).text(), html)
  assert.equal((await fetch(`${origin}/${CONTENT_FILES[1]}`)).status, 200)
  assert.equal((await fetch(`${origin}/css/product-detail.css?v=1`)).status, 200)
  assert.equal(requests[0].url, 'https://www.railwise.cn/css/product-detail.css?v=1')
  assert.equal(requests[0].options.redirect, 'manual')
  assert.equal((await fetch(`${origin}/contact`, { method: 'POST', body: 'x' })).status, 405)
  assert.equal((await fetch(`${origin}/downloads/workwise/file.exe`)).status, 404)
  for (const url of ['//evil.example/css/x.css', 'https://evil.example/x.css', '/css/../config.php', '/css/%2e%2e/private.css', '/api/delete.css', '/css/run.php']) assert.equal(previewResourceUrl(url), null)
  assert.equal(requests.length, 1)
})
