import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it} from "vitest";
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

describe("Underwriting Intelligence Lab investor workspace", () => {
  beforeEach(() => window.history.replaceState(null, "", "/#/v2/atlasgrid/overview"));

  it("offers a no-instruction landing journey", async () => {
    window.history.replaceState(null, "", "/");
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", {name: /Turn a crowded data room/})).toBeInTheDocument();
    expect(screen.getByText("Do we meet the $240M ask, counter at $210M, or walk?")).toBeInTheDocument();
    expect(screen.queryByText(/\$220M ask/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: /Review a sample deal/}));
    expect(screen.getByRole("heading", {name: "AtlasGrid Systems"})).toBeInTheDocument();
    expect(window.location.hash).toBe("#/v2/atlasgrid/overview");
  });

  it("puts the investment question, company context, and four primary sections first", () => {
    render(<App />);
    expect(screen.getByRole("heading", {name: "Do we meet the $240M ask, counter at $210M, or walk?"})).toBeInTheDocument();
    expect(screen.getByText(/regulated electric-utility grid planning/)).toBeInTheDocument();
    expect(screen.getByText("SYNTHETIC — NOT INVESTMENT ADVICE")).toBeInTheDocument();
    for (const name of ["Overview", "Financials", "Risks", "Memo"]) {
      expect(screen.getByRole("button", {name: new RegExp(name)})).toBeInTheDocument();
    }
    expect(screen.getByText("Evidence")).toBeInTheDocument();
  });

  it("switches strategy while preserving the human-authority boundary", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: "VC / Growth Helios Compute Control"}));
    await waitFor(
      () => expect(screen.getByRole("heading", {name: "Helios Compute Control"})).toBeInTheDocument(),
      {timeout: 10_000},
    );
    expect(screen.getByRole("heading", {name: "HOLD"})).toBeInTheDocument();
    expect(screen.getAllByText(/Requires investment committee approval/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/canonical unreviewed synthetic prior/).length).toBeGreaterThan(0);
  });

  it("reruns canonical PE and VC assumption cells from the overview", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getAllByText("23.3%").length).toBeGreaterThan(0);
    expect(screen.getByText(/>=22% IRR/)).toBeInTheDocument();
    expect(screen.getByText(/Sponsor equity at close/)).toBeInTheDocument();
    expect(screen.getByText(/Decision impact:/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "$220M"}));
    expect(screen.getByText("21.0%")).toBeInTheDocument();
    expect(screen.getByText(/Return hurdle fails/)).toBeInTheDocument();
    expect(window.location.hash).toContain("driver=entry_enterprise_value_cents");
    await user.click(screen.getByRole("button", {name: "VC / Growth Helios Compute Control"}));
    await waitFor(
      () => expect(screen.getByRole("heading", {name: "Helios Compute Control"})).toBeInTheDocument(),
      {timeout: 10_000},
    );
    await user.click(screen.getByRole("button", {name: "30.0% annual growth"}));
    expect(screen.getByText("36.6%")).toBeInTheDocument();
    expect(screen.getByText("4.3x")).toBeInTheDocument();
    expect(screen.getByText(/option pool modeled as fully granted common at exit/)).toBeInTheDocument();
  });

  it("recalculates a bounded local Helios working case without changing the canonical HOLD", async () => {
    window.history.replaceState(null, "", "/#/v2/helios/overview");
    const user = userEvent.setup();
    render(<App />);
    const growth = await screen.findByTestId("helios-assumption-growth");
    const policy = screen.getByTestId("helios-policy-loss-maximum");
    await user.clear(growth);
    await user.type(growth, "30");
    await user.clear(policy);
    await user.type(policy, "8");
    await user.click(screen.getByTestId("helios-recalculate-working-case"));
    expect(screen.getByTestId("helios-working-change-record")).toHaveTextContent("Growth 48.0% → 30.0%");
    expect(screen.getByTestId("helios-working-change-record")).toHaveTextContent("Loss ceiling 10.0% → 8.0%");
    expect(screen.getByTestId("helios-working-case-status")).toHaveTextContent("HOLD");
    expect(screen.getByTestId("helios-working-assumptions")).toHaveTextContent("milestone");
    expect(screen.getByTestId("helios-working-assumptions")).toHaveTextContent("financing shortfall");
  });

  it("migrates legacy routes deterministically", async () => {
    window.history.replaceState(null, "", "/#/v2/helios/underwriting?scenario=optimistic&driver=fantasy&cell=missing");
    render(<App />);
    await waitFor(() => expect(window.location.hash).toBe("#/v2/helios/financials"));
    expect(screen.getByRole("heading", {name: "Terms, ownership, runway, and preferences"})).toBeInTheDocument();
  });

  it("opens a keyboard-addressable number-to-source drawer", async () => {
    const user = userEvent.setup();
    render(<App />);
    const metric = screen.getByRole("button", {name: /Inspect lineage for Repriced return/});
    metric.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", {name: "Repriced return"})).toHaveTextContent(/Calculation and decision chain/);
    await user.keyboard("{Escape}");
    expect(metric).toHaveFocus();
  });

  it("keeps finance controls bound to retained engine metrics", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Financials/}));
    await user.click(screen.getByRole("button", {name: /Upfront EV/}));
    expect(screen.getByRole("dialog", {name: "Upfront EV"})).toHaveTextContent(/Direct observation or declared assumption/);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("combobox", {name: "Driver"})).toBeInTheDocument();
  });

  it("presents open diligence as an investor worklist", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Risks/}));
    expect(screen.getByRole("heading", {name: "Resolve these before the next committee step"})).toBeInTheDocument();
    expect(screen.getByText("AG-D04")).toBeInTheDocument();
    expect(screen.getByText(/Management assessment/)).toBeInTheDocument();
  });

  it("keeps econometric credit and diagnostics in Methodology", async () => {
    const user = userEvent.setup();
    render(<App />);
    const evidenceMenu = screen.getByText("Evidence").closest("details")!;
    if (!evidenceMenu.open) await user.click(screen.getByText("Evidence"));
    await user.click(screen.getByRole("button", {name: "Methodology"}));
    expect(screen.getAllByText("VALUE-CREATION BRIDGE ONLY").length).toBeGreaterThan(0);
    const paired = screen.getByRole("button", {name: "Inspect lineage for Randomized offer ITT"});
    expect(paired).toHaveAttribute("data-metric-id", "atlasgrid-ag-07-renewal_itt");
  });

  it("states the recommended cap without a public one-cent claim", () => {
    render(<App />);
    expect(screen.getByText(/Mathematical maximum: \$215.4M. The recommended cap remains \$210M/)).toBeInTheDocument();
    expect(screen.queryByText(/one additional cent/)).not.toBeInTheDocument();
  });

  it("provides an accessible one-page IC memo path", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Memo/}));
    expect(screen.getAllByRole("heading", {name: "AtlasGrid Systems"})).toHaveLength(2);
    expect(screen.getByRole("link", {name: "Open one-page IC snapshot"})).toHaveAttribute("href", "output/pdf/atlasgrid-ic-snapshot-letter.pdf");
    expect(screen.getByRole("link", {name: "Open underwriting packet"})).toBeInTheDocument();
    expect(screen.getByText("Requires investment committee approval")).toBeInTheDocument();
  });

  it("keeps human judgment separate and requires confirmation for assumption review", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("Private to this browser.")).toBeInTheDocument();
    const note = screen.getByRole("textbox", {name: "Private analyst note"});
    await user.type(note, "Confirm parent concentration before IOI.");
    await user.click(screen.getByRole("button", {name: "Save private note"}));
    await user.click(screen.getAllByRole("button", {name: "Review approval"})[0]);
    expect(screen.getByText(/This records analyst judgment only/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Confirm approved"}));
    expect(screen.getAllByText("approved").length).toBeGreaterThan(0);
  });

  it("distinguishes source classes and states the model-hypothesis boundary", async () => {
    const user = userEvent.setup();
    render(<App />);
    const evidenceMenu = screen.getByText("Evidence").closest("details")!;
    if (!evidenceMenu.open) await user.click(screen.getByText("Evidence"));
    await user.click(screen.getByRole("button", {name: "Sources"}));
    expect(screen.getByRole("heading", {name: /Keep facts, representations, assumptions, and judgment separate/})).toBeInTheDocument();
    expect(screen.getByText(/A future model may propose, but cannot approve/)).toBeInTheDocument();
    expect(screen.getAllByText(/Management representation · synthetic/).length).toBeGreaterThan(0);
  });

  it("searches retained sources and deep-links analyses", async () => {
    window.history.replaceState(null, "", "/#/v2/helios/explore");
    const user = userEvent.setup();
    render(<App />);
    const search = screen.getByRole("searchbox", {name: "Search room"});
    await user.type(search, "HX-05");
    await user.click(screen.getByRole("button", {name: /Open analysis/}));
    expect(window.location.hash).toBe("#/v2/helios/methodology?section=analysis-HX-05");
    expect(document.getElementById("analysis-HX-05")).toBeInTheDocument();
  });

  it("binds every rendered finance element to the registry", async () => {
    const candidate: unknown = rawData;
    assertWorkbenchData(candidate);
    const user = userEvent.setup();
    render(<App />);
    for (const caseData of candidate.cases) {
      await user.click(screen.getByRole("button", {name: new RegExp(caseData.company)}));
      const registered = new Set(caseData.metricRegistry.map((item) => item.metric_id));
      for (const targetView of ["Overview", "Financials", "Value Creation"]) {
        if (targetView === "Value Creation") {
          const evidenceMenu = screen.getByText("Evidence").closest("details")!;
          if (!evidenceMenu.open) await user.click(screen.getByText("Evidence"));
        }
        await user.click(screen.getByRole("button", {name: new RegExp(targetView)}));
        for (const element of document.querySelectorAll<HTMLElement>("[data-metric-id]")) {
          expect(registered.has(element.dataset.metricId!), element.dataset.metricId).toBe(true);
        }
      }
    }
  });
});
