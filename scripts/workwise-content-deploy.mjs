import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const CONTENT_FILES = Object.freeze([
  'products/workwise/index.php',
  'products/screenshots/workwise/04-survey-candidate-zh-light.jpg',
  'products/screenshots/workwise/05-survey-candidate-delivery.jpg',
  'products/screenshots/workwise/06-candidate-model-settings.jpg',
  'products/screenshots/workwise/candidate-screenshots.json'
])
export const PROTECTED_FILES = Object.freeze(['includes/workwise_product.php', 'data/workwise-product.json'])
export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function validateContentSource(sourceDirectory, sourceSha, git = execFileSync) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha || '')) throw new Error('Content deployment requires an exact lowercase 40-hex --source-sha.')
  const source = resolve(sourceDirectory)
  const run = (args) => git('git', ['-C', source, ...args], { encoding: 'utf8' }).trim()
  if (run(['rev-parse', 'HEAD']) !== sourceSha) throw new Error('Checkout does not match --source-sha.')
  const prefix = run(['rev-parse', '--show-prefix'])
  const files = [...CONTENT_FILES, ...PROTECTED_FILES].map((relative) => {
    const data = readFileSync(resolve(source, relative))
    const committed = git('git', ['-C', source, 'show', `${sourceSha}:${prefix}${relative}`])
    if (!data.equals(Buffer.from(committed))) throw new Error(`Source differs from the exact commit: ${relative}`)
    return { relative, data, sha256: sha256(data) }
  })
  const provenance = JSON.parse(files.find((f) => f.relative.endsWith('candidate-screenshots.json')).data)
  if (provenance.locale !== 'zh-CN' || provenance.theme !== 'light' || provenance.released !== false) throw new Error('Expected Chinese light candidate screenshot provenance.')
  const images = files.filter((f) => f.relative.endsWith('.jpg'))
  if (provenance.screenshots?.length !== images.length) throw new Error('Screenshot provenance must describe exactly three images.')
  for (const file of images) {
    if (provenance.screenshots.filter((s) => s.path === file.relative.split('/').at(-1) && s.sha256 === file.sha256).length !== 1) throw new Error(`Screenshot provenance mismatch: ${file.relative}`)
  }
  return { sourceSha, files }
}

// Execute each page in an isolated PHP process with its real __DIR__. Only the
// download section is returned: headers and unrelated dynamic markup are ignored.
export const PHP_RENDER_DOWNLOAD = String.raw`
$page = stream_get_contents(STDIN);
$directory = $argv[1];
$code = '';
foreach (token_get_all($page) as $token) {
  $code .= is_array($token) ? ($token[0] === T_DIR ? var_export($directory, true) : $token[1]) : $token;
}
$_SERVER['DOCUMENT_ROOT'] = dirname($directory, 2);
$_SERVER['HTTP_HOST'] = 'www.railwise.cn';
$_SERVER['REQUEST_URI'] = '/products/workwise/';
ob_start();
eval('?>' . $code);
$html = ob_get_clean();
if (preg_match_all('/<section\\b[^>]*\\bid="download"[^>]*>.*?<\\/section>/s', $html, $matches) !== 1) { fwrite(STDERR, 'Expected one rendered download section'); exit(65); }
echo hash('sha256', $matches[0][0]);
`

export const PHP_COMPARE_DOWNLOAD_SOURCE = String.raw`
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$sections = [];
foreach ($input as $page) {
  if (preg_match_all('/<section\\b[^>]*\\bid="download"[^>]*>.*?<\\/section>/s', $page, $matches) !== 1) { exit(65); }
  $sections[] = $matches[0][0];
}
if (count($sections) !== 2 || $sections[0] !== $sections[1]) { fwrite(STDERR, 'Download section source changed'); exit(65); }
`

const quote = (s) => `'${String(s).replaceAll("'", "'\\''")}'`
export const REMOTE_RUNTIME = String.raw`
release_root="$1"
deploy_id="$2"
case "$release_root" in /opt/1panel/1panel/www/sites/www.railwise.cn/index/downloads/workwise) ;; *) exit 64 ;; esac
case "$deploy_id" in ''|*[!A-Za-z0-9._-]*) exit 64 ;; esac
site_root='/www/sites/www.railwise.cn/index'
web_container=''
php_container=''
web_count=0
php_count=0
for candidate in $(docker ps -q); do
  image="$(docker inspect --format '{{.Config.Image}}' "$candidate")"
  case "$image" in
    1panel/openresty:*|*/1panel/openresty:*)
      if docker inspect --format '{{range .Mounts}}{{println .Source .Destination .RW}}{{end}}' "$candidate" | grep -Fqx '/opt/1panel/1panel/www /www true'; then
        web_container="$candidate"; web_count=$((web_count + 1))
      fi ;;
    1panel-php-fpm:*|*/1panel-php-fpm:*) php_container="$candidate"; php_count=$((php_count + 1)) ;;
  esac
done
[ "$web_count" -eq 1 ] && [ "$php_count" -eq 1 ] || { echo 'Ambiguous website runtime' >&2; exit 65; }
container_run() { docker exec -u 0 "$web_container" "$@"; }
container_write() { docker exec -i -u 0 "$web_container" tee "$1" >/dev/null; }
php_run() { docker exec -i "$php_container" php "$@"; }
stage="/tmp/workwise-product-deploy-$deploy_id/payload"
backup="/www/sites/www.railwise.cn/.workwise-content-backups/$deploy_id"
`

export function remoteContentScript(action, validated, runtime = REMOTE_RUNTIME) {
  if (!['deploy', 'rollback', 'verify'].includes(action)) throw new Error('Invalid content action.')
  const protectedChecks = PROTECTED_FILES.map((relative) => {
    const hash = validated.files.find((f) => f.relative === relative)?.sha256
    if (!/^[a-f0-9]{64}$/.test(hash || '')) throw new Error('Missing protected source hash.')
    return `[ "$(container_run sha256sum "$site_root/${relative}" | cut -d ' ' -f 1)" = '${hash}' ] || { echo 'Protected file differs: ${relative}' >&2; return 65; }`
  }).join('\n')
  const allowed = CONTENT_FILES.map(quote).join(' ')
  const hashes = validated.files.filter((f) => CONTENT_FILES.includes(f.relative)).map((f) => `${f.sha256}  ${f.relative}`).join('\n')
  return `set -euo pipefail
${runtime}
verify_protected() {
${protectedChecks}
}
render_download() { php_run -r ${quote(PHP_RENDER_DOWNLOAD)} -- "$site_root/products/workwise"; }
restore_content() {
  container_run test -f "$backup/ready" || return 65
  failed=0
  for relative in ${allowed}; do
    if container_run test -f "$backup/$relative.present"; then
      expected_file="$(container_run cat "$backup/$relative.sha256")" || return 65
      [ "$(container_run sha256sum "$backup/$relative" | cut -d ' ' -f 1)" = "$expected_file" ] || return 65
      container_run cp -p "$backup/$relative" "$site_root/$relative" || failed=1
      [ "$(container_run sha256sum "$site_root/$relative" | cut -d ' ' -f 1)" = "$expected_file" ] || failed=1
    elif container_run test -f "$backup/$relative.absent"; then
      container_run rm -f "$site_root/$relative" || failed=1
    else
      echo 'Missing backup inventory; refusing destructive rollback' >&2
      return 65
    fi
    container_run rm -f "$site_root/$relative.workwise-content-next" || failed=1
  done
  verify_protected || failed=1
  expected="$(container_run cat "$backup/download.sha256")" || return 65
  actual="$(container_run cat "$site_root/products/workwise/index.php" | render_download)" || return 65
  [ "$actual" = "$expected" ] || failed=1
  [ "$failed" -eq 0 ]
}
verify_protected
${action === 'rollback' ? `[ "$(container_run cat "$backup/source-sha")" = '${validated.sourceSha}' ]
restore_content
echo 'Content rollback verified; include and download manifest unchanged.'` : action === 'verify' ? `container_run test -f "$backup/ready"
[ "$(container_run cat "$backup/source-sha")" = '${validated.sourceSha}' ]
expected="$(container_run cat "$backup/download.sha256")"
actual="$(container_run cat "$site_root/products/workwise/index.php" | render_download)"
[ "$actual" = "$expected" ]
for relative in ${allowed}; do
  expected="$(printf '%s\\n' ${quote(hashes)} | awk -v file="$relative" '$2 == file { print $1 }')"
  [ "$(container_run sha256sum "$site_root/$relative" | cut -d ' ' -f 1)" = "$expected" ]
done
verify_protected
echo 'Content hashes and unchanged download rendering verified.'` : `container_run test ! -e "$backup" || { echo 'Deployment ID already exists' >&2; exit 65; }
cd "$stage"
for relative in ${allowed}; do
  container_run test ! -L "$site_root/$relative"
  container_run test ! -e "$site_root/$relative.workwise-content-next"
  container_run test ! -L "$site_root/$relative.workwise-content-next"
  container_run test ! -L "$site_root/$(dirname "$relative")"
done
printf '%s\\n' ${quote(hashes)} | sha256sum -c - >/dev/null
php_run -l < products/workwise/index.php >/dev/null
live_page="$(container_run cat "$site_root/products/workwise/index.php")"
# JSON encoding runs in PHP; neither page content nor its rendered output is logged.
{ printf '%s\\0' "$live_page"; cat products/workwise/index.php; } | php_run -r '$p=explode("\\0",stream_get_contents(STDIN),2); echo json_encode($p, JSON_THROW_ON_ERROR);' | php_run -r ${quote(PHP_COMPARE_DOWNLOAD_SOURCE)}
before="$(printf '%s' "$live_page" | render_download)"
after="$(render_download < products/workwise/index.php)"
[ "$before" = "$after" ] || { echo 'Download rendering differs' >&2; exit 65; }
verify_protected
container_run install -d -m 700 "$backup"
for relative in ${allowed}; do
  parent="$(dirname "$relative")"
  container_run install -d -m 700 "$backup/$parent"
  if container_run test -e "$site_root/$relative"; then
    container_run test -f "$site_root/$relative"
    container_run cp -p "$site_root/$relative" "$backup/$relative"
    container_run sha256sum "$backup/$relative" | cut -d ' ' -f 1 | container_write "$backup/$relative.sha256"
    container_run touch "$backup/$relative.present"
  else
    container_run touch "$backup/$relative.absent"
  fi
done
printf '%s' "$before" | container_write "$backup/download.sha256"
printf '%s' '${validated.sourceSha}' | container_write "$backup/source-sha"
container_run touch "$backup/ready"
rollback_on_failure() {
  code=$?
  trap - EXIT HUP INT TERM
  if [ "$code" -ne 0 ]; then restore_content || { echo 'Content rollback failed' >&2; exit 70; }; fi
  exit "$code"
}
trap rollback_on_failure EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
for relative in ${allowed}; do
  container_run install -d -m 755 "$site_root/$(dirname "$relative")"
  next="$site_root/$relative.workwise-content-next"
  if container_run test -f "$site_root/$relative"; then container_run cp -p "$site_root/$relative" "$next"; else container_run touch "$next"; container_run chmod 644 "$next"; fi
  container_write "$next" < "$relative"
  container_run mv -f "$next" "$site_root/$relative"
done
verify_protected
[ "$(container_run cat "$site_root/products/workwise/index.php" | render_download)" = "$before" ]
trap - EXIT HUP INT TERM
echo 'Content deployed; download manifest, include and download rendering unchanged.'`}
`
}

export async function runContentCommand({ command, source, sourceSha, deployId, config, transport }) {
  const validated = validateContentSource(source, sourceSha)
  if (command === 'validate') return console.log('Validated exact content source and screenshot provenance.')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(deployId || '')) throw new Error('Missing or invalid content --deploy-id.')
  if (command === 'deploy') {
    const stage = transport.runRemote(config, `set -euo pipefail\nstage="/tmp/workwise-product-deploy-$1/payload"\ninstall -d -m 700 "$stage/products/workwise" "$stage/products/screenshots/workwise"\nprintf '%s' "$stage"`, [deployId]).trim()
    if (stage !== `/tmp/workwise-product-deploy-${deployId}/payload`) throw new Error('Unrecognized content stage.')
    for (const relative of CONTENT_FILES) transport.copyToStage(config, resolve(source, relative), `${stage}/${relative}`)
  }
  const action = command === 'verify-public' ? 'verify' : command
  console.log(transport.runRemote(config, remoteContentScript(action, validated), [config.releaseRoot, deployId]))
  if (command === 'verify-public') {
    const page = await fetch(`https://www.railwise.cn/products/workwise/?content=${sourceSha}&t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    if (!page.ok) throw new Error(`Product page returned HTTP ${page.status}.`)
    const html = await page.text()
    for (const file of validated.files.filter((f) => f.relative.endsWith('.jpg'))) {
      if (!html.includes(`/${file.relative}`)) throw new Error(`Public screenshot reference missing: ${file.relative}`)
      const image = await fetch(`https://www.railwise.cn/${file.relative}?content=${sourceSha}`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
      if (!image.ok || sha256(Buffer.from(await image.arrayBuffer())) !== file.sha256) throw new Error(`Public screenshot hash mismatch: ${file.relative}`)
    }
    console.log('Public candidate screenshot references and bytes verified.')
  }
}
