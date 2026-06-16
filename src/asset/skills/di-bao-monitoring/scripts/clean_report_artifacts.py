#!/usr/bin/env python3
"""Remove OS and Office cache artifacts before report delivery."""

from __future__ import annotations

import argparse
import shutil
import sys
import zipfile
from pathlib import Path


ARTIFACT_FILE_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
ARTIFACT_DIR_NAMES = {"__MACOSX", "__pycache__", ".pytest_cache", ".mypy_cache"}
ARTIFACT_SUFFIXES = {".pyc", ".pyo"}
ARTIFACT_PREFIXES = ("._", "~$")
ARCHIVE_SUFFIXES = {".zip", ".xlsx", ".xlsm", ".docx", ".pptx"}


def is_artifact_name(name: str, *, is_dir: bool) -> bool:
    if is_dir and name in ARTIFACT_DIR_NAMES:
        return True
    if not is_dir and name in ARTIFACT_FILE_NAMES:
        return True
    if not is_dir and Path(name).suffix.lower() in ARTIFACT_SUFFIXES:
        return True
    return any(name.startswith(prefix) for prefix in ARTIFACT_PREFIXES)


def iter_artifacts(root: Path) -> list[Path]:
    found: list[Path] = []
    if not root.exists():
        return found
    if root.is_file():
        if is_artifact_name(root.name, is_dir=False):
            found.append(root)
        return found
    for path in sorted(root.rglob("*"), key=lambda item: len(item.parts), reverse=True):
        if path.is_symlink():
            continue
        if path.is_dir() and is_artifact_name(path.name, is_dir=True):
            found.append(path)
        elif path.is_file() and is_artifact_name(path.name, is_dir=False):
            found.append(path)
    return found


def remove_path(path: Path, *, dry_run: bool) -> None:
    if dry_run:
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def archive_bad_entries(path: Path) -> list[str]:
    if path.suffix.lower() not in ARCHIVE_SUFFIXES or not zipfile.is_zipfile(path):
        return []
    bad: list[str] = []
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            parts = Path(name).parts
            if any(part == "__MACOSX" or part.startswith("._") or part == ".DS_Store" for part in parts):
                bad.append(name)
    return bad


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean .DS_Store, __MACOSX, ._* resource forks, Office lock files, and Python cache files."
    )
    parser.add_argument("targets", nargs="*", default=["."], help="Files or directories to clean. Defaults to current directory.")
    parser.add_argument("--dry-run", action="store_true", help="List artifacts without deleting them.")
    parser.add_argument(
        "--check-archives",
        action="store_true",
        help="Also inspect zip/xlsx/docx/pptx archives and report hidden macOS entries inside them.",
    )
    parser.add_argument("--quiet", action="store_true", help="Only print warnings and final summary.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    removed_count = 0
    archive_warnings = 0

    for raw_target in args.targets:
        target = Path(raw_target).expanduser().resolve()
        if not target.exists():
            print(f"WARN missing target: {target}", file=sys.stderr)
            continue

        artifacts = iter_artifacts(target)
        for path in artifacts:
            if not args.quiet:
                action = "would remove" if args.dry_run else "remove"
                print(f"{action}: {path}")
            remove_path(path, dry_run=args.dry_run)
            removed_count += 1

        if args.check_archives:
            archive_paths = [target] if target.is_file() else list(target.rglob("*"))
            for archive_path in archive_paths:
                if not archive_path.is_file():
                    continue
                bad_entries = archive_bad_entries(archive_path)
                if bad_entries:
                    archive_warnings += 1
                    print(f"WARN archive contains hidden macOS entries: {archive_path}", file=sys.stderr)
                    for entry in bad_entries[:20]:
                        print(f"  {entry}", file=sys.stderr)
                    if len(bad_entries) > 20:
                        print(f"  ... {len(bad_entries) - 20} more", file=sys.stderr)

    action = "would_remove" if args.dry_run else "removed"
    print(f"{action}={removed_count} archive_warnings={archive_warnings}")
    return 1 if archive_warnings else 0


if __name__ == "__main__":
    raise SystemExit(main())
