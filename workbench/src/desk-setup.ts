export type SetupClient = "claude-desktop" | "chatgpt-desktop" | "claude-code" | "codex";
export interface DeskSetupStatus {
  available: boolean;
  workbenchPath: string;
  storePath: string;
  nodePath?: string;
  connection?: {clientName: string; initializedAt: string; identityVerified: false} | null;
}
export const setupClients: {id: SetupClient; label: string; note: string}[] = [
  {id: "claude-desktop", label: "Claude Desktop", note: "Use Claude on this computer"},
  {id: "chatgpt-desktop", label: "ChatGPT desktop", note: "Use a desktop version with MCP settings"},
  {id: "claude-code", label: "Claude Code", note: "For an existing coding workspace"},
  {id: "codex", label: "Codex", note: "For an existing Codex workspace"},
];
export async function readDeskSetup(): Promise<DeskSetupStatus> {
  const response = await fetch("/__desk/review?setup=1", {headers: {"x-desk-local": "1"}, signal: AbortSignal.timeout(4000)});
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Start the local Desk to detect its connection settings.");
  const value = await response.json();
  if (value.available !== true || typeof value.workbenchPath !== "string" || typeof value.storePath !== "string") throw new Error("The local Desk needs the updated connection service.");
  if (value.connection != null && (typeof value.connection.clientName !== "string" || typeof value.connection.initializedAt !== "string" || !Number.isFinite(Date.parse(value.connection.initializedAt)) || value.connection.identityVerified !== false)) throw new Error("The Desk returned an invalid client contact. Restart the local service and retry.");
  return value;
}
export function reviewServerConfig(status: DeskSetupStatus) {
  return {command: status.nodePath ?? "node", args: [`${status.workbenchPath}/mcp-server/server.mjs`, "--review-store", status.storePath]};
}
export function setupPrompt(client: SetupClient, status: DeskSetupStatus | null) {
  const label = setupClients.find((item) => item.id === client)!.label;
  return `Help me connect Underwriting Desk to ${label} using my existing subscription. Complete the setup on my local computer if your tools can access it. If you are running in a remote browser or sandbox, say so and give me the local steps instead; do not claim you configured my computer.

${status ? `My running Desk's workbench folder is ${JSON.stringify(status.workbenchPath)}. Its review database is ${JSON.stringify(status.storePath)}. The MCP stdio launch configuration is:\n${JSON.stringify(reviewServerConfig(status), null, 2)}` : "First locate my local Underwriting Desk application folder. For an extracted package verify start-desk.mjs and mcp-server/server.mjs; for a source checkout verify workbench/scripts/start-desk.mjs and workbench/mcp-server/server.mjs. Do not substitute a different repository version. If the application is not installed, ask me for its supplied local package. Start an extracted package with node start-desk.mjs, or use the source checkout's documented desk:start command and read its detected setup settings."}

I authorize configuring only the underwriting-desk-review MCP entry. Inspect the local setup documentation and check Node.js 24 or newer. Use the client's supported MCP settings: ChatGPT desktop Settings → MCP servers → Add server → STDIO, or Claude Desktop's supported local MCP configuration; use the respective mcp add command for Claude Code or Codex. Preserve all other connectors and settings; back up any configuration file before editing. Inspect an existing entry and update only this entry if necessary. Request only permissions needed for this folder, MCP configuration, and restarting the client. Do not disable security controls, request full-disk access, extract subscription credentials, add API keys, enable paid usage, publish a server, or install a tunnel.

Explain any client restart before doing it. Then initialize the MCP connection from the actual client, list its tools, and call list_investment_reviews. Return to the Desk, open Connect model, and choose Check connection. Report success only when the Desk shows a recent client contact and the client can list the review tools. An empty review list is valid before I prepare evidence. Do not fabricate a model review, approve an investment proposal, or change deal assumptions as part of setup. If a required settings option is unavailable because of client version or workspace policy, report the exact missing option instead of claiming universal support.`;
}

export const clientSetupGuide: Record<SetupClient, {steps: string[]; help: string}> = {
  "claude-desktop": {steps: ["Open Claude Desktop Settings → Developer → Edit Config, if permitted by your workspace.", "Merge the underwriting-desk-review entry into mcpServers. Preserve existing entries; this download is a fragment, not a replacement file.", "Restart Claude Desktop, inspect Connectors, and ask it to call list_investment_reviews."], help: "https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop"},
  "chatgpt-desktop": {steps: ["Open ChatGPT desktop Settings → MCP servers → Add server.", "Name it underwriting-desk-review, choose STDIO, and enter the command and arguments below.", "Save and restart the server. Type /mcp in the composer to inspect its tools. If your app lacks this option, check its version and workspace policy."], help: "https://learn.chatgpt.com/docs/extend/mcp"},
  "claude-code": {steps: ["Open the intended local project in Claude Code.", "Use its supported MCP add workflow with the command and arguments below. Select the intended scope; preserve other servers.", "Restart the session and inspect /mcp. No API key is required by the Desk."], help: "https://code.claude.com/docs/en/mcp"},
  "codex": {steps: ["Open the intended local project in Codex.", "Add a STDIO server in MCP settings using the command and arguments below, or merge the TOML fragment into the intended configuration.", "Restart the session and inspect /mcp. Keep the existing subscription authentication."], help: "https://learn.chatgpt.com/docs/extend/mcp"},
};
export function clientConfig(client: SetupClient, status: DeskSetupStatus) {
  const config = reviewServerConfig(status);
  if (client === "codex") return `[mcp_servers.underwriting-desk-review]\ncommand = ${JSON.stringify(config.command)}\nargs = ${JSON.stringify(config.args)}\n`;
  return JSON.stringify(client === "claude-desktop" ? {mcpServers: {"underwriting-desk-review": config}} : config, null, 2);
}
export function contactAssessment(status: DeskSetupStatus | null, now = Date.now()) {
  if (!status) return {label: "Local service unavailable", detail: "Start the local Desk and retry detection."};
  if (!status.connection) return {label: "Awaiting client contact", detail: "Complete setup, then ask your model app to call list_investment_reviews."};
  const elapsed = now - Date.parse(status.connection.initializedAt);
  if (!Number.isFinite(elapsed) || elapsed < -60000) return {label: "Contact time unavailable", detail: "Check the computer clock, then reconnect the client."};
  if (elapsed > 30 * 60 * 1000) return {label: "Earlier client contact", detail: "Contact is over 30 minutes old. Ask the client to reconnect; this is not a live connection test."};
  return {label: "Recent client contact", detail: "A client initialized within 30 minutes. Confirm tool access in that app; identity is self-reported."};
}
export function setupKit(client: SetupClient, status: DeskSetupStatus) {
  return `Underwriting Desk — ${setupClients.find(item => item.id === client)!.label} setup\n\nLOCAL PATHS — keep this file private. This is a setup guide, not an installer.\n\n${clientSetupGuide[client].steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}\n\nConfiguration fragment:\n${clientConfig(client, status)}\n\nAssistant prompt:\n${setupPrompt(client, status)}\n\nOfficial instructions: ${clientSetupGuide[client].help}\n`;
}
