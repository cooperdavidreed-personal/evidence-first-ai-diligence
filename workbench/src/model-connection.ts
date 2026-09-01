import type {ModelTransport} from "./model-workflow";

export type ExternalModelClient = "claude-code" | "codex" | "claude-web" | "chatgpt" | "grok";
export type LocalModelClient = "claude-code" | "codex";
export type RemoteModelClient = "claude-web" | "chatgpt" | "grok";
export type ConnectionState =
  | {channel: "LOCAL_MCP"; client: LocalModelClient; label: string; state: "SETUP_PREPARED"}
  | {channel: "REMOTE_MCP"; client: RemoteModelClient; label: string; state: "HOSTED_SERVER_REQUIRED"}
  | {channel: "API_ADAPTER"; client: "in-desk"; label: string; endpoint: string; state: "CONTRACT_VERIFIED"};

interface ClientCapabilityBase {
  label: string;
  environment: string;
  note: string;
}
export type ClientCapability =
  | ClientCapabilityBase & {id: LocalModelClient; route: "LOCAL_MCP"; availability: "AVAILABLE_NOW"}
  | ClientCapabilityBase & {id: RemoteModelClient; route: "REMOTE_MCP"; availability: "HOSTED_SERVER_REQUIRED"};

export const clientCapabilities: ClientCapability[] = [
  {id: "claude-code", label: "Claude Code", environment: "Desktop or terminal", route: "LOCAL_MCP", availability: "AVAILABLE_NOW", note: "Connects to the included local stdio server."},
  {id: "codex", label: "Codex", environment: "Desktop or terminal", route: "LOCAL_MCP", availability: "AVAILABLE_NOW", note: "Connects to the included local stdio server."},
  {id: "claude-web", label: "Claude.ai", environment: "Web workspace", route: "REMOTE_MCP", availability: "HOSTED_SERVER_REQUIRED", note: "Requires a hosted HTTPS MCP server and workspace permissions."},
  {id: "chatgpt", label: "ChatGPT", environment: "Business, Enterprise, or Edu web workspace", route: "REMOTE_MCP", availability: "HOSTED_SERVER_REQUIRED", note: "Requires a hosted HTTPS MCP server and an eligible workspace."},
  {id: "grok", label: "Grok", environment: "Web workspace", route: "REMOTE_MCP", availability: "HOSTED_SERVER_REQUIRED", note: "Requires a publicly reachable MCP server and connector setup."},
];

function safeAbsolutePath(value: string, label: string) {
  const path = value.trim().replace(/\/+$/, "");
  if (!path.startsWith("/") || path.length > 400 || /[\n\r\0"'`$]/.test(path)) throw new Error(`Enter an absolute ${label} path without shell-control characters`);
  return path;
}

export function localMcpCommand(client: LocalModelClient, workbenchPath: string, ledgerPath = "/tmp/underwriting-desk-proposals.jsonl") {
  const server = `${safeAbsolutePath(workbenchPath, "workbench")}/mcp-server/server.mjs`;
  const ledger = safeAbsolutePath(ledgerPath, "proposal ledger");
  if (client === "claude-code") return `claude mcp add --scope user underwriting-desk -- node "${server}" --proposal-ledger "${ledger}"`;
  return `codex mcp add underwriting-desk -- node "${server}" --proposal-ledger "${ledger}"`;
}

export function localMcpConfig(workbenchPath: string, ledgerPath = "/tmp/underwriting-desk-proposals.jsonl") {
  const server = `${safeAbsolutePath(workbenchPath, "workbench")}/mcp-server/server.mjs`;
  const ledger = safeAbsolutePath(ledgerPath, "proposal ledger");
  return JSON.stringify({mcpServers: {"underwriting-desk": {command: "node", args: [server, "--proposal-ledger", ledger]}}}, null, 2);
}

export function validateAdapterEndpoint(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) throw new Error("Enter the HTTPS URL supplied by your workspace operator");
  let endpoint: URL;
  try { endpoint = new URL(trimmed); }
  catch { throw new Error("Enter a complete endpoint URL"); }
  const local = ["127.0.0.1", "localhost"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(local && endpoint.protocol === "http:")) throw new Error("Use HTTPS, or HTTP only for localhost development");
  if (endpoint.username || endpoint.password || endpoint.hash) throw new Error("Do not put credentials or fragments in the endpoint URL");
  return endpoint.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

export async function probeAdapter(endpointValue: string, fetcher: typeof fetch = fetch) {
  const endpoint = validateAdapterEndpoint(endpointValue);
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 15_000);
  const response = await fetcher(endpoint, {method: "POST", credentials: "omit", signal: controller.signal, headers: {"content-type": "application/json"}, body: JSON.stringify({job: "underwriting_connection_probe", output_contract: "underwriting-connection/v1"})}).finally(() => globalThis.clearTimeout(timer));
  if (!response.ok) throw new Error(`Adapter did not accept the connection check (${response.status})`);
  const body: unknown = await response.json();
  if (!isRecord(body) || body.status !== "READY" || !Array.isArray(body.contracts) || !body.contracts.includes("underwriting-evidence-challenge/v1")) {
    throw new Error("Endpoint does not advertise the required evidence-challenge contract");
  }
  return endpoint;
}

export function createAdapterTransport(endpointValue: string, fetcher: typeof fetch = fetch): ModelTransport {
  const endpoint = validateAdapterEndpoint(endpointValue);
  return async (request) => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), 20_000);
    const response = await fetcher(endpoint, {method: "POST", credentials: "omit", signal: controller.signal, headers: {"content-type": "application/json"}, body: JSON.stringify(request)}).finally(() => globalThis.clearTimeout(timer));
    if (!response.ok) throw new Error(`Model review unavailable (${response.status})`);
    return response.json() as Promise<unknown>;
  };
}

export function connectionLabel(connection: ConnectionState | null) {
  if (!connection) return "Connect model";
  if (connection.state === "CONTRACT_VERIFIED") return "Adapter contract verified";
  if (connection.state === "SETUP_PREPARED") return `${connection.label} setup`;
  return "Hosted connector needed";
}
