# WORKGPT Markdown Converters

WORKGPT can package platform-specific Markdown conversion tools with the desktop app.

Expected local layout:

```text
converters/
  darwin-arm64/
    pandoc
    md2docx.bin
  darwin-x64/
    pandoc
    md2docx.bin
  win32-x64/
    pandoc.exe
    md2docx.exe
```

Only `darwin-arm64`, `darwin-x64`, and `win32-x64` are included by `electron-builder`.
Linux converter folders are intentionally not packaged.

These binaries are large and are ignored by Git. Use:

```bash
npm run prepare:converters
```

The script reads the source ZIP files from `~/Downloads` by default:

- `md2docx_macos.zip`
- `md2docx_winV2.zip` or `md2docx_win.zip`

The provided macOS ZIP currently contains an Apple Silicon `pandoc`. Put an Intel
macOS build at `converters/darwin-x64/pandoc` if you want the Intel app package
to ship the same high-fidelity pandoc backend.
