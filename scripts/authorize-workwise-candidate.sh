#!/usr/bin/env bash

# Prepare an isolated WorkWise candidate test area. This script deliberately
# does not build, install, launch, publish, or modify the production app.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
PACKAGE_JSON="${REPO_ROOT}/package.json"

DEFAULT_CANDIDATE_ROOT="${HOME}/Library/Application Support/WorkWise-Candidate"
CANDIDATE_ROOT="${WORKWISE_CANDIDATE_ROOT:-${DEFAULT_CANDIDATE_ROOT}}"
CANDIDATE_CREDENTIAL_HELPER="${WORKWISE_CANDIDATE_CREDENTIAL_HELPER:-}"
MODE="check"

usage() {
  cat <<'EOF'
Usage:
  scripts/authorize-workwise-candidate.sh [--check]
  scripts/authorize-workwise-candidate.sh --prepare

Modes:
  --check    Read-only safety checks. This is the default.
  --prepare  After an explicit confirmation, create isolated candidate
             directories and a local environment file for manual testing.

Environment:
  WORKWISE_CANDIDATE_ROOT  Override the isolated candidate directory.
  WORKWISE_CANDIDATE_CREDENTIAL_HELPER
                           Optional previously authorized candidate executable.
                           It must exist inside WORKWISE_CANDIDATE_ROOT.

This script never builds, installs, launches, signs, notarizes, publishes,
changes versions, moves tags, edits releases, promotes feeds, or updates the
website. Do not point WORKWISE_CANDIDATE_ROOT at a production data directory.
EOF
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '[workwise:candidate-auth] %s\n' "$*"
}

is_forbidden_path() {
  local path="$1"
  case "$path" in
    /Applications/WorkWise.app|/Applications/WorkWise.app/*|\
    "${HOME}/.workgpt"|"${HOME}/.workgpt"/*|\
    "${HOME}/.workwise"|"${HOME}/.workwise"/*|\
    "${HOME}/Library/Application Support/WorkWise"|\
    "${HOME}/Library/Application Support/WorkWise"/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

assert_safe_candidate_root() {
  local resolved
  resolved="$(mkdir -p -- "${CANDIDATE_ROOT}" && cd -- "${CANDIDATE_ROOT}" && pwd -P)"
  if is_forbidden_path "${resolved}"; then
    die "candidate root is a production path: ${resolved}"
  fi
  if [[ "${resolved}" == "${REPO_ROOT}" || "${REPO_ROOT}" == "${resolved}"/* ]]; then
    die "candidate root must not be inside the source repository: ${resolved}"
  fi
  CANDIDATE_ROOT="${resolved}"
}

validate_candidate_credential_helper() {
  [[ -n "${CANDIDATE_CREDENTIAL_HELPER}" ]] || return 0
  [[ "${CANDIDATE_CREDENTIAL_HELPER}" == /* ]] || \
    die "candidate credential helper must be an absolute path"
  [[ -x "${CANDIDATE_CREDENTIAL_HELPER}" ]] || \
    die "candidate credential helper is missing or not executable: ${CANDIDATE_CREDENTIAL_HELPER}"

  local helper_dir helper_name resolved
  helper_dir="$(cd -- "$(dirname -- "${CANDIDATE_CREDENTIAL_HELPER}")" && pwd -P)"
  helper_name="$(basename -- "${CANDIDATE_CREDENTIAL_HELPER}")"
  resolved="${helper_dir}/${helper_name}"
  case "${resolved}" in
    "${CANDIDATE_ROOT}"/*) ;;
    *) die "candidate credential helper must stay inside the isolated candidate root" ;;
  esac
  CANDIDATE_CREDENTIAL_HELPER="${resolved}"
}

read_package_version() {
  node -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(String(p.version || "unknown"));' "${PACKAGE_JSON}"
}

check_repo() {
  [[ "$(git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree 2>/dev/null)" == "true" ]] || die "not a Git worktree: ${REPO_ROOT}"
  [[ -f "${PACKAGE_JSON}" ]] || die "missing package.json: ${PACKAGE_JSON}"
  [[ -f "${REPO_ROOT}/AGENTS.md" || -f "${REPO_ROOT}/../AGENTS.md" || -f "${HOME}/Documents/WORKGPT/AGENTS.md" ]] || \
    die "delivery rules AGENTS.md could not be found"
}

check_forbidden_environment() {
  local name value
  for name in WORKWISE_PUBLIC_BASE_URL RELEASE_CHANNEL S3_BUCKET S3_ENDPOINT S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
    value="${!name-}"
    if [[ -n "${value}" ]]; then
      die "release-related environment variable is set: ${name}; unset it before candidate preparation"
    fi
  done
}

check() {
  check_repo
  check_forbidden_environment
  assert_safe_candidate_root
  validate_candidate_credential_helper

  local version branch
  version="$(read_package_version)"
  branch="$(git -C "${REPO_ROOT}" branch --show-current)"

  [[ "${version}" != "" && "${version}" != "unknown" ]] || die "package version is unreadable"
  [[ "${branch}" != "main" ]] || die "candidate work must not run from main"

  info "source: ${REPO_ROOT}"
  info "branch: ${branch}"
  info "package version: ${version}"
  info "isolated root: ${CANDIDATE_ROOT}"
  if [[ -n "${CANDIDATE_CREDENTIAL_HELPER}" ]]; then
    info "stable credential helper: ${CANDIDATE_CREDENTIAL_HELPER}"
  fi
  info "production app untouched: /Applications/WorkWise.app"
  info "read-only safety checks passed"
}

prepare() {
  check
  printf '\n'
  printf 'This will create only the isolated candidate directory:\n  %s\n' "${CANDIDATE_ROOT}"
  printf 'It will not touch /Applications/WorkWise.app or production user data.\n'
  printf 'Type exactly: AUTHORIZE WORKWISE CANDIDATE\n> '
  local confirmation
  IFS= read -r confirmation
  [[ "${confirmation}" == "AUTHORIZE WORKWISE CANDIDATE" ]] || die "authorization phrase did not match; nothing was prepared"

  umask 077
  mkdir -p -- "${CANDIDATE_ROOT}/user-data" "${CANDIDATE_ROOT}/cache" "${CANDIDATE_ROOT}/logs" "${CANDIDATE_ROOT}/home"
  chmod 700 "${CANDIDATE_ROOT}" "${CANDIDATE_ROOT}/user-data" "${CANDIDATE_ROOT}/cache" "${CANDIDATE_ROOT}/logs" "${CANDIDATE_ROOT}/home"

  cat > "${CANDIDATE_ROOT}/candidate.env" <<EOF
# Generated by authorize-workwise-candidate.sh.
# Source this file only when manually launching an isolated candidate.
WORKWISE_CANDIDATE=1
WORKWISE_CANDIDATE_ROOT=${CANDIDATE_ROOT}
WORKWISE_CANDIDATE_USER_DATA=${CANDIDATE_ROOT}/user-data
WORKWISE_CANDIDATE_CACHE=${CANDIDATE_ROOT}/cache
WORKWISE_CANDIDATE_LOGS=${CANDIDATE_ROOT}/logs
WORKWISE_CANDIDATE_HOME=${CANDIDATE_ROOT}/home
WORKWISE_TOOLS_ROOT=${CANDIDATE_ROOT}/home/.workwise/tools
WORKWISE_UPDATE_PROVIDER=none
# Candidate IM outbound is disabled unless a separately authorized test sets it to 0.
WORKWISE_CANDIDATE_OUTBOUND_DISABLED=1
# Candidate IM inbound is disabled until one provider, chat and exact command
# are explicitly allowlisted for a bounded acceptance check.
WORKWISE_CANDIDATE_INBOUND_DISABLED=1
EOF
  if [[ -n "${CANDIDATE_CREDENTIAL_HELPER}" ]]; then
    # This file is both read by the recovery candidate and usable with
    # `source`; quote the only generated path that commonly contains spaces.
    printf "WORKWISE_CANDIDATE_CREDENTIAL_HELPER='%s'\n" "${CANDIDATE_CREDENTIAL_HELPER}" >> "${CANDIDATE_ROOT}/candidate.env"
  fi
  chmod 600 "${CANDIDATE_ROOT}/candidate.env"

  info "isolated candidate area prepared"
  info "environment file: ${CANDIDATE_ROOT}/candidate.env"
  info "no application was launched and no production data was changed"
  printf '\nNext steps are intentionally manual:\n'
  printf '  1. Review the candidate package and the generated environment file.\n'
  printf '  2. Launch only a candidate app configured to use WORKWISE_CANDIDATE_USER_DATA.\n'
  printf '  3. Do not use --use-mock-keychain for credential acceptance.\n'
}

while (($#)); do
  case "$1" in
    --check) MODE="check" ;;
    --prepare) MODE="prepare" ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
  shift
done

case "${MODE}" in
  check) check ;;
  prepare) prepare ;;
esac
