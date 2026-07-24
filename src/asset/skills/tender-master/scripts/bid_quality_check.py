#!/usr/bin/env python3
"""Lightweight local QC for bid proposal drafts.

This script is intentionally dependency-free so it can run in Codex, OpenClaw,
Hermes, or a plain Python environment.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Iterable

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".html", ".htm", ".json"}
PROPOSAL_EXTENSIONS = TEXT_EXTENSIONS | {".docx"}
MAX_INPUT_BYTES = 64 * 1024 * 1024
MAX_DOCX_ENTRIES = 10_000
MAX_DOCX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 200

PLACEHOLDER_PATTERNS = [
    r"\bTODO\b",
    r"\bTBD\b",
    r"待补充",
    r"待确认",
    r"公司名称",
    r"项目名称",
    r"客户名称",
    r"此处",
    r"示例",
    r"\{\{[^}]+\}\}",
    r"(?<!\{)\{[^{}\n]{1,120}\}(?!\})",
    r"\[[^\]]*(公司|项目|日期|姓名|金额)[^\]]*\]",
]

EVIDENCE_WORDS = [
    "证书",
    "认证",
    "授权",
    "案例",
    "合同",
    "发票",
    "截图",
    "检测报告",
    "承诺函",
    "人员",
    "社保",
    "资质",
]

REQUIREMENT_HINTS = [
    "必须",
    "须",
    "应",
    "不得",
    "评分",
    "分值",
    "资质",
    "参数",
    "响应",
    "提供",
    "证明",
    "承诺",
]


def read_text(path: Path) -> str:
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"input must be a regular file, not a link: {path}")
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError(f"input exceeds {MAX_INPUT_BYTES // (1024 * 1024)} MiB limit: {path}")
    suffix = path.suffix.lower()
    if suffix == ".docx":
        return read_docx_text(path)
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", errors="ignore")
    if suffix in {".html", ".htm"}:
        text = re.sub(r"(?is)<(script|style).*?</\1>", " ", text)
        text = re.sub(r"(?s)<[^>]+>", " ", text)
        text = html.unescape(text)
    if suffix == ".json":
        try:
            obj = json.loads(text)
            text = json_to_text(obj)
        except json.JSONDecodeError:
            pass
    return normalize(text)


def read_docx_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_DOCX_ENTRIES:
                raise ValueError(f"DOCX contains too many entries: {path}")
            total_size = sum(entry.file_size for entry in entries)
            total_compressed = sum(max(entry.compress_size, 1) for entry in entries)
            if total_size > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise ValueError(f"DOCX expands beyond safe limit: {path}")
            if total_size / total_compressed > MAX_DOCX_COMPRESSION_RATIO:
                raise ValueError(f"DOCX compression ratio exceeds safe limit: {path}")
            parts = [
                archive.read(name).decode("utf-8", errors="ignore")
                for name in archive.namelist()
                if name.startswith("word/") and name.endswith(".xml")
            ]
    except zipfile.BadZipFile:
        return ""
    text = "\n".join(parts)
    text = re.sub(r"<[^>]+>", " ", text)
    return normalize(html.unescape(text))


def json_to_text(obj: object) -> str:
    if isinstance(obj, dict):
        return "\n".join(str(k) + ": " + json_to_text(v) for k, v in obj.items())
    if isinstance(obj, list):
        return "\n".join(json_to_text(v) for v in obj)
    return "" if obj is None else str(obj)


def normalize(text: str) -> str:
    text = text.replace("\ufeff", "")
    text = text.replace("\u3000", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def iter_files(root: Path, extensions: set[str]) -> Iterable[Path]:
    if root.is_file():
        if not root.is_symlink() and root.suffix.lower() in extensions:
            yield root
        return
    for path in root.rglob("*"):
        if not path.is_symlink() and path.is_file() and path.suffix.lower() in extensions:
            yield path


def split_requirement_lines(text: str) -> list[str]:
    lines = re.split(r"[。\n\r；;]", text)
    results: list[str] = []
    for line in lines:
        item = normalize(line)
        if len(item) < 8:
            continue
        if any(hint in item for hint in REQUIREMENT_HINTS):
            results.append(item[:160])
    return dedupe(results)


def dedupe(items: Iterable[str]) -> list[str]:
    seen = set()
    out = []
    for item in items:
        key = item.lower()
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def requirement_tokens(requirement: str) -> list[str]:
    tokens = re.findall(r"[\w\u4e00-\u9fff]{2,}", requirement)
    stop = {"必须", "提供", "要求", "响应", "评分", "满足", "不得", "进行", "技术参数"}
    return [token for token in tokens if token not in stop][:8]


def requirement_covered(requirement: str, proposal_text: str) -> bool:
    req_compact = re.sub(r"[\s#：:，,。；;、]+", "", requirement)
    for word in ("必须", "须", "应", "提供", "要求", "响应", "评分", "满足", "不得", "进行", "技术参数"):
        req_compact = req_compact.replace(word, "")
    response_markers = (
        "我方满足",
        "我方响应",
        "我方支持",
        "我方承诺",
        "本方案",
        "投标方案",
        "配置为",
        "将提供",
        "已提供",
    )
    response_segments = [
        normalize(segment)
        for segment in re.split(r"[。\n\r；;]", proposal_text)
        if any(marker in segment for marker in response_markers)
    ]
    response_compact = "\n".join(re.sub(r"\s+", "", segment) for segment in response_segments)
    if 4 <= len(req_compact) <= 80 and req_compact in response_compact:
        return True
    phrase_parts = [
        part
        for part in re.split(r"[和及与并]", req_compact)
        if len(part) >= 4
    ]
    if phrase_parts and sum(1 for part in phrase_parts if part in response_compact) >= max(1, int(len(phrase_parts) * 0.6)):
        return True

    tokens = requirement_tokens(requirement)
    if not tokens:
        return True
    hits = sum(1 for token in tokens if token in response_compact)
    needed = len(tokens) if len(tokens) <= 2 else max(2, int(len(tokens) * 0.6))
    return hits >= needed


def main() -> int:
    parser = argparse.ArgumentParser(description="Check bid proposal draft quality.")
    parser.add_argument("--workspace", required=True, help="Proposal workspace or draft file.")
    parser.add_argument("--requirements", help="Requirement ledger file or directory.")
    parser.add_argument("--proposal", help="Proposal draft file or directory. Defaults to workspace.")
    parser.add_argument("--out", help="Write Markdown report to this path.")
    args = parser.parse_args()

    workspace = Path(args.workspace).resolve()
    proposal_root = Path(args.proposal).resolve() if args.proposal else workspace
    req_root = Path(args.requirements).resolve() if args.requirements else workspace / "01_requirements"

    def ensure_contained(candidate: Path, label: str) -> None:
        try:
            candidate.relative_to(workspace)
        except ValueError as error:
            raise ValueError(f"{label} must be inside workspace: {candidate}") from error

    if not workspace.exists() or workspace.is_symlink():
        print(f"无效工作区：{workspace}", file=sys.stderr)
        return 1
    try:
        ensure_contained(proposal_root, "proposal")
        ensure_contained(req_root, "requirements")
        if args.out:
            ensure_contained(Path(args.out).resolve(), "output")
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    findings: list[tuple[str, str, str]] = []

    proposal_files = list(iter_files(proposal_root, PROPOSAL_EXTENSIONS))
    if not proposal_files:
        findings.append(("BLOCKER", "No proposal files found", str(proposal_root)))

    proposal_texts = []
    for path in proposal_files:
        try:
            text = read_text(path)
        except (OSError, ValueError) as error:
            findings.append(("BLOCKER", f"Unreadable or unsafe proposal file: {error}", str(path)))
            continue
        proposal_texts.append(text)
        if len(text) < 500 and path.suffix.lower() in {".html", ".md", ".txt", ".docx"}:
            findings.append(("WARNING", "Very short draft file", str(path)))
        for pattern in PLACEHOLDER_PATTERNS:
            if re.search(pattern, text, flags=re.IGNORECASE):
                findings.append(("BLOCKER", f"Placeholder or unresolved marker matches `{pattern}`", str(path)))
                break

    all_proposal = "\n".join(proposal_texts)

    requirement_files = list(iter_files(req_root, TEXT_EXTENSIONS)) if req_root.exists() else []
    requirement_parts = []
    for path in requirement_files:
        try:
            requirement_parts.append(read_text(path))
        except (OSError, ValueError) as error:
            findings.append(("BLOCKER", f"Unreadable or unsafe requirement file: {error}", str(path)))
    requirement_text = "\n".join(requirement_parts)
    requirements = split_requirement_lines(requirement_text)

    if req_root.exists() and not requirement_files:
        findings.append(("BLOCKER", "Requirements path exists but contains no readable requirement files", str(req_root)))
    if not req_root.exists():
        findings.append(("BLOCKER", "No 01_requirements directory or requirements file supplied", str(req_root)))

    missing = []
    for req in requirements[:200]:
        if not requirement_covered(req, all_proposal):
            missing.append(req)
    if missing:
        findings.append(("BLOCKER", f"{len(missing)} extracted requirements are not explicitly answered in proposal text", "requirements coverage"))

    evidence_mentions = sum(all_proposal.count(word) for word in EVIDENCE_WORDS)
    if requirement_text and any(word in requirement_text for word in EVIDENCE_WORDS) and evidence_mentions < 5:
        findings.append(("BLOCKER", "Requirements mention evidence/qualification, but proposal has too few evidence references", "evidence matrix"))

    blocker_count = sum(1 for severity, _, _ in findings if severity == "BLOCKER")
    warning_count = sum(1 for severity, _, _ in findings if severity == "WARNING")

    report = [
        "# Bid Quality Check Report",
        "",
        f"- Workspace: `{workspace}`",
        f"- Proposal files scanned: {len(proposal_files)}",
        f"- Requirement files scanned: {len(requirement_files)}",
        f"- Blockers: {blocker_count}",
        f"- Warnings: {warning_count}",
        "",
        "## Findings",
        "",
    ]

    if findings:
        for severity, message, location in findings:
            report.append(f"- **{severity}**: {message} ({location})")
    else:
        report.append("- No blocker or warning found by automated checks.")

    if missing:
        report.extend(["", "## Possible Coverage Gaps", ""])
        for item in missing[:30]:
            report.append(f"- {item}")

    report.extend(
        [
            "",
            "## Manual Checks Still Required",
            "",
            "- Verify pass/fail clauses, scoring criteria, required forms, and seal/signature rules against the tender source.",
            "- Verify every certificate, case, authorization, staffing, price, date, and legal commitment with user-provided evidence.",
            "- Confirm final DOCX/PDF formatting after conversion.",
        ]
    )

    output = "\n".join(report) + "\n"
    if args.out:
        out_path = Path(args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)

    return 2 if blocker_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
