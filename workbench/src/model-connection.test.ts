import {describe, expect, it, vi} from "vitest";
import {createAdapterTransport, localMcpCommand, localMcpConfig, probeAdapter, validateAdapterEndpoint} from "./model-connection";

describe("model connection contract", () => {
  it("generates bounded local MCP setup for Claude Code and Codex", () => {
    expect(localMcpCommand("claude-code", "/opt/underwriting/workbench")).toBe('claude mcp add --scope user underwriting-desk -- node "/opt/underwriting/workbench/mcp-server/server.mjs" --proposal-ledger "/tmp/underwriting-desk-proposals.jsonl"');
    expect(localMcpCommand("codex", "/opt/underwriting/workbench")).toBe('codex mcp add underwriting-desk -- node "/opt/underwriting/workbench/mcp-server/server.mjs" --proposal-ledger "/tmp/underwriting-desk-proposals.jsonl"');
    expect(JSON.parse(localMcpConfig("/opt/underwriting/workbench"))).toEqual({mcpServers: {"underwriting-desk": {command: "node", args: ["/opt/underwriting/workbench/mcp-server/server.mjs", "--proposal-ledger", "/tmp/underwriting-desk-proposals.jsonl"]}}});
  });

  it("rejects relative and shell-active workbench paths", () => {
    expect(() => localMcpCommand("codex", "../workbench")).toThrow(/absolute workbench path/);
    expect(() => localMcpCommand("codex", "/tmp/$TOKEN/workbench")).toThrow(/shell-control/);
  });

  it("accepts HTTPS and local development endpoints without embedded credentials", () => {
    expect(validateAdapterEndpoint("https://models.example.com/review")).toBe("https://models.example.com/review");
    expect(validateAdapterEndpoint("http://localhost:8787/review")).toBe("http://localhost:8787/review");
    expect(() => validateAdapterEndpoint("http://models.example.com/review")).toThrow(/Use HTTPS/);
    expect(() => validateAdapterEndpoint("https://token@models.example.com/review")).toThrow(/credentials/);
  });

  it("requires the adapter to advertise the evidence challenge contract", async () => {
    const ready = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({status: "READY", contracts: ["underwriting-evidence-challenge/v1"]}), {status: 200, headers: {"content-type": "application/json"}}));
    await expect(probeAdapter("https://models.example.com/review", ready)).resolves.toBe("https://models.example.com/review");
    expect(JSON.parse(String(ready.mock.calls[0][1]?.body))).toEqual({job: "underwriting_connection_probe", output_contract: "underwriting-connection/v1"});
    const incompatible = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({status: "READY", contracts: []}), {status: 200}));
    await expect(probeAdapter("https://models.example.com/review", incompatible)).rejects.toThrow(/required evidence-challenge contract/);
  });

  it("sends only the controlled review request to the configured adapter", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({challenges: [], gaps: [], memo_drafts: []}), {status: 200}));
    const transport = createAdapterTransport("https://models.example.com/review", fetcher);
    const request = {job: "challenge_selected_evidence" as const, deal_id: "test-deal", evidence: [{id: "metric-1", title: "Runway", displayValue: "17 months", summary: "Cash divided by burn."}], output_contract: "underwriting-evidence-challenge/v1" as const, request_digest_sha256: "0".repeat(64)};
    await transport(request);
    const call = fetcher.mock.calls[0];
    expect(call[0]).toBe("https://models.example.com/review");
    expect(call[1]?.credentials).toBe("omit");
    expect(call[1]?.headers).toEqual({"content-type": "application/json"});
    expect(call[1]?.body).toBe(JSON.stringify(request));
  });
});
