import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, describe, expect, it, vi} from "vitest";
import {ModelConnectionDialog} from "./model-connection-dialog";
afterEach(() => vi.unstubAllGlobals());
describe("guided model connection", () => {
  it("moves focus into the modal and closes with Escape", async () => {
    const onClose = vi.fn();
    render(<ModelConnectionDialog current={null} onClose={onClose} onApply={vi.fn()} />);
    expect(screen.getByRole("button", {name: "Close model connection"})).toHaveFocus();
    await userEvent.setup().keyboard("{Escape}"); expect(onClose).toHaveBeenCalledOnce();
  });
  it("detects launch paths without claiming a saved setup is a connection", async () => {
    const status = {available: true, workbenchPath: "/desk/workbench", storePath: "/desk/reviews.sqlite", nodePath: "/runtime/node", connection: null};
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(status), {headers: {"content-type": "application/json"}})));
    const user = userEvent.setup(); const onApply = vi.fn();
    render(<ModelConnectionDialog current={null} onClose={vi.fn()} onApply={onApply} />);
    expect(await screen.findByText(/Local Desk detected/)).toBeInTheDocument();
    expect(screen.getByRole("radio", {name: /Claude Desktop/})).toBeChecked();
    await user.click(screen.getByText("Read the setup prompt"));
    const prompt = screen.getByRole("textbox", {name: "Setup prompt"}) as HTMLTextAreaElement;
    expect(prompt.value).toContain("/runtime/node"); expect(prompt.value).toContain("--review-store");
    await user.click(screen.getByRole("button", {name: "Check connection"}));
    expect(await screen.findByText(/no model client has contacted/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Done"}));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({client: "claude-desktop", state: "SETUP_PREPARED"}));
  });
  it("reports a handshake as historical contact, not authenticated identity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({available: true, workbenchPath: "/desk/workbench", storePath: "/desk/reviews.sqlite", connection: {clientName: "Test MCP client", initializedAt: "2026-09-07T16:00:00Z", identityVerified: false}}), {headers: {"content-type": "application/json"}})));
    render(<ModelConnectionDialog current={null} onClose={vi.fn()} onApply={vi.fn()} />);
    expect(await screen.findByText(/Last contact: Test MCP client/)).toHaveTextContent(/not continuous online status or authenticated model identity/);
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
  });
});
