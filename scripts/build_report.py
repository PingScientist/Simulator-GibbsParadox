#!/usr/bin/env python3
"""Compile the actual LaTeX report; publish only a checked four-page PDF."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from pypdf import PdfReader
from prepare_report_data import prepare

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "report/latex/main.tex"
OUTPUT = ROOT / "output/pdf/Gibbs_Paradox_Report.pdf"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tectonic", default=os.environ.get("TECTONIC"),
                        help="Tectonic binary (also accepts TECTONIC env var)")
    parser.add_argument("--only-cached", action="store_true",
                        help="Use cached TeX packages without downloading")
    args = parser.parse_args()
    engine = args.tectonic or shutil.which("tectonic")
    if not engine:
        bundled = Path("/Applications/ChatGPT.app/Contents/Resources/tectonic/tectonic")
        if bundled.is_file():
            engine = str(bundled)
    if not engine:
        parser.error("Tectonic is required. Install it or pass --tectonic /path/to/tectonic.")
    prepare()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="gibbs-latex-") as temporary:
        outdir = Path(temporary)
        command = [engine, "--keep-logs", "--outdir", str(outdir)]
        if args.only_cached:
            command.append("--only-cached")
        subprocess.run(command + [str(SOURCE)], cwd=SOURCE.parent, check=True)
        log = (outdir / "main.log").read_text(errors="replace")
        problems = [line for line in log.splitlines()
                    if any(term in line for term in
                           ("Overfull ", "Missing character:", "! LaTeX Error"))]
        if problems:
            raise RuntimeError("LaTeX layout or glyph errors:\n" + "\n".join(problems))
        pdf = outdir / "main.pdf"
        reader = PdfReader(pdf)
        if len(reader.pages) != 4:
            raise RuntimeError(f"Expected exactly 4 pages; got {len(reader.pages)}. Output not replaced.")
        if any(not (page.extract_text() or "").strip() for page in reader.pages):
            raise RuntimeError("Empty PDF page detected. Output not replaced.")
        staged = OUTPUT.with_suffix(".pdf.new")
        shutil.copyfile(pdf, staged)
        staged.replace(OUTPUT)
    print(f"Built 4-page LaTeX report: {OUTPUT}")
    print("Render all pages and inspect formulas, chart and layout before delivery.")


if __name__ == "__main__":
    main()
