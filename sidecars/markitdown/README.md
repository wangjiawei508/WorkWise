# WorkWise MarkItDown sidecar

This helper embeds the audited Microsoft MarkItDown `v0.1.4` snapshot
(`932084c88679aeda901c2903a151f3ed82f86081`) with only PDF, DOCX, PPTX, and
XLSX extras. It uses `convert_local`, disables plugins, accepts one JSON request
on stdin, and rejects paths outside the selected workspace.

The same frozen helper also carries the audited PPT Master `v4.0.0` scripts
needed by Design for preset shapes and native PPTX import/export. Those
operations use an explicit local-only protocol and accept only paths contained
by the temporary operation root; a clean WorkWise installation never depends
on a system Python interpreter.

`markitdown-ocr` is intentionally not included. OCR and complex layout parsing
are delegated to the optional MinerU integration.
