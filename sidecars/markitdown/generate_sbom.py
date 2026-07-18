#!/usr/bin/env python3
"""Generate a deterministic package metadata SBOM for the isolated sidecar environment."""

from __future__ import annotations

import json
import sys
from importlib import metadata
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        raise ValueError("usage: generate_sbom.py OUTPUT.json")
    packages = []
    for distribution in metadata.distributions():
        name = distribution.metadata.get("Name") or "unknown"
        packages.append(
            {
                "Name": name,
                "Version": distribution.version,
                "License": distribution.metadata.get("License") or "UNKNOWN",
                "HomePage": distribution.metadata.get("Home-page") or "",
            }
        )
    packages.sort(key=lambda item: (item["Name"].lower(), item["Version"]))
    Path(sys.argv[1]).write_text(
        json.dumps(packages, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
