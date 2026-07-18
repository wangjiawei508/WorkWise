# WorkWise MarkItDown sidecar

This helper embeds the audited Microsoft MarkItDown `v0.1.4` snapshot
(`932084c88679aeda901c2903a151f3ed82f86081`) with only PDF, DOCX, PPTX, and
XLSX extras. It uses `convert_local`, disables plugins, accepts one JSON request
on stdin, and rejects paths outside the selected workspace.

`markitdown-ocr` is intentionally not included. OCR and complex layout parsing
are delegated to the optional MinerU integration.
