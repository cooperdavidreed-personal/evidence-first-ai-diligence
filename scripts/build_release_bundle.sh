#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

release_root="${1:-dist/release-v0.1.0}"
mkdir -p "$release_root/packages" "$release_root/demo" "$release_root/pages"

uv build --out-dir "$release_root/packages"
uv run python scripts/render_demo.py --out "$release_root/demo"
uv run python scripts/verify_demo.py --root "$release_root/demo"
uv run python scripts/build_pages.py --out "$release_root/pages"

cp LOCAL-VERIFICATION.md RELEASE-NOTES.md "$release_root/"

(
  cd "$release_root"
  find . -type f \
    ! -path './demo/frames/*' \
    ! -path './demo/segments/*' \
    ! -name 'segments.txt' \
    ! -name 'SHA256SUMS' \
    -print0 \
    | sort -z \
    | xargs -0 shasum -a 256 > SHA256SUMS
)

printf 'release-bundle=%s\n' "$release_root"
