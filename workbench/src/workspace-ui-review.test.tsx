import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {DiligenceWorklist, EditableMemo} from "./workspace-ui";
import {createWorkspace} from "./workspace-state";
import type {ScenarioMemoSummary} from "./financial-workspace";
afterEach(cleanup);
const summary: ScenarioMemoSummary = {state:"Canonical case",label:"Selected",returnLine:"2.1x",detail:"Test",snapshotId:"current",sectionBodies:{recommendation:"Reprice"}};
const options=[{id:"ref-1",label:"Retention schedule"}];
function state(){return createWorkspace({caseId:"test",issues:[{id:"issue-1",title:"Validate retention",description:"Review retention",owner:"Avery",priority:"HIGH",status:"OPEN",dueDate:null,decisionImpact:"Price may change",evidenceRefs:["ref-1"],resolution:null}],memoSections:[{sectionId:"recommendation",title:"Recommendation",body:"Reprice",provenance:"ANALYST_JUDGMENT",updatedBy:"Avery",scenarioSnapshotId:"current"}]});}
it("opens supplied issue deep link and resolves with citations without changing canonical refs",()=>{
 const update=vi.fn(),inspect=vi.fn();render(<DiligenceWorklist state={state()} update={update} evidenceOptions={options} selectedIssueId="issue-1" onInspectEvidence={inspect}/>);
 fireEvent.click(screen.getByRole("button",{name:"Retention schedule"}));expect(inspect).toHaveBeenCalledWith("ref-1");
 const detail=within(document.querySelector(".issue-detail") as HTMLElement);
 fireEvent.change(detail.getByLabelText("Resolver"),{target:{value:"Avery"}});fireEvent.change(detail.getByLabelText("Resolution record"),{target:{value:"Reviewed schedule"}});
 const select=detail.getByLabelText("Resolution evidence") as HTMLSelectElement;select.options[0].selected=true;fireEvent.change(select);
 fireEvent.click(detail.getByRole("button",{name:"Resolve issue"}));expect(update.mock.calls[0][0].issues[0]).toMatchObject({evidenceRefs:["ref-1"],resolution:"Reviewed schedule\n\nResolution evidence: [ref-1] Retention schedule",resolvedBy:"Avery"});
});
it("records evidence on newly created diligence issues",()=>{
 const update=vi.fn();render(<DiligenceWorklist state={state()} update={update} evidenceOptions={options}/>);fireEvent.click(screen.getByRole("button",{name:"New issue"}));
 const form=within(document.querySelector(".issue-create-form") as HTMLElement);fireEvent.change(form.getByLabelText("Issue"),{target:{value:"New question"}});fireEvent.change(form.getByLabelText("Owner"),{target:{value:"Avery"}});fireEvent.change(form.getByLabelText("Decision impact"),{target:{value:"Price"}});
 const select=form.getByLabelText("Issue evidence") as HTMLSelectElement;select.options[0].selected=true;fireEvent.change(select);fireEvent.click(form.getByRole("button",{name:"Create issue"}));expect(update.mock.calls[0][0].issues[1].evidenceRefs).toEqual(["ref-1"]);
});
it("defaults to readable preview and preserves named editor and stale export gates",()=>{
 render(<EditableMemo state={state()} update={vi.fn()} title="Test" subtitle="Review" scenarioSummary={{...summary,snapshotId:"revised"}}/>);
 expect(screen.queryByRole("textbox",{name:"Recommendation memo section"})).toBeNull();expect(screen.getByRole("button",{name:"Download IC memo"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"Edit memo"}));expect(screen.getByRole("textbox",{name:"Recommendation memo section"})).toBeDisabled();fireEvent.change(screen.getByLabelText("Editor"),{target:{value:"Avery"}});expect(screen.getByRole("textbox",{name:"Recommendation memo section"})).toBeEnabled();expect(screen.getByRole("button",{name:"Download IC memo"})).toBeDisabled();
});
