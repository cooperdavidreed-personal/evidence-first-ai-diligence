from __future__ import annotations

import asyncio
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any


EXPECTED_VERSION = "0.1.1"
EXPECTED_TOOLS = {
    "audit_citations",
    "audit_claims",
    "summarize_verification",
    "verify_artifact",
}


async def _verify_packet(root: Path, packet_path: str) -> dict[str, Any]:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    parameters = StdioServerParameters(
        command="dailyai-evidence-gate",
        args=["--root", str(root.resolve(strict=True))],
    )
    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            discovered = await session.list_tools()
            names = {tool.name for tool in discovered.tools}
            if names != EXPECTED_TOOLS:
                return {
                    "schema_version": "ic-evidence-lab.toolkit-adapter/v1",
                    "status": "FAIL",
                    "reason": "unexpected_tool_schema",
                    "discovered": sorted(names),
                }
            result = await session.call_tool(
                "verify_artifact",
                arguments={
                    "artifact_path": packet_path,
                    "required_terms": ["ic-evidence-lab.packet/v1", "content_sha256", "limitations"],
                    "forbidden_terms": ["BUY", "SELL", "guaranteed return"],
                },
            )
            payload = result.structuredContent
            if result.isError or not isinstance(payload, dict):
                return {
                    "schema_version": "ic-evidence-lab.toolkit-adapter/v1",
                    "status": "FAIL",
                    "reason": "malformed_tool_result",
                }
            if payload.get("schema_version") != "dailyai.evidence-gate-receipt/v1":
                return {
                    "schema_version": "ic-evidence-lab.toolkit-adapter/v1",
                    "status": "FAIL",
                    "reason": "unexpected_receipt_schema",
                }
            return {
                "schema_version": "ic-evidence-lab.toolkit-adapter/v1",
                "status": payload.get("status", "FAIL"),
                "toolkit_receipt": payload,
            }


def verify_packet(root: str | Path, packet_path: str) -> dict[str, Any]:
    try:
        evidence_version = version("dailyaiagents-evidence-gate")
    except PackageNotFoundError:
        return {
            "schema_version": "ic-evidence-lab.toolkit-adapter/v1",
            "status": "NOT_RUN",
            "reason": "install the toolkit extra to run dailyaiagents-evidence-gate==0.1.1",
        }
    if evidence_version != EXPECTED_VERSION:
        return {
            "schema_version": "ic-evidence-lab.toolkit-adapter/v1",
            "status": "FAIL",
            "reason": "toolkit_version_mismatch",
            "installed": evidence_version,
            "expected": EXPECTED_VERSION,
        }
    return asyncio.run(_verify_packet(Path(root), packet_path))
