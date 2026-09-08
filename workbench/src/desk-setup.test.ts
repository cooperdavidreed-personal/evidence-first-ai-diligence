import {describe, expect, it} from "vitest";
import {clientConfig, contactAssessment, setupKit, type DeskSetupStatus} from "./desk-setup";
const status: DeskSetupStatus = {available:true, workbenchPath:'C:\\My Desk', storePath:'C:\\Private\\review.sqlite', nodePath:'C:\\Runtime\\node.exe'};
describe("client-specific local setup", () => {
  it("preserves path escapes in distinct client configuration formats", () => {
    const claude = JSON.parse(clientConfig("claude-desktop",status));
    expect(claude.mcpServers["underwriting-desk-review"].command).toBe(status.nodePath);
    expect(JSON.parse(clientConfig("chatgpt-desktop",status)).args[2]).toBe(status.storePath);
    expect(clientConfig("codex",status)).toContain('[mcp_servers.underwriting-desk-review]');
    expect(setupKit("claude-desktop",status)).toContain("fragment, not a replacement file");
  });
  it("distinguishes unavailable, absent, recent, old and invalid contact times", () => {
    const now = Date.parse("2026-09-07T12:00:00Z");
    expect(contactAssessment(null,now).label).toBe("Local service unavailable");
    expect(contactAssessment(status,now).label).toBe("Awaiting client contact");
    const contact = (initializedAt:string) => ({...status,connection:{clientName:"test",initializedAt,identityVerified:false as const}});
    expect(contactAssessment(contact("2026-09-07T11:55:00Z"),now).label).toBe("Recent client contact");
    expect(contactAssessment(contact("2026-09-06T11:55:00Z"),now).label).toBe("Earlier client contact");
    expect(contactAssessment(contact("invalid"),now).label).toBe("Contact time unavailable");
  });
});
