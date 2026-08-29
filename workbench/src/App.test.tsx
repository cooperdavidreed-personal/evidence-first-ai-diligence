import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Underwriting Intelligence Lab", () => {
  it("renders all five investment views and synthetic disclosure", () => {
    render(<App />);
    expect(screen.getByRole("heading", {name: "AtlasGrid Systems"})).toBeInTheDocument();
    expect(screen.getByText("SYNTHETIC — NOT INVESTMENT ADVICE")).toBeInTheDocument();
    for (const name of ["IC Snapshot", "Thesis & Evidence", "Econometric Lab", "Underwriting Room", "Value Creation"]) {
      expect(screen.getByRole("button", {name: new RegExp(name)})).toBeInTheDocument();
    }
  });

  it("switches cases and keeps the human decision attribution", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    expect(screen.getByRole("heading", {name: "Helios Compute Control"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "INVEST"})).toBeInTheDocument();
    expect(screen.getByText("Cooper David Reed — illustrative IC")).toBeInTheDocument();
  });

  it("opens a keyboard-addressable lineage drawer", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Inspect lineage for Repriced return/}));
    expect(screen.getByRole("dialog", {name: "Repriced return"})).toBeInTheDocument();
    expect(screen.getByText(/data\/debt_terms.json/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Close lineage"}));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
