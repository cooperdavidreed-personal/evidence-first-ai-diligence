import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import rawData from "./data/cases.json";
import {assertWorkbenchData} from "./data-contract";

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
    expect(screen.getAllByText(/data\/debt_terms.json/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", {name: "Close lineage"}));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("binds PE scenarios and sensitivities to retained engine receipts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Underwriting Room/}));
    await user.click(screen.getByRole("button", {name: /Upfront EV/}));
    expect(screen.getByRole("dialog", {name: "Upfront EV"})).toBeInTheDocument();
    expect(screen.getByText(/Result receipt/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Close lineage"}));
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", {name: "Driver"})).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", {name: "Driver"}), "exit_multiple");
    expect(screen.getByRole("button", {name: "6.5x"})).toHaveAttribute("aria-pressed", "true");
  });

  it("renders a reconciled value bridge with explicit credit classes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Value Creation/}));
    expect(screen.getAllByText("HUMAN JUDGMENT").length).toBeGreaterThan(0);
    expect(screen.getByText("Explicit double-count control")).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: /Combined value-creation impact/i}));
    expect(screen.getByRole("dialog", {name: "Combined value-creation impact"})).toBeInTheDocument();
    expect(screen.getByText(/Standalone sum/)).toBeInTheDocument();
  });

  it("binds every rendered PE finance element to the registry", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Underwriting Room/}));
    const candidate: unknown = rawData;
    assertWorkbenchData(candidate);
    const registered = new Set(candidate.cases.find((item) => item.caseId === "atlasgrid")!.metricRegistry.map((item) => item.metric_id));
    const visibleIds = [...document.querySelectorAll<HTMLElement>("[data-metric-id]")].map((item) => item.dataset.metricId!);
    expect(visibleIds.length).toBeGreaterThanOrEqual(70);
    expect(visibleIds.every((id) => registered.has(id))).toBe(true);
    expect([...document.querySelectorAll<HTMLElement>("td [data-metric-id], .exit-equation [data-metric-id]")].every((item) => item.tagName === "BUTTON")).toBe(true);
  });

  it("renders explicit team gaps and the full ownership cadence", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Thesis & Evidence/}));
    expect(screen.getByRole("heading", {name: "Team capability, gaps, and required capacity"})).toBeInTheDocument();
    expect(screen.getByText(/no org chart, succession evidence/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: /Value Creation/}));
    expect(screen.getByRole("heading", {name: "Ownership cadence"})).toBeInTheDocument();
    for (const phase of ["Pre-close", "Day 1", "Day 30", "Day 100", "Year 1"]) expect(screen.getByText(phase)).toBeInTheDocument();
  });
});
