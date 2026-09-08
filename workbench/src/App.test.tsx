import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {File as NodeFile} from "node:buffer";
import {beforeEach, describe, expect, it, vi} from "vitest";
import WorkbenchApp, {dealViews, parseRoute} from "./App";
import rawData from "./data/cases.json";
import {assertWorkbenchData} from "./data-contract";

function App() {
  const candidate: unknown = rawData;
  assertWorkbenchData(candidate);
  const initialRoute = parseRoute();
  const initialCase = candidate.cases.find((item) => item.caseId === (initialRoute.caseId === "local" ? "atlasgrid" : initialRoute.caseId))!;
  return <WorkbenchApp initialCase={initialCase} initialRoute={initialRoute} loadCaseFn={async (caseId) => candidate.cases.find((item) => item.caseId === caseId)!} />;
}
const TestFile = NodeFile as unknown as typeof File;

describe("Underwriting Desk investor workspace", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {configurable: true, value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    }});
    window.history.replaceState(null, "", "/");
    Object.defineProperty(window, "scrollTo", {configurable: true, value: vi.fn()});
  });

  it("fails closed when a direct local-deal route has no admitted deal", async () => {
    window.history.replaceState(null, "", "/#/v3/local/financials");
    render(<App />);
    expect(await screen.findByRole("heading", {name: "Deals"})).toBeInTheDocument();
    expect(screen.getByText(/local deal .*unavailable in this browser/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", {name: "AtlasGrid Systems"})).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe("#/"));
  });

  it("starts with a quiet deal list and supported intake boundary", () => {
    render(<App />);
    expect(screen.getByRole("heading", {name: "Deals"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "New deal"})).toBeInTheDocument();
    expect(screen.getByText(/Public demonstration with fictional companies/)).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Screen a company package"})).toBeInTheDocument();
    expect(screen.queryByText(/Evidence → economics → action/)).not.toBeInTheDocument();
    expect(screen.getByText("Decision workspaces")).toBeInTheDocument();
    expect(screen.getByText("Open issues")).toBeInTheDocument();
    expect(screen.getByText("Last activity")).toBeInTheDocument();
  });

  it("opens a model connection center that explains the Desk-model boundary", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: "Connect model"}));
    expect(screen.getByRole("dialog", {name: "Connect your model"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Copy setup prompt"})).toBeInTheDocument();
    expect(screen.getByText(/No API keys/)).toBeInTheDocument();
  });

  it("opens an ordinary browser-local package intake", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: "New deal"}));
    await user.click(screen.getByText("Complete-package screening · existing governed workflow"));
    expect(screen.getByRole("heading", {name: "Start a deal review"})).toBeInTheDocument();
    expect(screen.getByText(/Selections remain in this tab until/)).toBeInTheDocument();
    expect(screen.getByTestId("deal-package-input")).toHaveAttribute("multiple");
    expect(screen.getByRole("button", {name: "Validate and analyze"})).toBeDisabled();
    expect(screen.getByText(/Files are processed locally/)).toBeInTheDocument();
    expect(screen.getByText(/evidence summaries you explicitly select after confirmation/)).toBeInTheDocument();
  });

  it("opens a retained case with the task-oriented in-deal destinations", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: /Open AtlasGrid Systems/}));
    await screen.findByRole("heading", {name: "AtlasGrid Systems"});
    const desktopNavigation = document.querySelector<HTMLElement>(".sidebar nav")!;
    expect(within(desktopNavigation).getAllByRole("button")).toHaveLength(dealViews.filter(view => view !== "diligence").length);
    for (const label of ["Brief", "Review", "Model", "Evidence", "Committee"]) {
      expect(within(desktopNavigation).getByRole("button", {name: label})).toBeInTheDocument();
    }
    expect(screen.getAllByText("REPRICE", {exact: true}).length).toBeGreaterThan(0);
    expect(screen.getByRole("table", {name: "Investment drivers"})).toBeInTheDocument();
    expect(window.location.hash).toBe("#/v3/atlasgrid/overview");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    await user.click(within(desktopNavigation).getByRole("button", {name: "Evidence"}));
    expect(screen.getByRole("table", {name: "Investment evidence matrix"})).toBeInTheDocument();
    expect(window.location.hash).toContain("#/v3/atlasgrid/documents");
  });

  it("shows a complete AtlasGrid exit equity bridge including cash", async () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/financials");
    render(<App />);
    const bridge = await screen.findByRole("group", {name: "Exit equity bridge"});
    expect(within(bridge).getByText("Exit enterprise value")).toBeInTheDocument();
    expect(within(bridge).getByText("$311.2M")).toBeInTheDocument();
    expect(within(bridge).getByText("− Debt")).toBeInTheDocument();
    expect(within(bridge).getByText("$16.4M")).toBeInTheDocument();
    expect(within(bridge).getByText("+ Exit cash")).toBeInTheDocument();
    expect(within(bridge).getByText("$3.9M")).toBeInTheDocument();
    expect(within(bridge).getByText("= Exit equity value")).toBeInTheDocument();
    expect(within(bridge).getByText("$298.7M")).toBeInTheDocument();
  });

  it("stays usable and tells the analyst when browser-local saving is unavailable", async () => {
    Object.defineProperty(window, "localStorage", {configurable: true, value: {
      getItem: () => null,
      setItem: () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    }});
    window.history.replaceState(null, "", "/#/v3/atlasgrid/overview");
    render(<App />);
    expect(await screen.findByText("In memory · local save unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "AtlasGrid Systems"})).toBeInTheDocument();
  });

  it("surfaces rejected saved state instead of silently resetting it", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("underwriting-desk.workspace.v2.atlasgrid", "{not-valid-json");
    window.history.replaceState(null, "", "/#/v3/atlasgrid/overview");
    render(<App />);
    expect(await screen.findByText(/Saved workspace failed validation and was not loaded/)).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "The saved workspace was not changed"})).toBeInTheDocument();
    expect(screen.getByText(/Unreadable JSON/)).toBeInTheDocument();
    expect(window.localStorage.getItem("underwriting-desk.workspace.v2.atlasgrid")).toBe("{not-valid-json");
    expect(screen.getByRole("heading", {name: "AtlasGrid Systems"})).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Start fresh"}));
    expect(window.localStorage.getItem("underwriting-desk.workspace.v2.atlasgrid")).toBeNull();
    expect(screen.queryByRole("heading", {name: "The saved workspace was not changed"})).not.toBeInTheDocument();
  });

  it("puts plain-language decision evidence before methods", async () => {
    window.history.replaceState(null, "", "/#/v3/helios/diligence");
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", {name: "Deal navigation"})).getByRole("button", {name: "Model"}));
    await user.click(screen.getByText("Assumptions and fund policy"));
    expect(screen.getByRole("heading", {name: "Optimizer test reduced unit compute cost"})).toBeInTheDocument();
    expect(screen.getByText(/8.7% less compute per workload/)).toBeInTheDocument();
    expect(screen.getByText("Population")).toBeInTheDocument();
    expect(screen.getByText("How it changes underwriting")).toBeInTheDocument();
    expect(screen.getByText("What it does not establish")).toBeInTheDocument();
    expect(screen.getByText("Method and uncertainty").closest("details")).not.toHaveAttribute("open");
    await user.click(screen.getByText("Method and uncertainty"));
    expect(screen.getByText(/6.1% to 11.2% lower unit compute cost/)).toBeInTheDocument();
    expect(screen.getByText(/0.0141 log points \(roughly 1.4%\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Inspect evidence and calculation"}));
    expect(screen.getByRole("dialog", {name: "Optimizer test effect"})).toBeInTheDocument();
  });

  it("keeps the Helios loss ceiling in policy rather than the assumption approval registry", async () => {
    window.history.replaceState(null, "", "/#/v3/helios/diligence");
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", {name: "Deal navigation"})).getByRole("button", {name: "Model"}));
    await user.click(screen.getByText("Assumptions and fund policy"));
    expect(screen.getByRole("heading", {name: "Material assumptions"})).toBeInTheDocument();
    expect(screen.getByText("Severe-loss probability assumption")).toBeInTheDocument();
    const registry = screen.getByRole("heading", {name: "Material assumptions"}).closest("section")!;
    expect(within(registry).queryByText("Maximum probability below 1.0x")).not.toBeInTheDocument();
    expect(screen.getByText("Maximum probability below 1.0x")).toBeInTheDocument();
  });

  it("explains Helios loss risk in investor language with a rail that tracks the working scenario", async () => {
    window.history.replaceState(null, "", "/#/v3/helios/financials");
    render(<App />);
    expect((await screen.findAllByText("Assumed severe-loss probability")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Maximum acceptable loss probability").length).toBeGreaterThan(0);
    expect(screen.getByText(/Point return is not enough while the severe-loss assumption breaches the selected ceiling/)).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "What must be true to avoid a capital-loss outcome?"})).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", {name: "Decision context"}));
    const rail = screen.getByRole("complementary", {name: "Decision status"});
    expect(within(rail).getByText("Canonical case")).toBeInTheDocument();
    expect(within(rail).getByText("Scenario consequence")).toBeInTheDocument();
    expect(screen.queryByText("Selected catastrophe prior")).not.toBeInTheDocument();
  });

  it("keeps catastrophe and generator jargon out of the Helios partner overview", async () => {
    window.history.replaceState(null, "", "/#/v3/helios/overview");
    render(<App />);
    expect(await screen.findByRole("heading", {name: "Helios Compute Control"})).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/catastrophe|generator check/i);
    expect(screen.getAllByText("Ordinary-cohort NRR").length).toBeGreaterThan(0);
  });

  it("makes diligence row actions explicit on the default desktop worklist", async () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/diligence");
    render(<App />);
    expect(await screen.findByRole("button", {name: "Validate cancellation rights"})).toBeInTheDocument();
    expect(screen.queryByRole("complementary", {name: "Decision status"})).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", {name: "Decision context"}));
    expect(screen.getByRole("complementary", {name: "Decision status"})).toBeInTheDocument();
  });

  it("opens the pricing-test lineage rather than an unrelated return metric", async () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/diligence");
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", {name: "Deal navigation"})).getByRole("button", {name: "Model"}));
    await user.click(screen.getByText("Assumptions and fund policy"));
    expect(screen.getByText(/6.7 percentage points lower renewal conversion/)).toBeInTheDocument();
    await user.click(screen.getByText("Method and uncertainty"));
    expect(screen.getByText(/2.5 to 10.9 percentage points lower renewal conversion/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Inspect evidence and calculation"}));
    expect(screen.getByRole("dialog", {name: "Renewal-pricing test effect"})).toBeInTheDocument();
  });

  it("fails closed with a readable boundary when retained analysis is incomplete", async () => {
    const candidate: unknown = structuredClone(rawData);
    assertWorkbenchData(candidate);
    const helios = structuredClone(candidate.cases.find((item) => item.caseId === "helios")!);
    helios.analyses = helios.analyses.filter((analysis) => analysis.analysis_id !== "HX-06");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<WorkbenchApp initialCase={helios} initialRoute={{caseId: "helios", view: "diligence"}} />);
    await user.click(within(screen.getByRole("navigation", {name: "Deal navigation"})).getByRole("button", {name: "Model"}));
    expect(screen.getByRole("heading", {name: "Analysis unavailable"})).toBeInTheDocument();
    expect(screen.getByText(/no analytical conclusion is shown/)).toBeInTheDocument();
    expect(screen.queryByText(/less compute per workload/)).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("derives empirical direction from the retained estimate sign", async () => {
    const candidate: unknown = structuredClone(rawData);
    assertWorkbenchData(candidate);
    const helios = structuredClone(candidate.cases.find((item) => item.caseId === "helios")!);
    const optimizer = helios.analyses.find((analysis) => analysis.analysis_id === "HX-06")!;
    optimizer.outputs.find((output) => output.name === "optimizer_ate")!.value = "0.0911";
    const user = userEvent.setup();
    render(<WorkbenchApp initialCase={helios} initialRoute={{caseId: "helios", view: "diligence"}} />);
    await user.click(within(screen.getByRole("navigation", {name: "Deal navigation"})).getByRole("button", {name: "Model"}));
    await user.click(screen.getByText("Assumptions and fund policy"));
    expect(screen.getByRole("heading", {name: "Optimizer test increased unit compute cost"})).toBeInTheDocument();
    expect(screen.getByText(/9.5% more compute per workload/)).toBeInTheDocument();
    expect(screen.getByText("Adverse signal")).toBeInTheDocument();
    expect(screen.getByText(/No base-case savings credit/)).toBeInTheDocument();
  });

  it("renders an honest neutral state for a zero empirical estimate", async () => {
    const candidate: unknown = structuredClone(rawData);
    assertWorkbenchData(candidate);
    const helios = structuredClone(candidate.cases.find((item) => item.caseId === "helios")!);
    const optimizer = helios.analyses.find((analysis) => analysis.analysis_id === "HX-06")!;
    optimizer.outputs.find((output) => output.name === "optimizer_ate")!.value = "0";
    const user = userEvent.setup();
    render(<WorkbenchApp initialCase={helios} initialRoute={{caseId: "helios", view: "diligence"}} />);
    await user.click(within(screen.getByRole("navigation", {name: "Deal navigation"})).getByRole("button", {name: "Model"}));
    await user.click(screen.getByText("Assumptions and fund policy"));
    expect(screen.getByRole("heading", {name: "Optimizer test did not change unit compute cost"})).toBeInTheDocument();
    expect(screen.getByText(/no measurable difference in compute per workload/)).toBeInTheDocument();
    expect(screen.getByText("No measured effect")).toBeInTheDocument();
  });

  it("keeps reproduction identifiers behind document disclosure", async () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/documents");
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", {name: "Source files"}));
    expect(screen.getByRole("heading", {name: "Sources and evidence"})).toBeInTheDocument();
    const search = screen.getByRole("searchbox", {name: "Search filenames and retained evidence"});
    await user.type(search, "customer");
    expect(screen.getAllByText(/Customer/i).length).toBeGreaterThan(0);
    for (const details of document.querySelectorAll(".technical-record")) expect(details).not.toHaveAttribute("open");
  });

  it("switches cases without changing the human approval boundary", async () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/overview");
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByRole("combobox", {name: "Deal"}), "helios");
    await waitFor(() => expect(screen.getByRole("heading", {name: "Helios Compute Control"})).toBeInTheDocument());
    expect(screen.getAllByText("HOLD", {exact: true}).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", {name: "Decision context"}));
    expect(screen.getByText("Maintain HOLD while the binding screen and open diligence remain unresolved.")).toBeInTheDocument();
    expect(screen.getByText("Path to reconsideration")).toBeInTheDocument();
    expect(screen.queryByText(/Working recommendation/)).not.toBeInTheDocument();
    expect(screen.getByRole("table", {name: "Investment drivers"})).toBeInTheDocument();
    expect(window.location.hash).toBe("#/v3/helios/overview");
  });

  it("fails closed when a retained deal payload cannot be opened", async () => {
    const candidate: unknown = rawData;
    assertWorkbenchData(candidate);
    const atlasgrid = candidate.cases.find((item) => item.caseId === "atlasgrid")!;
    const user = userEvent.setup();
    render(<WorkbenchApp initialCase={atlasgrid} initialRoute={{caseId: "atlasgrid", view: "overview"}} loadCaseFn={async () => {throw new Error("payload unavailable");}} />);
    await user.selectOptions(screen.getByRole("combobox", {name: "Deal"}), "helios");
    expect(await screen.findByRole("heading", {name: "Deal unavailable"})).toBeInTheDocument();
    expect(screen.getByText(/No data, assumption or decision was changed/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Return to Deals"}));
    expect(screen.getByRole("heading", {name: "Deals"})).toBeInTheDocument();
  });

  it("renders a committee-readable memo with source ownership", () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/memo");
    render(<App />);
    expect(screen.getByText("Investment committee working draft")).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Recommendation and rationale"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Downside and what must be true"})).toBeInTheDocument();
    expect(screen.getAllByText(/Calculated baseline/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/IC decision pending/).length).toBeGreaterThan(0);
  });

  it("records named human observations without mutating retained case data", async () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/overview");
    const user = userEvent.setup(); const before = JSON.stringify(rawData);
    render(<App />);
    await user.click(screen.getByText("Analyst observations"));
    await user.type(screen.getByRole("textbox", {name: "Author"}), "Avery Chen");
    await user.type(screen.getByRole("textbox", {name: "New observation"}), "Validate cancellation rights before crediting booked ARR.");
    await user.click(screen.getByRole("button", {name: "Add observation"}));
    expect(screen.getByText("Validate cancellation rights before crediting booked ARR.")).toBeInTheDocument();
    expect(screen.getByText(/analyst observation · Avery Chen/i)).toBeInTheDocument();
    expect(screen.getByText(/General investment thesis · private · unreviewed · context only/i)).toBeInTheDocument();
    expect(JSON.stringify(rawData)).toBe(before);
  });

  it("migrates legacy view names into the five-destination shell", () => {
    window.history.replaceState(null, "", "/#/v2/helios/methodology");
    expect(parseRoute()).toEqual({caseId: "helios", view: "diligence"});
    window.history.replaceState(null, "", "/#/v2/atlasgrid/underwriting");
    expect(parseRoute()).toEqual({caseId: "atlasgrid", view: "financials"});
  });
});
