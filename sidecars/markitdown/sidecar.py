#!/usr/bin/env python3
"""Constrained local-only MarkItDown bridge for WorkWise."""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

from markitdown import MarkItDown


ENGINE_VERSION = "markitdown-v0.1.4-workwise-1"
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx"}
MAX_INPUT_BYTES = 200 * 1024 * 1024


def contained(root: Path, target: Path) -> bool:
    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def safe_path(raw: Any, field: str) -> Path:
    if not isinstance(raw, str) or not raw.strip() or "\x00" in raw:
        raise ValueError(f"{field} is required")
    return Path(raw).expanduser().resolve(strict=False)


def headings(markdown: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for line in markdown.splitlines():
        match = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if match:
            result.append({"level": len(match.group(1)), "text": match.group(2)})
    return result[:2000]


def tables(markdown: str) -> list[dict[str, str]]:
    lines = markdown.splitlines()
    result: list[dict[str, str]] = []
    index = 0
    while index + 1 < len(lines):
        if "|" in lines[index] and re.match(r"^\s*\|?\s*:?-{3,}", lines[index + 1]):
            block = [lines[index], lines[index + 1]]
            index += 2
            while index < len(lines) and "|" in lines[index] and lines[index].strip():
                block.append(lines[index])
                index += 1
            result.append({"markdown": "\n".join(block)})
            if len(result) >= 500:
                break
            continue
        index += 1
    return result


def run(request: dict[str, Any]) -> dict[str, Any]:
    started = time.monotonic()
    workspace = safe_path(request.get("workspaceRoot"), "workspaceRoot").resolve(strict=True)
    source = safe_path(request.get("inputPath"), "inputPath").resolve(strict=True)
    output = safe_path(request.get("outputDirectory"), "outputDirectory")
    if not workspace.is_dir():
        raise ValueError("workspaceRoot must be a directory")
    if not contained(workspace, source) or not contained(workspace, output):
        raise ValueError("input and output must stay within workspaceRoot")
    if not source.is_file() or source.is_symlink():
        raise ValueError("input must be a regular non-link file")
    if source.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError("unsupported document format")
    if source.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("document exceeds the 200 MiB limit")

    output.mkdir(parents=True, exist_ok=True)
    converter = MarkItDown(enable_plugins=False)
    # convert_local is deliberately used: the sidecar never accepts a URL and
    # never invokes MarkItDown's permissive remote conversion path.
    result = converter.convert_local(str(source))
    markdown = (result.text_content or "").replace("\r\n", "\n")
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    markdown_path = output / "document.md"
    markdown_path.write_text(markdown, encoding="utf-8", newline="\n")
    payload = {
        "ok": True,
        "engine": "markitdown",
        "engineVersion": ENGINE_VERSION,
        "sourceSha256": source_hash,
        "markdownPath": str(markdown_path.relative_to(workspace)),
        "headings": headings(markdown),
        "tables": tables(markdown),
        "media": [],
        "references": [],
        "warnings": [],
        "durationMs": int((time.monotonic() - started) * 1000),
    }
    (output / "result.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return payload


def main() -> int:
    # The bridge accepts exactly one bounded JSON request on stdin. Environment
    # proxy variables are removed as an additional network-denial safeguard.
    for name in list(os.environ):
        if name.lower().endswith("_proxy") or name.lower() == "no_proxy":
            os.environ.pop(name, None)
    raw = sys.stdin.buffer.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise ValueError("request exceeds 1 MiB")
    request = json.loads(raw.decode("utf-8"))
    if not isinstance(request, dict):
        raise ValueError("request must be an object")
    print(json.dumps(run(request), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # return a stable protocol error, not a traceback
        print(json.dumps({"ok": False, "code": "document_parse_failed", "message": str(error)}, ensure_ascii=False))
        raise SystemExit(2)
