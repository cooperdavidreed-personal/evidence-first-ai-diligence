from __future__ import annotations

import argparse
import html
import json
from pathlib import Path

from ic_evidence_lab.canonical import canonical_json
from ic_evidence_lab.pipeline import run_case


def build(repo: Path, destination: Path) -> None:
    before, before_receipt = run_case(repo / "examples/vectorforge/case-before.json")
    after, after_receipt = run_case(repo / "examples/vectorforge/case-after.json")
    data = destination / "data"
    assets = destination / "assets"
    data.mkdir(parents=True, exist_ok=True)
    assets.mkdir(parents=True, exist_ok=True)
    (destination / ".nojekyll").write_text("", encoding="utf-8")
    for name, payload in {
        "before.json": before,
        "before-receipt.json": before_receipt,
        "after.json": after,
        "after-receipt.json": after_receipt,
    }.items():
        (data / name).write_bytes(canonical_json(payload) + b"\n")

    rows = "\n".join(
        "<tr><td>{}</td><td><strong>{}</strong></td><td>{}</td></tr>".format(
            html.escape(item["claim_id"]),
            html.escape(item["state"]),
            html.escape(item["statement"]),
        )
        for item in after["claim_results"]
    )
    questions = "\n".join(f"<li>{html.escape(q)}</li>" for q in after["open_questions"])
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="A deterministic, human-reviewed investment diligence case study.">
<title>Evidence-First AI Diligence</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%2307110f'/%3E%3Cpath d='M16 18h32v8H24v8h20v8H24v12h-8z' fill='%2375f0ad'/%3E%3C/svg%3E"><link rel="stylesheet" href="assets/styles.css"></head>
<body><a class="skip" href="#content">Skip to content</a><main id="content">
<p class="eyebrow">LOCAL PORTFOLIO DRAFT</p>
<h1>Build investment memos that show their work.</h1>
<p class="lede">A deterministic, human-reviewed diligence workflow connecting claims, counterevidence, frozen source snapshots, open questions, and hash-bound receipts.</p>
<aside><strong>Boundary:</strong> This case is synthetic. The system does not make investment decisions or provide investment advice.</aside>
<section><h2>Failure is a feature</h2><div class="grid"><article><span>Before</span><strong>{html.escape(before['workflow_disposition'])}</strong><p>Unsupported material ARR claim remains UNVERIFIED.</p></article><article><span>After evidence</span><strong>{html.escape(after['workflow_disposition'])}</strong><p>Supported calculations coexist with contradictions, temporal blocks, and human judgment.</p></article></div></section>
<section><h2>Claim ledger</h2><div class="table-wrap" tabindex="0" role="region" aria-label="Claim ledger, horizontally scrollable on small screens"><table><caption>States for the corrected synthetic case</caption><thead><tr><th scope="col">ID</th><th scope="col">State</th><th scope="col">Claim</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section><h2>Open diligence questions</h2><ul>{questions}</ul></section>
<section><h2>Inspect the proof</h2><p>Packet SHA-256: <code>{html.escape(after_receipt['packet_sha256'])}</code></p><p><a href="data/after.json">Packet JSON</a> · <a href="data/after-receipt.json">Receipt JSON</a> · <a href="data/before.json">Before state</a></p></section>
</main><footer>Created and led by Cooper Reed. AI-assisted implementation and adversarial review; human-owned release and investment judgment.</footer></body></html>"""
    (destination / "index.html").write_text(page, encoding="utf-8")
    (destination / "404.html").write_text(page, encoding="utf-8")
    (assets / "styles.css").write_text(STYLES, encoding="utf-8")


STYLES = """
:root{color-scheme:dark;--bg:#07110f;--panel:#10201b;--ink:#edf8f2;--muted:#a9c1b6;--accent:#75f0ad;--line:#29463b}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#173c2f 0,#07110f 42%);color:var(--ink);font:16px/1.6 system-ui,sans-serif}.skip{position:fixed;left:16px;top:8px;z-index:2;transform:translateY(-150%);background:var(--ink);color:var(--bg);padding:8px 12px;border-radius:8px}.skip:focus{transform:none}main,footer{width:min(1080px,calc(100% - 32px));margin:auto}main{padding:72px 0}.eyebrow{letter-spacing:.16em;color:var(--accent);font-weight:750}h1{font-size:clamp(2.6rem,8vw,6.7rem);line-height:.95;max-width:900px;margin:.2em 0}.lede{font-size:clamp(1.15rem,2.5vw,1.6rem);max-width:760px;color:var(--muted)}aside,article{border:1px solid var(--line);background:var(--panel);padding:22px;border-radius:16px}section{margin-top:72px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}article span{display:block;color:var(--muted)}article strong{font-size:1.5rem;color:var(--accent)}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--panel)}caption{text-align:left;padding:12px;color:var(--muted)}th,td{text-align:left;vertical-align:top;padding:14px;border-bottom:1px solid var(--line)}th{color:var(--accent)}code{overflow-wrap:anywhere;color:var(--accent)}a{color:var(--accent)}a:focus-visible,.table-wrap:focus-visible{outline:3px solid #fff;outline-offset:3px}footer{padding:30px 0 60px;color:var(--muted)}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}""".strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="dist/pages")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    build(repo, repo / args.out)
    print(json.dumps({"status": "PRODUCED", "path": args.out}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
