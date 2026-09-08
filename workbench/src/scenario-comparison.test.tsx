import {describe, expect, it} from "vitest";
import {comparisonDifference} from "./scenario-comparison";
describe("scenario differences", () => {
  it("reports rate differences in percentage points and money in dollars", () => {
    expect(comparisonDifference({label:"IRR", selected:.25, comparison:.2, unit:"percent"})).toBe("+5.0 pp");
    expect(comparisonDifference({label:"Debt", selected:100000000, comparison:200000000, unit:"money"})).toBe("−$1M");
    expect(comparisonDifference({label:"MOIC", selected:2.5, comparison:2.5, unit:"multiple"})).toBe("0.00x");
  });
});

import {render, screen, cleanup} from "@testing-library/react";
import {afterEach} from "vitest";
import raw from "./data/cases.json";
import {assertWorkbenchData} from "./data-contract";
import {FinancialWorkspace} from "./financial-workspace";
import {createWorkspace, type PackageChangeControlState} from "./workspace-state";
afterEach(cleanup);
it("does not show baseline schedules, scenario comparisons or derived charts beneath revision economics", () => {
 const data:unknown=raw;assertWorkbenchData(data);const pe=data.cases.find(c=>c.caseId==="atlasgrid")!;
 const rerun=pe.peEngine!.sensitivities.one_way.find(c=>c.axis==="full_cohort_nrr")!;
 const change={changeSetId:"test",fromVersion:"V1",toVersion:"V2",deterministicReceiptSha256:rerun.result_receipt_sha256,dispositionEvents:[]} as unknown as PackageChangeControlState;
 const state={...createWorkspace({caseId:"atlasgrid",issues:[],memoSections:[]}),changeControl:change};
 const props={caseData:pe,state,update:()=>{},openMetric:()=>{}};
 const view=render(<FinancialWorkspace {...props}/>);
 expect(screen.getByRole("region",{name:"Buyout decision screen"})).toHaveTextContent("Candidate evidence");
 expect(screen.queryByRole("navigation",{name:"Financial workspace sections"})).toBeNull();
 expect(screen.queryByText("Cash-generated deleveraging")).toBeNull();
 expect(screen.queryByText("Conditional return distribution")).toBeNull();
 view.rerender(<FinancialWorkspace {...props} state={{...state,scenarioValues:{peScenario:"ask"}}}/>);
 expect(screen.getByRole("alert")).toHaveTextContent("no verified Seller ask rerun");
 expect(screen.queryByRole("region",{name:"Buyout decision screen"})).toBeNull();
});
