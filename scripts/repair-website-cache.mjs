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

const REMOTE_SCRIPT = String.raw`set -euo pipefail
mode="$1"

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
if command -v ps >/dev/null 2>&1; then
  candidate="$(ps -eo args= | awk '$0 ~ /(nginx|openresty):[[:space:]]+master[[:space:]]+process/ { for (i = 1; i <= NF; i++) if ($i ~ /^\/.+\/(nginx|openresty)$/) { print $i; exit } }')"
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    nginx_bin="$candidate"
  fi
fi
if command -v pgrep >/dev/null 2>&1 && command -v readlink >/dev/null 2>&1; then
  for process_name in nginx openresty; do
    while IFS= read -r pid; do
      candidate="$(run_privileged readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
      if [[ -n "$candidate" && -x "$candidate" ]]; then
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
  /opt/nginx/sbin/nginx /www/server/nginx/sbin/nginx; do
  [[ -n "$nginx_bin" ]] && break
  if [[ "$candidate" == */* ]]; then
    if [[ -x "$candidate" ]] || run_privileged test -x "$candidate" 2>/dev/null; then
      nginx_bin="$candidate"
      break
    fi
  else
    resolved="$(command -v "$candidate" || true)"
    if [[ -n "$resolved" && -x "$resolved" ]]; then
      nginx_bin="$resolved"
      break
    fi
  fi
done
if [[ -z "$nginx_bin" ]]; then
  printf '%s\n' 'nginx_binary=missing'
  printf 'privilege_mode=%s\n' "$privilege_mode"
  if command -v ps >/dev/null 2>&1; then
    printf 'server_processes='
    ps -eo comm= | awk '/^(nginx|openresty|caddy|httpd|apache2|traefik)$/ { print }' | sort -u | paste -sd, -
    printf '\n'
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
if ! run_privileged "$nginx_bin" -T >"$dump" 2>&1; then
  printf 'nginx_binary=%s\nnginx_config_test=failed\n' "$(basename "$nginx_bin")"
  exit 3
fi

server_file="$(python3 - "$dump" <<'PY'
import pathlib
import re
import sys

current = ''
for raw in pathlib.Path(sys.argv[1]).read_text(errors='replace').splitlines():
    if raw.startswith('# configuration file '):
        current = raw.removeprefix('# configuration file ').removesuffix(':').strip()
    if current and re.search(r'\\bserver_name\\b[^;]*\\brailwise\\.cn\\b', raw, re.I):
        print(current)
        break
PY
)"
if [[ -z "$server_file" || ! -f "$server_file" ]]; then
  printf 'nginx_binary=%s\nnginx_config_test=passed\nrailwise_server_config=missing\n' "$(basename "$nginx_bin")"
  exit 4
fi

marker='# WorkWise updater metadata cache policy'
rule_count="$(run_privileged grep -F -c "$marker" "$server_file" || true)"
expires_7d_count="$(run_privileged grep -E -c 'expires[[:space:]]+\\+?7d|max-age[[:space:]]*=[[:space:]]*604800' "$server_file" || true)"
printf 'nginx_binary=%s\nnginx_config_test=passed\nrailwise_server_config=%s\nworkwise_cache_rule_count=%s\nserver_7d_cache_directive_count=%s\n' \
  "$(basename "$nginx_bin")" "$(basename "$server_file")" "$rule_count" "$expires_7d_count"

if [[ "$mode" == inspect ]]; then
  exit 0
fi

if [[ "$rule_count" != 0 ]]; then
  printf '%s\n' 'apply=already_present'
else
  backup="\${server_file}.workwise-cache-backup.$(date -u +%Y%m%dT%H%M%SZ)"
  run_privileged cp -p -- "$server_file" "$backup"
  run_privileged python3 - "$server_file" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()
server_name = re.search(r'(?m)^\\s*server_name\\b[^;]*\\brailwise\\.cn\\b[^;]*;', text, re.I)
if not server_name:
    raise SystemExit('railwise server_name was not found in the selected config')
server_start = text.rfind('server', 0, server_name.start())
server_open = text.find('{', server_start, server_name.start())
if server_start < 0 or server_open < 0:
    raise SystemExit('railwise server block was not found')

depth = 0
quote = ''
comment = False
close = -1
for index in range(server_open, len(text)):
    char = text[index]
    next_char = text[index + 1] if index + 1 < len(text) else ''
    if comment:
        if char == '\\n': comment = False
        continue
    if quote:
        if char == quote and text[index - 1] != '\\\\': quote = ''
        continue
    if char == '#':
        comment = True
    elif char in "'\\\"":
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
    location ~ ^/downloads/workwise/(?:acceptance/[0-9]+/)?channels/(?:stable|frontier)/latest/(?:latest\\.json|latest(?:-mac)?\\.yml)$ {
        expires off;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }
'''
path.write_text(text[:close] + location + text[close:])
PY
  if ! run_privileged "$nginx_bin" -t; then
    run_privileged cp -p -- "$backup" "$server_file"
    run_privileged "$nginx_bin" -t
    printf 'apply=rolled_back\nbackup=%s\n' "$(basename "$backup")"
    exit 5
  fi
  run_privileged "$nginx_bin" -s reload
  printf 'apply=applied\nbackup=%s\n' "$(basename "$backup")"
fi
`

process.stdout.write(runRemote(readSshConfig()))
