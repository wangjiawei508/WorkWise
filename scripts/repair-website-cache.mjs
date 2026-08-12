#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const mode = process.argv[2] || 'inspect'
if (!['inspect', 'apply'].includes(mode)) throw new Error('Mode must be inspect or apply.')

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function readSshConfig() {
  const host = String(process.env.WORKWISE_WEBSITE_SSH_HOST || '').trim()
  const port = String(process.env.WORKWISE_WEBSITE_SSH_PORT || '').trim()
  const user = String(process.env.WORKWISE_WEBSITE_SSH_USER || '').trim()
  const keyPath = resolve(String(process.env.WORKWISE_WEBSITE_SSH_KEY_PATH || ''))
  const knownHostsPath = resolve(String(process.env.WORKWISE_WEBSITE_SSH_KNOWN_HOSTS_PATH || ''))
  if (!host || !port || !user || !existsSync(keyPath) || !existsSync(knownHostsPath)) {
    throw new Error('Website SSH configuration is incomplete.')
  }
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new Error('Invalid website SSH host.')
  }
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Invalid website SSH port.')
  }
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(user)) throw new Error('Invalid website SSH user.')
  for (const path of [keyPath, knownHostsPath]) {
    if (!statSync(path).isFile()) throw new Error(`SSH path is not a file: ${path}`)
  }
  return { host, port, user, keyPath, knownHostsPath }
}

function runRemote(config) {
  const remote = `bash -s -- ${shellQuote(mode)}`
  return execFileSync(
    'ssh',
    [
      '-p', config.port,
      '-i', config.keyPath,
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${config.knownHostsPath}`,
      `${config.user}@${config.host}`,
      remote
    ],
    { input: REMOTE_SCRIPT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
}

function validateDiagnostics(output) {
  const diagnostics = new Map()
  for (const line of String(output).split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    diagnostics.set(line.slice(0, separator), line.slice(separator + 1))
  }
  const required = [
    'nginx_binary',
    'nginx_config_test',
    'railwise_server_config',
    'workwise_cache_rule_count',
    'server_7d_cache_directive_count'
  ]
  const missing = required.filter((key) => !diagnostics.has(key))
  if (missing.length) {
    throw new Error(`Remote cache inspection returned incomplete diagnostics: ${missing.join(', ')}`)
  }
  if (diagnostics.get('nginx_binary') === 'missing') {
    throw new Error('Remote cache inspection did not locate nginx or OpenResty.')
  }
  if (diagnostics.get('nginx_config_test') !== 'passed') {
    throw new Error('Remote nginx/OpenResty configuration test did not pass.')
  }
  if (diagnostics.get('railwise_server_config') === 'missing') {
    throw new Error('Remote cache inspection did not locate the railwise.cn server configuration.')
  }
  return output
}

const REMOTE_SCRIPT = String.raw`set -euo pipefail
mode="$1"
target_host='www.railwise.cn'

run_privileged() {
  case "$privilege_mode" in
    root) "$@" ;;
    sudo) sudo -n "$@" ;;
    *) "$@" ;;
  esac
}

privilege_mode=unavailable
if [[ "$(id -u)" == 0 ]]; then
  privilege_mode=root
elif sudo -n true 2>/dev/null; then
  privilege_mode=sudo
fi

nginx_bin=""
nginx_candidate_count=0
host_candidate_matches() {
  local candidate="$1"
  [[ -n "$candidate" ]] || return 1
  if ! { [[ -x "$candidate" ]] || run_privileged test -x "$candidate" 2>/dev/null; }; then
    return 1
  fi
  if ! run_privileged "$candidate" -t >/dev/null 2>&1; then
    return 1
  fi
  ((nginx_candidate_count += 1))
  run_privileged "$candidate" -T 2>&1 \
    | grep -Eiq 'server_name[^;]*[[:space:]]www[.]railwise[.]cn([[:space:]]|;)'
}

if command -v ps >/dev/null 2>&1; then
  while IFS= read -r candidate; do
    if host_candidate_matches "$candidate"; then
      nginx_bin="$candidate"
      break
    fi
  done < <(ps -eo args= | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^\/.+\/(nginx|openresty)$/) print $i }' | sort -u)
fi
if [[ -z "$nginx_bin" ]] && command -v pgrep >/dev/null 2>&1 && command -v readlink >/dev/null 2>&1; then
  for process_name in nginx openresty; do
    while IFS= read -r pid; do
      candidate="$(run_privileged readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
      if host_candidate_matches "$candidate"; then
        nginx_bin="$candidate"
        break 2
      fi
    done < <(pgrep -x "$process_name" || true)
  done
fi
for candidate in \
  openresty nginx \
  /usr/sbin/nginx /usr/local/sbin/nginx /usr/local/nginx/sbin/nginx \
  /usr/local/openresty/bin/openresty /usr/local/openresty/nginx/sbin/nginx \
  /opt/openresty/bin/openresty /opt/openresty/nginx/sbin/nginx \
  /opt/nginx/sbin/nginx /www/server/nginx/sbin/nginx \
  /opt/1panel/apps/openresty/openresty/bin/openresty \
  /opt/1panel/apps/openresty/openresty/nginx/sbin/nginx \
  /opt/1panel/apps/nginx/nginx/sbin/nginx; do
  [[ -n "$nginx_bin" ]] && break
  if [[ "$candidate" == */* ]]; then
    if host_candidate_matches "$candidate"; then
      nginx_bin="$candidate"
      break
    fi
  else
    resolved="$(command -v "$candidate" || true)"
    if host_candidate_matches "$resolved"; then
      nginx_bin="$resolved"
      break
    fi
  fi
done

nginx_container=""
container_user_flag=""
if [[ -z "$nginx_bin" ]] && command -v docker >/dev/null 2>&1; then
  while IFS= read -r container; do
    [[ -n "$container" ]] || continue
    for process_name in nginx openresty; do
      candidate_user_flag=""
      candidate="$(docker exec -u 0 "$container" sh -c "command -v $process_name" 2>/dev/null || true)"
      if [[ -z "$candidate" ]]; then
        candidate="$(docker exec "$container" sh -c "command -v $process_name" 2>/dev/null || true)"
        [[ -n "$candidate" ]] || continue
      else
        candidate_user_flag='-u 0'
      fi
      if docker exec $candidate_user_flag "$container" "$candidate" -t >/dev/null 2>&1; then
        ((nginx_candidate_count += 1))
      else
        continue
      fi
      if docker exec $candidate_user_flag "$container" "$candidate" -T 2>&1 \
        | grep -Eiq 'server_name[^;]*[[:space:]]www[.]railwise[.]cn([[:space:]]|;)'; then
        nginx_container="$container"
        nginx_bin="$candidate"
        container_user_flag="$candidate_user_flag"
        break 2
      fi
    done
  done < <(docker ps --format '{{.Names}}' 2>/dev/null || true)
fi

server_run() {
  if [[ -n "$nginx_container" ]]; then
    docker exec $container_user_flag "$nginx_container" "$@"
  else
    run_privileged "$@"
  fi
}

server_write_file() {
  local destination="$1"
  if [[ -n "$nginx_container" ]]; then
    docker exec $container_user_flag -i "$nginx_container" tee "$destination" >/dev/null
  else
    run_privileged tee "$destination" >/dev/null
  fi
}

server_file_exists() {
  server_run test -f "$1" 2>/dev/null
}

if [[ -z "$nginx_bin" ]]; then
  printf '%s\n' 'nginx_binary=missing'
  printf 'privilege_mode=%s\n' "$privilege_mode"
  printf 'nginx_candidate_count=%s\n' "$nginx_candidate_count"
  if command -v ps >/dev/null 2>&1; then
    printf 'server_processes='
    ps -eo comm= | awk '/^(nginx|openresty|caddy|httpd|apache2|traefik)$/ { print }' | sort -u | paste -sd, -
    printf '\n'
    printf 'server_process_args=\n'
    ps -eo args= | awk '/(nginx|openresty)/ { print }' | head -20
  fi
  if command -v systemctl >/dev/null 2>&1; then
    printf 'running_web_units='
    systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null \
      | awk '$1 ~ /(nginx|openresty|caddy|httpd|apache|traefik)/ { print $1 }' \
      | sort -u | paste -sd, -
    printf '\n'
  fi
  exit 2
fi

dump="$(mktemp)"
trap 'rm -f -- "$dump"' EXIT
if ! server_run "$nginx_bin" -T >"$dump" 2>&1; then
  printf 'nginx_binary=%s\nnginx_config_test=failed\n' "$(basename "$nginx_bin")"
  exit 3
fi

server_file="$(python3 - "$dump" <<'PY'
import pathlib
import re
import sys

target_host = 'www.railwise.cn'
current = ''
for raw in pathlib.Path(sys.argv[1]).read_text(errors='replace').splitlines():
    if raw.startswith('# configuration file '):
        current = raw.removeprefix('# configuration file ').removesuffix(':').strip()
    match = re.search(r'\bserver_name\b([^;]*);', raw, re.I)
    if current and match and target_host in match.group(1).split():
        print(current)
        break
PY
)"
if [[ -z "$server_file" ]] || ! server_file_exists "$server_file"; then
  printf 'nginx_binary=%s\nnginx_config_test=passed\nrailwise_server_config=missing\n' "$(basename "$nginx_bin")"
  exit 4
fi

marker='# WorkWise updater metadata cache policy'
rule_count="$(server_run grep -F -c "$marker" "$server_file" || true)"
expires_7d_count="$(server_run grep -E -c 'expires[[:space:]]+\+?7d|max-age[[:space:]]*=[[:space:]]*604800' "$server_file" || true)"
printf 'nginx_binary=%s\nnginx_config_test=passed\nrailwise_server_config=%s\nworkwise_cache_rule_count=%s\nserver_7d_cache_directive_count=%s\n' \
  "$(basename "$nginx_bin")" "$(basename "$server_file")" "$rule_count" "$expires_7d_count"

if [[ "$mode" == inspect ]]; then
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'apply=blocked_missing_python3'
  exit 6
fi

if [[ "$rule_count" != 0 ]]; then
  printf '%s\n' 'apply=already_present'
else
  backup="$server_file.workwise-cache-backup.$(date -u +%Y%m%dT%H%M%SZ)"
  config_temp="$server_file.workwise-cache-edit.$$"
  edit_file="$(mktemp)"
  trap 'rm -f -- "$dump" "$edit_file"' EXIT
  server_run cp -p -- "$server_file" "$backup"
  server_run cat "$server_file" >"$edit_file"
  python3 - "$edit_file" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()
target_host = 'www.railwise.cn'
server_name = next((
    match for match in re.finditer(r'(?m)^\s*server_name\b([^;]*);', text, re.I)
    if target_host in match.group(1).split()
), None)
if server_name is None:
    raise SystemExit('www.railwise.cn server_name was not found in the selected config')
server_blocks = list(re.finditer(r'(?m)^\s*server\s*\{', text[:server_name.start()]))
if not server_blocks:
    raise SystemExit('railwise server block was not found')
server_start = server_blocks[-1].start()
server_open = text.find('{', server_start, server_blocks[-1].end())

depth = 0
quote = ''
comment = False
close = -1
for index in range(server_open, len(text)):
    char = text[index]
    next_char = text[index + 1] if index + 1 < len(text) else ''
    if comment:
        if char == '\n': comment = False
        continue
    if quote:
        if char == quote and text[index - 1] != '\\': quote = ''
        continue
    if char == '#':
        comment = True
    elif char in ("'", '"'):
        quote = char
    elif char == '{':
        depth += 1
    elif char == '}':
        depth -= 1
        if depth == 0:
            close = index
            break
if close < 0:
    raise SystemExit('railwise server block closing brace was not found')

location = '''
    # WorkWise updater metadata cache policy
    location ~ ^/downloads/workwise/(?:acceptance/[0-9]+/)?channels/(?:stable|frontier)/latest/(?:latest\.json|latest(?:-mac)?\.yml)$ {
        expires off;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }
'''
path.write_text(text[:server_open + 1] + location + text[server_open + 1:])
PY
  server_run cp -p -- "$server_file" "$config_temp"
  server_write_file "$config_temp" <"$edit_file"
  server_run mv -f -- "$config_temp" "$server_file"
  if ! server_run "$nginx_bin" -t; then
    server_run cp -p -- "$backup" "$server_file"
    server_run "$nginx_bin" -t
    printf 'apply=rolled_back\nbackup=%s\n' "$(basename "$backup")"
    exit 5
  fi
  if ! server_run "$nginx_bin" -s reload; then
    server_run cp -p -- "$backup" "$server_file"
    server_run "$nginx_bin" -t
    server_run "$nginx_bin" -s reload
    printf 'apply=rolled_back_reload_failed\nbackup=%s\n' "$(basename "$backup")"
    exit 7
  fi
  printf 'apply=applied\nbackup=%s\n' "$(basename "$backup")"
fi
`

const diagnostics = validateDiagnostics(runRemote(readSshConfig()))
process.stdout.write(`[repair-website-cache] validated remote diagnostics\n${diagnostics}`)
