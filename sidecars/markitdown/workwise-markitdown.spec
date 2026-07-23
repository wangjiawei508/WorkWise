# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all("markitdown")
magika_datas, magika_binaries, magika_hiddenimports = collect_all("magika")
datas += magika_datas
binaries += magika_binaries
hiddenimports += magika_hiddenimports
for package in ("pptx", "xlsxwriter", "PIL", "lxml"):
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hiddenimports

repo_root = Path.cwd().parents[1]
ppt_master_root = repo_root / "src" / "asset" / "skills" / "ppt-master"
if not (ppt_master_root / "scripts" / "svg_to_pptx.py").is_file():
    raise RuntimeError(f"PPT Master snapshot is missing: {ppt_master_root}")
datas.append((str(ppt_master_root), "ppt-master"))

a = Analysis(
    ["sidecar.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["openai", "torch", "pymupdf", "fitz"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="workwise-markitdown",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="workwise-markitdown")
