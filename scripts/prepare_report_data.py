#!/usr/bin/env python3
"""Convert existing experiment evidence to LaTeX macros and a PGFPlots table."""
from __future__ import annotations
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "report/latex/generated"


def read_json(name):
    return json.loads((ROOT / "results" / name).read_text())


def number(value):
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"Invalid numerical evidence: {value!r}")
    return float(value)


def prepare():
    summary = read_json("experiment-summary.json")
    browser = read_json("browser-checks.json")
    physics = read_json("validation-summary.json")["physicsUnitTests"]
    config = summary["config"]
    for check in (summary["checks"], browser, physics):
        if check["total"] <= 0 or check["passed"] != check["total"]:
            raise ValueError("Report requires passing recorded validation evidence")
    modes = {mode["id"]: mode for mode in summary["modes"]}
    cases = [("ideal_AB", "理想點粒子"), ("hardcore_AB", r"硬核 \(C=0\)"),
             ("dipole_AB", "磁偶極硬圓盤")]
    temperature = number(config["temp"])
    if temperature <= 0 or 17 not in config["seeds"]:
        raise ValueError("Positive temperature and the illustrated seed 17 are required")
    macros = {
        "PerSide": config["nPerSide"], "TotalParticles": 2 * config["nPerSide"],
        "Temperature": f"{temperature:g}", "Coupling": config["coupling"],
        "BurnSweeps": config["closedBurnSweeps"], "OpenSweeps": config["openSweeps"],
        "LateStart": config["lateWindowStart"], "SampleEvery": config["sampleEvery"],
        "SeedList": ", ".join(str(int(seed)) for seed in config["seeds"]),
        "FiniteMean": f'{number(summary["originDiagnosticReference"]["finiteNIdealEquilibriumMean"]):.5f}',
        "ExperimentPass": summary["checks"]["passed"], "ExperimentTotal": summary["checks"]["total"],
        "BrowserPass": browser["passed"], "BrowserTotal": browser["total"],
        "PhysicsPass": physics["passed"], "PhysicsTotal": physics["total"],
    }
    rows = []
    for case, label in cases:
        mode = modes[case]
        if len(mode["seedResults"]) != len(config["seeds"]):
            raise ValueError(f"Incomplete seed data: {case}")
        stats = mode["acrossSeeds"]
        mix, energy = stats["mixingPerParticle"], stats["energyPerParticle"]
        if mix["n"] != len(config["seeds"]) or energy["n"] != len(config["seeds"]):
            raise ValueError(f"Wrong sample count: {case}")
        mixing = r"\(" + f'{number(mix["mean"]):.3f} \\pm {number(mix["sampleStd"]):.3f}' + r"\)"
        potential = r"\(" + f'{number(energy["mean"])/temperature:.3f} \\pm {number(energy["sampleStd"])/temperature:.3f}' + r"\)"
        reference = r"\shortstack{\(\AB:\ln2\)\\\(\SameSpecies:0\)}"
        rows.append(f"{label} & {mixing} & {potential} & {reference} " + r"\\")
    with (ROOT / "results/timeseries.csv").open(newline="") as source:
        series = list(csv.DictReader(source))
    curves = {}
    for case, _ in cases:
        points = {}
        for row in series:
            if row["case"] == case and row["phase"] == "open" and int(row["seed"]) == 17:
                sweep = int(row["sweep"])
                if sweep in points:
                    raise ValueError(f"Duplicate curve sample: {case}, {sweep}")
                points[sweep] = number(float(row["mixingPerParticle"]))
        expected = set(range(0, config["openSweeps"] + 1, config["sampleEvery"]))
        if set(points) != expected:
            raise ValueError(f"Incomplete curve data: {case}")
        curves[case] = points
    GENERATED.mkdir(parents=True, exist_ok=True)
    tex = "% Generated from results/ by scripts/prepare_report_data.py; do not edit.\n"
    tex += "\n".join(f"\\newcommand{{\\{key}}}{{{value}}}" for key, value in macros.items())
    tex += "\n\\newcommand{\\ResultsRows}{%\n" + "\n".join(rows) + "\n}\n"
    (GENERATED / "data.tex").write_text(tex)
    table = "sweep ideal hardcore dipole\n"
    for sweep in sorted(curves["ideal_AB"]):
        table += f"{sweep} " + " ".join(f"{curves[case][sweep]:.12g}" for case, _ in cases) + "\n"
    (GENERATED / "mixing-curves.dat").write_text(table)
    print("Prepared LaTeX data from recorded experiment results.")


if __name__ == "__main__":
    prepare()
