import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {ModelConnectionDialog} from "./model-connection-dialog";

describe("model connection wizard", () => {
  it("moves focus into the modal and closes with Escape", async () => {
    const user = userEvent.setup(); const onClose = vi.fn();
    render(<ModelConnectionDialog current={null} onClose={onClose} onApply={vi.fn()} />);
    expect(screen.getByRole("button", {name: "Close model connection"})).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("explains the canonical Desk boundary and prepares a real Claude Code command", async () => {
    const user = userEvent.setup(); const onApply = vi.fn();
    render(<ModelConnectionDialog current={null} onClose={vi.fn()} onApply={onApply} />);
    expect(screen.getByRole("heading", {name: "One deal record. Replaceable models."})).toBeInTheDocument();
    expect(screen.getByText("Validated source package and lineage")).toBeInTheDocument();
    expect(screen.getByText("Countertheses and missing diligence")).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("radio", {name: /Claude Code/})).toBeChecked();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByText(/claude mcp add --scope user underwriting-desk/)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Save setup plan"}));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({channel: "LOCAL_MCP", client: "claude-code", state: "SETUP_PREPARED"}));
  });

  it("does not claim that ChatGPT can reach the local stdio server", async () => {
    const user = userEvent.setup(); const onApply = vi.fn();
    render(<ModelConnectionDialog current={null} onClose={vi.fn()} onApply={onApply} />);
    await user.click(screen.getByRole("button", {name: "Continue"}));
    await user.click(screen.getByRole("radio", {name: /ChatGPT/}));
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "A hosted connector is required"})).toBeInTheDocument();
    expect(screen.getByText(/not a remotely reachable authenticated server/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Record requirement"}));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({channel: "REMOTE_MCP", client: "chatgpt", state: "HOSTED_SERVER_REQUIRED"}));
  });

  it("tests the server-side adapter contract before enabling in-desk review", async () => {
    const user = userEvent.setup(); const onApply = vi.fn();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({status: "READY", contracts: ["underwriting-evidence-challenge/v1"]}), {status: 200}));
    render(<ModelConnectionDialog current={null} onClose={vi.fn()} onApply={onApply} fetcher={fetcher} />);
    await user.click(screen.getByRole("radio", {name: /Inside the Underwriting Desk/}));
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Keep provider credentials out of the browser"})).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    await user.type(screen.getByRole("textbox", {name: "Adapter endpoint"}), "https://models.example.com/review");
    await user.click(screen.getByRole("button", {name: "Verify adapter contract"}));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({channel: "API_ADAPTER", endpoint: "https://models.example.com/review", state: "CONTRACT_VERIFIED"}));
  });
});
