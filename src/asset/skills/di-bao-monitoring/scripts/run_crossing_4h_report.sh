#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKDIR="${DIBAO_WORKDIR:-$(pwd)}"
OUTPUT_DIR="${DIBAO_OUTPUT_DIR:-平台数据输出}"
PROJECT_NAME="${DIBAO_PROJECT_NAME:-轨道交通控制保护区监测项目}"
WORK_CONDITION="${DIBAO_WORK_CONDITION:-{{当前施工工况}}}"
BASE_URL="${DIBAO_PLATFORM_BASE_URL:-}"
PRJID="${DIBAO_PLATFORM_PRJID:-}"
ADJUST_NET_ID="${DIBAO_ADJUST_NET_ID:-}"
PYTHON_BIN="${DIBAO_PYTHON:-python3}"
SOFFICE_BIN="${DIBAO_SOFFICE:-/Applications/LibreOffice.app/Contents/MacOS/soffice}"
TEMPLATE_PATH="${DIBAO_REPORT_TEMPLATE:-$SCRIPT_DIR/../assets/快报模板.xlsx}"
FULL_TEMPLATE_PATH="${DIBAO_FULL_REPORT_TEMPLATE:-$SCRIPT_DIR/../assets/完整报表模板.xlsx}"
INITIAL_REPORT="${DIBAO_INITIAL_REPORT:-}"
IMAGE_LEFT="${DIBAO_IMAGE_LEFT:-}"
IMAGE_RIGHT="${DIBAO_IMAGE_RIGHT:-}"
POINT_ALIAS_MAP="${DIBAO_POINT_ALIAS_MAP:-}"
MANUAL_OVERRIDES="${DIBAO_MANUAL_OVERRIDES:-}"
DATA_GRACE_MINUTES="${DIBAO_DATA_GRACE_MINUTES:-20}"
PREVIOUS_DATA_GRACE_MINUTES="${DIBAO_PREVIOUS_DATA_GRACE_MINUTES:-20}"

if [[ -z "$BASE_URL" || -z "$PRJID" || -z "$ADJUST_NET_ID" ]]; then
  echo "ERROR: set DIBAO_PLATFORM_BASE_URL, DIBAO_PLATFORM_PRJID, and DIBAO_ADJUST_NET_ID." >&2
  exit 2
fi
if [[ -z "${DIBAO_PLATFORM_PASSWORD:-}" && -n "${DIBAO_KEYCHAIN_SERVICE:-}" && -n "${DIBAO_PLATFORM_USER:-}" ]]; then
  if command -v security >/dev/null 2>&1; then
    export DIBAO_PLATFORM_PASSWORD="$(security find-generic-password -s "$DIBAO_KEYCHAIN_SERVICE" -a "$DIBAO_PLATFORM_USER" -w 2>/dev/null || true)"
  fi
fi

cd "$WORKDIR"
mkdir -p "$OUTPUT_DIR" "$OUTPUT_DIR/pdfcheck"

META="$("$PYTHON_BIN" - <<'PY'
from datetime import datetime, timedelta
import os

cutoff_text = os.environ.get("DIBAO_CUTOFF_TIME", "").strip()
if cutoff_text:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d %H:%M"):
        try:
            cutoff = datetime.strptime(cutoff_text, fmt)
            break
        except ValueError:
            pass
    else:
        raise SystemExit(f"Unsupported DIBAO_CUTOFF_TIME: {cutoff_text}")
else:
    now = datetime.now()
    cutoff = now.replace(hour=now.hour - (now.hour % 4), minute=0, second=0, microsecond=0)
previous = cutoff - timedelta(hours=4)
print(cutoff.strftime("%Y-%m-%d %H:%M:%S"))
print(previous.strftime("%Y-%m-%d %H:%M:%S"))
print(cutoff.strftime("%Y/%-m/%-d %H:%M"))
print(cutoff.strftime("%Y%m%d"))
print(cutoff.strftime("%H"))
print(cutoff.strftime("%Y%m%d_%H0000_engineer_formula"))
PY
)"
CUTOFF_TIME="$(printf '%s\n' "$META" | sed -n '1p')"
PREVIOUS_CUTOFF="$(printf '%s\n' "$META" | sed -n '2p')"
DISPLAY_CURRENT="$(printf '%s\n' "$META" | sed -n '3p')"
DATE_LABEL="$(printf '%s\n' "$META" | sed -n '4p')"
HOUR_LABEL="$(printf '%s\n' "$META" | sed -n '5p')"
PREFIX="$(printf '%s\n' "$META" | sed -n '6p')"

FETCH_ARGS=(
  "$SCRIPT_DIR/fetch_adjusted_total_station.py"
  --base-url "$BASE_URL"
  --prjid "$PRJID"
  --adjust-net-id "$ADJUST_NET_ID"
  --report-cutoff-time "$CUTOFF_TIME"
  --data-grace-minutes "$DATA_GRACE_MINUTES"
  --require-current-at-or-after-cutoff
  --previous-report-cutoff-time "$PREVIOUS_CUTOFF"
  --previous-data-grace-minutes "$PREVIOUS_DATA_GRACE_MINUTES"
  --display-current-time "$DISPLAY_CURRENT"
  --report-cadence 4h
  --cumulative-source coordinate-formula
  --current-change-source previous-batch
  --initial-time "全站仪自动化平台初始值"
  --work-condition "$WORK_CONDITION"
  --output-dir "$OUTPUT_DIR"
  --prefix "$PREFIX"
  --project-name "$PROJECT_NAME"
)
"$PYTHON_BIN" "${FETCH_ARGS[@]}"

CSV_PATH="$OUTPUT_DIR/${PREFIX}_adjusted_total_station.csv"
XLSX_PATH="$OUTPUT_DIR/${PROJECT_NAME}_${DATE_LABEL}_${HOUR_LABEL}点_4小时快报.xlsx"
PDF_PATH="$OUTPUT_DIR/pdfcheck/${PROJECT_NAME}_${DATE_LABEL}_${HOUR_LABEL}点_4小时快报.pdf"
FULL_XLSX_PATH="$OUTPUT_DIR/${PROJECT_NAME}_${DATE_LABEL}_${HOUR_LABEL}点_4小时完整报表.xlsx"
FULL_PDF_PATH="$OUTPUT_DIR/pdfcheck/${PROJECT_NAME}_${DATE_LABEL}_${HOUR_LABEL}点_4小时完整报表.pdf"

BUILD_ARGS=(
  "$SCRIPT_DIR/build_crossing_total_station_xlsx.py"
  "$CSV_PATH"
  --template "$TEMPLATE_PATH"
  --work-condition "$WORK_CONDITION"
  --output "$XLSX_PATH"
)
[[ -n "$INITIAL_REPORT" ]] && BUILD_ARGS+=(--initial-report "$INITIAL_REPORT")
[[ -n "$IMAGE_LEFT" ]] && BUILD_ARGS+=(--image "$IMAGE_LEFT")
[[ -n "$IMAGE_RIGHT" ]] && BUILD_ARGS+=(--image-right "$IMAGE_RIGHT")
[[ -n "$POINT_ALIAS_MAP" ]] && BUILD_ARGS+=(--point-alias-map "$POINT_ALIAS_MAP")
[[ -n "$MANUAL_OVERRIDES" ]] && BUILD_ARGS+=(--manual-overrides "$MANUAL_OVERRIDES")
"$PYTHON_BIN" "${BUILD_ARGS[@]}"

if [[ -x "$SOFFICE_BIN" ]]; then
  "$SOFFICE_BIN" --headless --convert-to pdf --outdir "$OUTPUT_DIR/pdfcheck" "$XLSX_PATH"
else
  echo "LibreOffice not found at $SOFFICE_BIN; skipped PDF export." >&2
fi

if [[ -f "$FULL_TEMPLATE_PATH" ]]; then
  FULL_BUILD_ARGS=(
    "$SCRIPT_DIR/build_crossing_total_station_xlsx.py"
    "$CSV_PATH"
    --template "$FULL_TEMPLATE_PATH"
    --work-condition "$WORK_CONDITION"
    --output "$FULL_XLSX_PATH"
  )
  [[ -n "$INITIAL_REPORT" ]] && FULL_BUILD_ARGS+=(--initial-report "$INITIAL_REPORT")
  [[ -n "$IMAGE_LEFT" ]] && FULL_BUILD_ARGS+=(--image "$IMAGE_LEFT")
  [[ -n "$IMAGE_RIGHT" ]] && FULL_BUILD_ARGS+=(--image-right "$IMAGE_RIGHT")
  [[ -n "$POINT_ALIAS_MAP" ]] && FULL_BUILD_ARGS+=(--point-alias-map "$POINT_ALIAS_MAP")
  [[ -n "$MANUAL_OVERRIDES" ]] && FULL_BUILD_ARGS+=(--manual-overrides "$MANUAL_OVERRIDES")
  "$PYTHON_BIN" "${FULL_BUILD_ARGS[@]}"
  if [[ -x "$SOFFICE_BIN" ]]; then
    "$SOFFICE_BIN" --headless --convert-to pdf --outdir "$OUTPUT_DIR/pdfcheck" "$FULL_XLSX_PATH"
  fi
fi

if [[ "${DIBAO_SKIP_ARTIFACT_CLEANUP:-0}" != "1" ]]; then
  "$PYTHON_BIN" "$SCRIPT_DIR/clean_report_artifacts.py" "$OUTPUT_DIR" --quiet || true
fi

echo "Exported:"
echo "xlsx=$XLSX_PATH"
[[ -f "$PDF_PATH" ]] && echo "pdf=$PDF_PATH"
[[ -f "$FULL_XLSX_PATH" ]] && echo "full_xlsx=$FULL_XLSX_PATH"
[[ -f "$FULL_PDF_PATH" ]] && echo "full_pdf=$FULL_PDF_PATH"
