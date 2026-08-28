from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker


class SchemaBoundaryError(ValueError):
    """Raised when an input or output crosses a declared schema boundary."""


@lru_cache(maxsize=None)
def load_schema(name: str) -> dict[str, Any]:
    resource = files("ic_evidence_lab.schemas").joinpath(name)
    return json.loads(resource.read_text(encoding="utf-8"))


def validate_document(document: Any, schema_name: str) -> None:
    validator = Draft202012Validator(
        load_schema(schema_name), format_checker=FormatChecker()
    )
    errors = sorted(
        validator.iter_errors(document), key=lambda error: list(error.absolute_path)
    )
    if not errors:
        return
    error = errors[0]
    pointer = "/" + "/".join(str(part) for part in error.absolute_path)
    if pointer == "/":
        pointer = "<root>"
    raise SchemaBoundaryError(f"schema_invalid:{schema_name}:{pointer}:{error.message}")
