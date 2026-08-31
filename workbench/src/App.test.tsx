import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import WorkbenchApp, {parseRoute} from "./App";
import rawData from "./data/cases.json";
import {assertWorkbenchData} from "./data-contract";

function App() {
  const candidate: unknown = rawData;
  assertWorkbenchData(candidate);
  const initialRoute = parseRoute();
  const initialCase = candidate.cases.find((item) => item.caseId === initialRoute.caseId)!;
  return <WorkbenchApp initialCase={initialCase} initialRoute={initialRoute} />;
}

describe("Underwriting Intelligence Lab", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));
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
    await waitFor(() => expect(screen.getByRole("heading", {name: "Helios Compute Control"})).toBeInTheDocument());
    expect(screen.getByRole("heading", {name: "CONDITIONAL INVEST"})).toBeInTheDocument();
    expect(screen.getByText(/Cooper David Reed — illustrative IC/)).toBeInTheDocument();
  });

  it("separates quantitative hurdle clearance from investment authority", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", {name: "The numbers can clear while the deal remains on hold"})).toBeInTheDocument();
    expect(screen.getAllByText("CLEARS").length).toBe(4);
    expect(screen.getByText("MISSES")).toBeInTheDocument();
    expect(screen.getByText(/At least 5% gross IRR · 1.25x gross MOIC · \$3M liquidity · no payment default · no covenant breach/)).toBeInTheDocument();
    expect(screen.getByText(/Do not advance at seller ask/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Inspect decision test for Gross IRR"}));
    expect(screen.getByRole("dialog", {name: "Gross IRR"})).toHaveTextContent("not investment approval");
    await user.click(screen.getByRole("button", {name: "Close lineage"}));
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    await waitFor(() => expect(screen.getAllByText("CLEARS").length).toBe(6));
    expect(screen.getByText(/Do not release the second tranche/)).toBeInTheDocument();
  });

  it("restores stable case and room routes and searches the deal room", async () => {
    window.history.replaceState(null, "", "/#/v2/helios/evidence");
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", {name: "Helios Compute Control"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: /Thesis & Evidence/})).toHaveAttribute("aria-current", "page");
    const search = screen.getByRole("searchbox", {name: "Search room"});
    await user.type(search, "provider-level compute");
    expect(screen.getByRole("status")).toHaveTextContent("1 of");
    expect(screen.getByLabelText("Deal room search results")).toHaveTextContent("Provider-level compute, telemetry, and support unit-cost ledger");
    await user.click(screen.getByRole("button", {name: /AtlasGrid Systems/}));
    await waitFor(() => expect(window.location.hash).toBe("#/v2/atlasgrid/evidence"));
    expect(screen.getByRole("button", {name: /Thesis & Evidence/})).toHaveAttribute("aria-current", "page");
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
    expect(screen.getByText(/Direct observation or declared assumption/)).toBeInTheDocument();
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
    expect(screen.getByText("SUBTRACT")).toBeInTheDocument();
    expect(screen.getByText(/Combined exit equity result/)).toBeInTheDocument();
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

  it("renders Helios as an event-based VC model with receipt-changing scenarios", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    await user.click(screen.getByRole("button", {name: /Underwriting Room/}));
    expect(screen.getByRole("heading", {name: "Terms, ownership, runway, and preferences"})).toBeInTheDocument();
    expect(screen.queryByText(/pending v2 engine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^n\/a$/i)).not.toBeInTheDocument();
    const scenarioState = screen.getByText(/Selected scenario state/).parentElement!;
    const receipt = scenarioState.getAttribute("data-receipt-sha256");
    await user.click(screen.getByRole("button", {name: /Shortfall bridge/}));
    expect(screen.getByText(/Shortfall M/)).toBeInTheDocument();
    expect(screen.getByText(/Selected scenario state/).parentElement).not.toHaveAttribute("data-receipt-sha256", receipt);
    expect(screen.getByRole("heading", {name: "Exit waterfall"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Milestone test ledger"})).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", {name: "Driver"}), "milestone_state");
    await user.click(screen.getByRole("button", {name: "FAIL"}));
    expect(screen.getByRole("button", {name: /Series C gross XIRR/})).toBeInTheDocument();
  });

  it("binds every rendered VC finance control to the registry", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    await user.click(screen.getByRole("button", {name: /Underwriting Room/}));
    const candidate: unknown = rawData;
    assertWorkbenchData(candidate);
    const registered = new Set(candidate.cases.find((item) => item.caseId === "helios")!.metricRegistry.map((item) => item.metric_id));
    const visibleIds = [...document.querySelectorAll<HTMLElement>("[data-metric-id]")].map((item) => item.dataset.metricId!);
    expect(visibleIds.length).toBeGreaterThanOrEqual(35);
    expect(visibleIds.every((id) => registered.has(id))).toBe(true);
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

  it("renders all four registered chart contracts in their declared views", async () => {
    const user = userEvent.setup();
    render(<App />);
    const chartIds = new Set<string>();
    for (const view of ["IC Snapshot", "Thesis & Evidence", "Underwriting Room", "Value Creation"]) {
      await user.click(screen.getByRole("button", {name: new RegExp(view)}));
      const contract = screen.getByLabelText(new RegExp(`${view} chart contracts`)).querySelector<HTMLElement>("[data-chart-id]");
      expect(contract).not.toBeNull();
      chartIds.add(contract!.dataset.chartId!);
    }
    expect(chartIds.size).toBe(4);
  });

  it("opens stable econometric output lineage from the paired estimate and output ledger", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Econometric Lab/}));
    const paired = screen.getByRole("button", {name: "Inspect lineage for Randomized offer ITT"});
    expect(paired).toHaveAttribute("data-metric-id", "atlasgrid-ag-07-renewal_itt");
    paired.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", {name: /AG-07 · renewal itt/i})).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(paired).toHaveFocus();
    const output = screen.getByRole("button", {name: /Inspect lineage for AG-08 · resolution att/i});
    expect(output).toHaveAttribute("data-metric-id", "atlasgrid-ag-08-resolution_att");
  });

  it("states the investment consequence of identified and non-identified analyses", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Econometric Lab/}));
    expect(screen.getAllByText("ZERO CREDIT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BASE-CASE CREDIT · BOUNDED").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", {name: "Association / abstention"}));
    expect(screen.getAllByText("ZERO CREDIT").length).toBeGreaterThan(0);
    expect(screen.getByText(/No base-case causal credit is permitted/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    await user.click(screen.getByRole("button", {name: "Identified synthetic effect"}));
    expect(screen.getAllByText("SCENARIO ONLY").length).toBeGreaterThan(0);
    expect(screen.getByText(/maps to \$0.1M monthly cash, \$7.7M exit value, and \+0.16 pp gross XIRR/i)).toBeInTheDocument();
  });

  it("distinguishes hurdle failure from capital loss and surfaces every Helios funding gate", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("02 · How the deal misses its hurdle")).toBeInTheDocument();
    expect(screen.getByText(/a hurdle failure, not a capital-loss case/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    expect(screen.getByText(/Stage history flags 48 inflated opportunities/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Pipeline, unit costs, and executed terms"})).toBeInTheDocument();
    expect(screen.getByText(/do not fund the \$25M first close until ownership and every waterfall scenario reconcile/i)).toBeInTheDocument();
  });

  it("uses the registered Helios MOIC distribution IDs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    const distribution = screen.getByRole("button", {name: "Inspect lineage for p10 conditional MOIC"});
    expect(distribution).toHaveAttribute("data-metric-id", "helios-distribution-moic-0");
    await user.click(distribution);
    expect(screen.getByRole("dialog", {name: "p10 conditional MOIC"})).toHaveTextContent("Governing receipt");
  });

  it("keeps the complete branching thesis register when a primary path is selected", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Thesis & Evidence/}));
    const decision = document.querySelector<SVGGElement>('[data-node-id="decision"]')!;
    await user.click(decision);
    expect(screen.getByText(/Primary reading path shown above/)).toBeInTheDocument();
    const register = screen.getByLabelText("Complete connected dependency register");
    expect(register.querySelectorAll("li").length).toBeGreaterThanOrEqual(20);
    expect(register.parentElement).toHaveAttribute("data-connected-edge-count", String(register.querySelectorAll("li").length));
  });

  it("formula-binds representative scenario, distribution, sensitivity, ownership, cash, and value outputs", () => {
    const candidate: unknown = rawData;
    assertWorkbenchData(candidate);
    const required: Record<string, string[]> = {
      atlasgrid: ["atlasgrid-ASK-gross-irr", "atlasgrid-DOWNSIDE-gross-moic", "atlasgrid-distribution-0", "atlasgrid-gross_margin:0.70-irr", "atlasgrid-value-combined"],
      helios: ["helios-MILESTONE-gross-xirr", "helios-MILESTONE-minimum-cash", "helios-distribution-moic-0", "helios-vc-exit_value-1-ownership", "helios-value-combined_target_proceeds_delta_cents"],
    };
    for (const caseData of candidate.cases) {
      const metrics = new Map(caseData.metricRegistry.map((item) => [item.metric_id, item]));
      const formulas = new Set(caseData.formulaRegistry.map((item) => item.formula_id));
      for (const id of required[caseData.caseId]) {
        const metric = metrics.get(id)!;
        expect(metric.formula_id).toBeTruthy();
        expect(metric.operand_ids.length).toBeGreaterThan(0);
        expect(formulas.has(metric.formula_id!)).toBe(true);
      }
    }
  });

  it("renders governed diligence, prioritized initiatives, and screened-out levers", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Thesis & Evidence/}));
    expect(screen.getByRole("heading", {name: "Diligence requests and decision consequences"})).toBeInTheDocument();
    expect(screen.getByText("AG-D04")).toBeInTheDocument();
    expect(screen.getAllByText(/Do not advance debt terms/).length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole("button", {name: /Value Creation/}));
    expect(screen.getByRole("heading", {name: "Screened-out levers"})).toBeInTheDocument();
    expect(screen.getByText("Broad renewal price increase")).toBeInTheDocument();
    expect(screen.getByLabelText("Prioritized value-creation initiatives")).toHaveTextContent("P1 · Days 1–100");
    expect(screen.getByLabelText("Prioritized value-creation initiatives")).toHaveTextContent("Implementation cost");
    expect(screen.getByLabelText("Prioritized value-creation initiatives")).toHaveTextContent("Stop rule");
  });

  it("reconciles required conditions without confusing them with approval", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", {name: "3 unresolved · 3 required"})).toBeInTheDocument();
    expect(screen.getAllByText("OPEN DILIGENCE")).toHaveLength(3);
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    expect(screen.getByRole("heading", {name: "2 unresolved · 7 required"})).toBeInTheDocument();
    expect(screen.getAllByText("CLEARS QUANTITATIVELY")).toHaveLength(5);
    expect(screen.getAllByText("OPEN DILIGENCE")).toHaveLength(2);
    expect(screen.getAllByText("PENDING HUMAN").length).toBeGreaterThan(0);
  });

  it("uses authority-safe modeled-terms language", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    expect(screen.queryByText(/unconditional/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/executable second tranche/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: /First close · Series C cash/}));
    expect(screen.getByRole("dialog")).toHaveTextContent(/not authorized while workflow disposition is HOLD/i);
  });

  it("makes every econometric analysis reachable", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Econometric Lab/}));
    await user.click(screen.getByRole("button", {name: "All analyses"}));
    expect(document.querySelectorAll(".analysis-detail")).toHaveLength(11);
    await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
    expect(document.querySelectorAll(".analysis-detail")).toHaveLength(9);
  });

  it("turns deal-room analysis and request results into stable destinations", async () => {
    window.history.replaceState(null, "", "/#/v2/helios/evidence");
    const user = userEvent.setup();
    render(<App />);
    const search = screen.getByRole("searchbox", {name: "Search room"});
    await user.type(search, "HX-05");
    await user.click(screen.getByRole("button", {name: /Open analysis/}));
    expect(window.location.hash).toBe("#/v2/helios/econometrics?section=analysis-HX-05");
    expect(document.getElementById("analysis-HX-05")).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: /Thesis & Evidence/}));
    await user.clear(screen.getByRole("searchbox", {name: "Search room"}));
    await user.type(screen.getByRole("searchbox", {name: "Search room"}), "HX-D04");
    await user.click(screen.getByRole("button", {name: /Open request/}));
    expect(window.location.hash).toBe("#/v2/helios/evidence?section=request-HX-D04");
    expect(document.getElementById("request-HX-D04")).toBeInTheDocument();
  });

  it("canonicalizes invalid underwriting controls instead of retaining dead routes", async () => {
    window.history.replaceState(null, "", "/#/v2/helios/underwriting?scenario=optimistic&driver=fantasy&cell=missing&section=unknown");
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe("#/v2/helios/underwriting"));
    expect(screen.getByRole("button", {name: /Tranche withheld · Series D/})).toHaveAttribute("aria-pressed", "true");
  });

  it("renders each registered finance value from the registry display contract", async () => {
    const candidate: unknown = rawData;
    assertWorkbenchData(candidate);
    const user = userEvent.setup();
    render(<App />);
    for (const caseData of candidate.cases) {
      if (caseData.caseId === "helios") await user.click(screen.getByRole("button", {name: /Helios Compute Control/}));
      const registry = new Map(caseData.metricRegistry.map((item) => [item.metric_id, item.display_value]));
      for (const targetView of ["IC Snapshot", "Underwriting Room", "Value Creation"]) {
        await user.click(screen.getByRole("button", {name: new RegExp(targetView)}));
        for (const element of document.querySelectorAll<HTMLElement>("[data-metric-id]")) {
          const display = registry.get(element.dataset.metricId!);
          expect(display, element.dataset.metricId).toBeTruthy();
          expect(element.textContent, element.dataset.metricId).toContain(display);
        }
      }
    }
  });
});
