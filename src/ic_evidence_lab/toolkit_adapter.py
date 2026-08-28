from __future__ import annotations

import asyncio
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any


EXPECTED_VERSION = "0.1.1"
EXPECTED_EVIDENCE_TOOLS = {
    "audit_citations",
    "audit_claims",
    "summarize_verification",
    "verify_artifact",
}
EXPECTED_RELEASE_TOOLS = {
    "build_release_receipt",
    "check_contract",
    "evaluate_completion",
    "format_blockers",
}


async def _verify_packet(root: Path, packet_path: str) -> dict[str, Any]:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    command = Path(sys.executable).with_name("dailyai-evidence-gate")
    if not command.is_file():
        return {
            "schema_version": "ic-evidence-lab.toolkit-adapter/v1",
            "status": "FAIL",
            "reason": "toolkit_executable_missing_from_active_environment",
        }
    parameters = StdioServerParameters(
        command=str(command),
        args=["--root", str(root.resolve(strict=True))],
    )
    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            discovered = await session.list_tools()
            names = {tool.name for tool in discovered.tools}
            if names != EXPECTED_EVIDENCE_TOOLS:
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


def _installed_versions() -> dict[str, str] | None:
    packages = ("dailyaiagents-evidence-gate", "dailyaiagents-release-gate")
    try:
        installed = {package: version(package) for package in packages}
    except PackageNotFoundError:
        return None
    return installed


def _active_executable(name: str) -> Path | None:
    candidate = Path(sys.executable).with_name(name)
    return candidate if candidate.is_file() else None


async def _verify_release_bundle(root: Path, artifact_paths: list[str]) -> dict[str, Any]:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    evidence_command = _active_executable("dailyai-evidence-gate")
    release_command = _active_executable("dailyai-release-gate")
    if evidence_command is None or release_command is None:
        return {
            "schema_version": "ic-evidence-lab.toolkit-bundle/v1",
            "status": "FAIL",
            "reason": "toolkit_executable_missing_from_active_environment",
        }

    evidence_receipts: list[dict[str, Any]] = []
    evidence_parameters = StdioServerParameters(
        command=str(evidence_command),
        args=["--root", str(root.resolve(strict=True))],
    )
    async with stdio_client(evidence_parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            discovered = {tool.name for tool in (await session.list_tools()).tools}
            if discovered != EXPECTED_EVIDENCE_TOOLS:
                return {
                    "schema_version": "ic-evidence-lab.toolkit-bundle/v1",
                    "status": "FAIL",
                    "reason": "unexpected_evidence_tool_schema",
                    "discovered": sorted(discovered),
                }
            for artifact_path in artifact_paths:
                result = await session.call_tool(
                    "verify_artifact",
                    arguments={"artifact_path": artifact_path},
                )
                payload = result.structuredContent
                if (
                    result.isError
                    or not isinstance(payload, dict)
                    or payload.get("schema_version") != "dailyai.evidence-gate-receipt/v1"
                    or payload.get("tool") != "verify_artifact"
                    or payload.get("status") != "PASS"
                    or not isinstance(payload.get("artifact"), dict)
                ):
                    return {
                        "schema_version": "ic-evidence-lab.toolkit-bundle/v1",
                        "status": "FAIL",
                        "reason": "artifact_verification_failed",
                        "artifact_path": artifact_path,
                    }
                evidence_receipts.append(payload)

    release_parameters = StdioServerParameters(
        command=str(release_command),
        args=["--root", str(root.resolve(strict=True))],
    )
    async with stdio_client(release_parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            discovered = {tool.name for tool in (await session.list_tools()).tools}
            if discovered != EXPECTED_RELEASE_TOOLS:
                return {
                    "schema_version": "ic-evidence-lab.toolkit-bundle/v1",
                    "status": "FAIL",
                    "reason": "unexpected_release_tool_schema",
                    "discovered": sorted(discovered),
                }
            result = await session.call_tool(
                "build_release_receipt",
                arguments={"checks": evidence_receipts, "artifacts": artifact_paths},
            )
            payload = result.structuredContent
            if (
                result.isError
                or not isinstance(payload, dict)
                or payload.get("schema_version") != "dailyai.release-gate-receipt/v1"
                or payload.get("tool") != "build_release_receipt"
            ):
                return {
                    "schema_version": "ic-evidence-lab.toolkit-bundle/v1",
                    "status": "FAIL",
                    "reason": "malformed_release_receipt",
                }
            return {
                "schema_version": "ic-evidence-lab.toolkit-bundle/v1",
                "status": payload.get("status", "FAIL"),
                "evidence_receipts": evidence_receipts,
                "release_receipt": payload,
            }


def verify_release_bundle(root: str | Path, artifact_paths: list[str]) -> dict[str, Any]:
    installed = _installed_versions()
    if installed is None:
        return {
            "schema_version": "ic-evidence-lab.toolkit-bundle/v1",
            "status": "NOT_RUN",
            "reason": "install the toolkit extra to run both 0.1.1 MCP gates",
        }
    mismatches = {name: found for name, found in installed.items() if found != EXPECTED_VERSION}
    if mismatches:
        return {
            "schema_version": "ic-evidence-lab.toolkit-bundle/v1",
            "status": "FAIL",
            "reason": "toolkit_version_mismatch",
            "installed": installed,
            "expected": EXPECTED_VERSION,
        }
    if not artifact_paths or len(artifact_paths) > 100 or len(set(artifact_paths)) != len(artifact_paths):
        return {
            "schema_version": "ic-evidence-lab.toolkit-bundle/v1",
            "status": "FAIL",
            "reason": "artifact_paths_invalid",
        }
    return asyncio.run(_verify_release_bundle(Path(root), artifact_paths))
