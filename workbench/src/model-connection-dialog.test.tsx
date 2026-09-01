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
    await user.click(screen.getByRole("radio", {name: /Advanced local MCP/}));
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

  it("leads with the built-in evidence challenge and does not expose provider-key setup", async () => {
    const user = userEvent.setup(); const onClose = vi.fn();
    render(<ModelConnectionDialog current={null} onClose={onClose} onApply={vi.fn()} />);
    expect(screen.getByRole("radio", {name: /Built-in evidence challenge/})).toBeChecked();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Keep provider credentials out of the browser"})).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Run a bounded challenge from Diligence"})).toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", {name: "Adapter endpoint"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Done"}));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
