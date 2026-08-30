#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

release_root="${1:-dist/release-candidate-v2}"
if [ -e "$release_root" ]; then
  echo "release bundle destination already exists: $release_root" >&2
  exit 1
fi
mkdir -p "$release_root/packages" "$release_root/pages"

uv build --out-dir "$release_root/packages"
uv run python scripts/build_visual_manifest.py
pnpm --dir workbench install --frozen-lockfile
pnpm --dir workbench build
uv run python scripts/build_pages.py --out "$release_root/pages"

cp LOCAL-VERIFICATION.md RELEASE-NOTES.md "$release_root/"

(
  cd "$release_root"
  find . -type f \
    ! -name 'SHA256SUMS' \
    -print0 \
    | sort -z \
    | xargs -0 shasum -a 256 > SHA256SUMS
)

printf 'release-bundle=%s\n' "$release_root"
