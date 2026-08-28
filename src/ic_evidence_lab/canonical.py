from __future__ import annotations

import hashlib
import json
from typing import Any


def canonical_json(value: Any) -> bytes:
    """Stable UTF-8 JSON used for local content-addressed receipts.

    This is a deliberately small canonicalization profile, not a claim of full
    RFC 8785 support. Inputs are limited to JSON-native values and numeric
    calculations are serialized as decimal strings.
    """

    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def digest_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()
