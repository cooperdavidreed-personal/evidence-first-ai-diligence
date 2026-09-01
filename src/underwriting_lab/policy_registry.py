from __future__ import annotations

from typing import Any

from .contracts import digest


def helios_public_desk_policy() -> dict[str, Any]:
    """Return the Desk-owned draft screen used by Helios decision mechanics.

    This policy is application configuration, not a company or deal-room input.
    The synthetic room retains its own requested hurdles as untrusted package
    representations so the two ownership domains remain inspectable.
    """

    policy: dict[str, Any] = {
        "schema_version": "underwriting.desk-policy/v1",
        "profile_id": "helios-growth-screen-public-demo-v1",
        "classification": "DESK_OWNED_DRAFT_POLICY_OUTSIDE_DATA_ROOM",
        "name": "Helios growth investment screening profile",
        "strategy": "GROWTH_EQUITY",
        "owner": "Illustrative Growth Investment Committee",
        "owner_role": "Policy owner",
        "source": "Underwriting Desk public demonstration registry",
        "status": "DRAFT",
        "last_reviewed": None,
        "thresholds": {
            "ordinary_cohort_nrr": "0.95",
            "gross_margin": "0.70",
            "post_close_runway_months": 18,
            "gross_xirr": "0.25",
            "gross_moic": "3.0",
            "maximum_probability_below_one": "0.10",
        },
        "editable_maximum_probability_choices": ["0.08", "0.10", "0.15", "0.20"],
        "rationale": "Illustrative, unreviewed Desk policy for a public synthetic case. It is separate from company representations and does not authorize an investment.",
    }
    policy["receipt_sha256"] = digest(policy)
    return policy
