import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it} from "vitest";
import WorkbenchApp, {dealViews, parseRoute} from "./App";
import rawData from "./data/cases.json";
import {assertWorkbenchData} from "./data-contract";

function App() {
  const candidate: unknown = rawData;
  assertWorkbenchData(candidate);
  const initialRoute = parseRoute();
  const initialCase = candidate.cases.find((item) => item.caseId === initialRoute.caseId)!;
  return <WorkbenchApp initialCase={initialCase} initialRoute={initialRoute} />;
}

describe("Underwriting Desk investor workspace", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  it("starts with a quiet deal list and supported intake boundary", () => {
    render(<App />);
    expect(screen.getByRole("heading", {name: "Deals"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "New deal"})).toBeInTheDocument();
    expect(screen.getAllByText("Illustrative data")).toHaveLength(2);
    expect(screen.getByRole("heading", {name: "Growth SaaS Quick Package"})).toBeInTheDocument();
    expect(screen.queryByText(/Evidence → economics → action/)).not.toBeInTheDocument();
  });

  it("opens a retained case with exactly five in-deal destinations", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole("button", {name: /Open deal/})[0]);
    await screen.findByRole("heading", {name: "AtlasGrid Systems"});
    const desktopNavigation = document.querySelector(".sidebar nav")!;
    expect(within(desktopNavigation).getAllByRole("button")).toHaveLength(dealViews.length);
    for (const label of ["Overview", "Financials", "Diligence", "Documents", "IC Memo"]) {
      expect(within(desktopNavigation).getByRole("button", {name: label})).toBeInTheDocument();
    }
    expect(screen.getAllByText("REPRICE", {exact: true})).toHaveLength(1);
    expect(screen.getByText("IC approval")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/v3/atlasgrid/overview");
  });

  it("puts plain-language decision evidence before methods", () => {
    window.history.replaceState(null, "", "/#/v3/helios/diligence");
    render(<App />);
    expect(screen.getByRole("heading", {name: "Optimizer test reduced unit compute cost"})).toBeInTheDocument();
    expect(screen.getByText(/8.7% less compute per workload/)).toBeInTheDocument();
    expect(screen.getByText("Population")).toBeInTheDocument();
    expect(screen.getByText("Decision use")).toBeInTheDocument();
    expect(screen.getByText("Limitation")).toBeInTheDocument();
    expect(screen.getByText("View method").closest("details")).not.toHaveAttribute("open");
  });

  it("keeps reproduction identifiers behind document disclosure", async () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/documents");
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("heading", {name: "Document register"})).toBeInTheDocument();
    const search = screen.getByRole("searchbox", {name: "Search documents"});
    await user.type(search, "customer");
    expect(screen.getAllByRole("heading", {level: 3}).some((heading) => heading.textContent?.match(/Customer/))).toBe(true);
    for (const details of document.querySelectorAll(".technical-record")) expect(details).not.toHaveAttribute("open");
  });

  it("switches cases without changing the human approval boundary", async () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/overview");
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByRole("combobox", {name: "Deal"}), "helios");
    await waitFor(() => expect(screen.getByRole("heading", {name: "Helios Compute Control"})).toBeInTheDocument());
    expect(screen.getAllByText("HOLD", {exact: true})).toHaveLength(1);
    expect(screen.getByText("Not requested")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/v3/helios/overview");
  });

  it("renders a committee-readable memo with source ownership", () => {
    window.history.replaceState(null, "", "/#/v3/atlasgrid/memo");
    render(<App />);
    expect(screen.getByText("Investment committee draft")).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Recommendation and why"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Conditions and path to reconsideration"})).toBeInTheDocument();
    expect(screen.getAllByText("Engine").length).toBeGreaterThan(0);
    expect(screen.getByText(/Requires investment committee approval/)).toBeInTheDocument();
  });

  it("migrates legacy view names into the five-destination shell", () => {
    window.history.replaceState(null, "", "/#/v2/helios/methodology");
    expect(parseRoute()).toEqual({caseId: "helios", view: "diligence"});
    window.history.replaceState(null, "", "/#/v2/atlasgrid/underwriting");
    expect(parseRoute()).toEqual({caseId: "atlasgrid", view: "financials"});
  });
});
