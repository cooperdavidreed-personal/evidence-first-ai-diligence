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

  it("puts the investment question, company context, and six primary sections first", () => {
    render(<App />);
    expect(screen.getByRole("heading", {name: "Do we meet the $240M ask, counter at $210M, or walk?"})).toBeInTheDocument();
    expect(screen.getByText(/regulated electric-utility grid planning/)).toBeInTheDocument();
    expect(screen.getByText("SYNTHETIC — NOT INVESTMENT ADVICE")).toBeInTheDocument();
    for (const name of ["Overview", "Thesis", "Financials & Returns", "Risks & Diligence", "Value Creation", "Memo"]) {
      expect(screen.getByRole("button", {name: new RegExp(name)})).toBeInTheDocument();
    }
  });

  it("switches strategy while preserving the human-authority boundary", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: "VC / Growth Helios Compute Control"}));
    await waitFor(() => expect(screen.getByRole("heading", {name: "Helios Compute Control"})).toBeInTheDocument());
    expect(screen.getByRole("heading", {name: "CONDITIONAL INVEST"})).toBeInTheDocument();
    expect(screen.getByText(/Analytical posture only/)).toBeInTheDocument();
    expect(screen.getAllByText(/PENDING HUMAN/).length).toBeGreaterThan(0);
  });

  it("reruns canonical PE and VC assumption cells from the overview", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getAllByText("23.26%").length).toBeGreaterThan(0);
    expect(screen.getByText(/>=22% IRR/)).toBeInTheDocument();
    expect(screen.getByText(/Sponsor equity at close/)).toBeInTheDocument();
    expect(screen.getByText(/Recommendation impact:/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "$220M"}));
    expect(screen.getByText("20.97%")).toBeInTheDocument();
    expect(screen.getByText(/Return hurdle fails/)).toBeInTheDocument();
    expect(window.location.hash).toContain("driver=entry_enterprise_value_cents");
    await user.click(screen.getByRole("button", {name: "VC / Growth Helios Compute Control"}));
    await user.click(screen.getByRole("button", {name: "$400M"}));
    expect(screen.getByText("14.72%")).toBeInTheDocument();
    expect(screen.getByText("1.90x")).toBeInTheDocument();
    expect(screen.getByText(/option pool modeled as fully granted common at exit/)).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", {name: /Financials & Returns/}));
    await user.click(screen.getByRole("button", {name: /Upfront EV/}));
    expect(screen.getByRole("dialog", {name: "Upfront EV"})).toHaveTextContent(/Direct observation or declared assumption/);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("combobox", {name: "Driver"})).toBeInTheDocument();
  });

  it("presents open diligence as an investor worklist", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Risks & Diligence/}));
    expect(screen.getByRole("heading", {name: "Resolve these before the next committee step"})).toBeInTheDocument();
    expect(screen.getByText("AG-D04")).toBeInTheDocument();
    expect(screen.getByText(/Management assessment/)).toBeInTheDocument();
  });

  it("keeps econometric credit and diagnostics in Methodology", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: "Methodology"}));
    expect(screen.getAllByText("VALUE-CREATION BRIDGE ONLY").length).toBeGreaterThan(0);
    const paired = screen.getByRole("button", {name: "Inspect lineage for Randomized offer ITT"});
    expect(paired).toHaveAttribute("data-metric-id", "atlasgrid-ag-07-renewal_itt");
  });

  it("states the exact maximum-bid downside floor and cent boundary", () => {
    render(<App />);
    expect(screen.getByText(/Solved maximum upfront bid: \$215.4M; one additional cent must fail at least one constraint/)).toBeInTheDocument();
  });

  it("provides an accessible one-page IC memo path", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Memo/}));
    expect(screen.getAllByRole("heading", {name: "AtlasGrid Systems"})).toHaveLength(2);
    expect(screen.getByRole("button", {name: "Print one-page memo"})).toBeInTheDocument();
    expect(screen.getByText("Analytical recommendation only")).toBeInTheDocument();
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
      if (caseData.caseId === "helios") await user.click(screen.getByRole("button", {name: "VC / Growth Helios Compute Control"}));
      const registered = new Set(caseData.metricRegistry.map((item) => item.metric_id));
      for (const targetView of ["Overview", "Financials & Returns", "Value Creation"]) {
        await user.click(screen.getByRole("button", {name: new RegExp(targetView)}));
        for (const element of document.querySelectorAll<HTMLElement>("[data-metric-id]")) {
          expect(registered.has(element.dataset.metricId!), element.dataset.metricId).toBe(true);
        }
      }
    }
  });
});
