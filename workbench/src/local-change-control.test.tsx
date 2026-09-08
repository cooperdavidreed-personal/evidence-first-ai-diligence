import {useState} from "react";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
import {LocalChangeControl} from "./local-change-control";
import {createWorkspace, type DealWorkspaceState, type PackageChangeControlState} from "./workspace-state";
import type {IntakeResult} from "./intake";
const mocks=vi.hoisted(()=>({process:vi.fn(),compare:vi.fn(),promote:vi.fn(),onPromote:vi.fn(),updates:vi.fn()}));
vi.mock("./supported-revision",()=>({compareSupportedRevision:mocks.compare}));
vi.mock("./intake",()=>({processDealPackage:mocks.process,promoteEvidenceVersion:mocks.promote}));
const digest="a".repeat(64);
const control:PackageChangeControlState={changeSetId:"change",fromVersion:"V1",toVersion:"V2",packageDigestSha256:digest,importedAt:new Date().toISOString(),sourcePath:"package",sourceLocator:"customer_arr.csv",changeId:"change",changeTitle:"Revision",beforeValue:"1",afterValue:"2",deterministicReceiptSha256:"b".repeat(64),decisionConsequence:"No screening-status change",affectedAssumptionIds:[],affectedIssueIds:[],affectedMemoSectionIds:[],impacts:[],dispositionEvents:[]};
const current={baselineApproval:{version:"V1"},deal:{analystOwner:"Avery Chen"},analysis:{policyProfile:{}}} as unknown as IntakeResult;
const candidate={files:[{name:"manifest.json",sha256:digest}]} as IntakeResult;
function Harness({prepared=true, history=false}:{prepared?:boolean; history?:boolean}){
 const [state,setState]=useState<DealWorkspaceState>({...createWorkspace({caseId:"test",issues:[],memoSections:[]}),changeControl:history?{...control,dispositionEvents:[{eventId:"prior-rejection",changeId:control.changeId,disposition:"REJECTED",actor:"Avery Chen",rationale:"Prior package rejection with clear reason.",recordedAt:new Date().toISOString()}]}:prepared?null:control});
 return <LocalChangeControl result={current} state={state} update={patch=>{mocks.updates(patch);setState(value=>({...value,...(typeof patch==="function"?patch(value):patch)}));}} onPromote={mocks.onPromote} candidateRevision={prepared?candidate:null}/>;
}
beforeEach(()=>{vi.clearAllMocks();mocks.compare.mockResolvedValue(control);mocks.promote.mockReturnValue({...candidate,baselineApproval:{version:"V2"}});});
async function reviewer(){fireEvent.change(screen.getByRole("textbox",{name:"Reviewer"}),{target:{value:"Avery Chen"}});fireEvent.change(screen.getByRole("textbox",{name:"Rationale"}),{target:{value:"Reviewed the supported input revision and its consequences."}});}
it("cannot record acceptance after a reload has lost candidate bytes",async()=>{
 render(<Harness prepared={false}/>);await reviewer();const button=screen.getByRole("button",{name:"Accept and promote"});expect(button).toBeDisabled();fireEvent.click(button);expect(mocks.updates).not.toHaveBeenCalled();expect(mocks.onPromote).not.toHaveBeenCalled();
});
it("does not record accepted state if promotion validation fails",async()=>{
 mocks.promote.mockImplementation(()=>{throw new Error("Baseline promotion failed");});render(<Harness/>);await screen.findByText(/V2 validated/);await reviewer();mocks.updates.mockClear();fireEvent.click(screen.getByRole("button",{name:"Accept and promote"}));await screen.findByText("Baseline promotion failed");expect(mocks.updates).not.toHaveBeenCalled();expect(mocks.onPromote).not.toHaveBeenCalled();
});
it("rejects a valid revision without promoting or leaving acceptance enabled",async()=>{
 render(<Harness/>);await screen.findByText(/V2 validated/);await reviewer();fireEvent.click(screen.getByRole("button",{name:"Reject change"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Accept and promote"})).toBeDisabled());expect(mocks.onPromote).not.toHaveBeenCalled();expect([...mocks.updates.mock.calls].reverse().find(call=>call[0].changeControl)?.[0].changeControl.dispositionEvents.at(-1).disposition).toBe("REJECTED");
});

it("preserves a prior rejection when identical candidate bytes are reconsidered",async()=>{
 render(<Harness history/>);await screen.findByText(/The prior rejection remains recorded/);await reviewer();fireEvent.click(screen.getByRole("button",{name:"Reject change"}));const recorded=[...mocks.updates.mock.calls].reverse().find(call=>call[0].changeControl)?.[0].changeControl.dispositionEvents;expect(recorded).toHaveLength(2);expect(recorded[0].eventId).toBe("prior-rejection");expect(recorded[1].disposition).toBe("REJECTED");
});
it("clears the file input after capturing files so the same package can be selected again",async()=>{
 mocks.process.mockResolvedValue(candidate);render(<Harness prepared={false}/>);const input=screen.getByTestId("local-revision-input") as HTMLInputElement;Object.defineProperty(input,"value",{writable:true,configurable:true,value:"C:\\fakepath\\manifest.json"});const file=new File(["{}"],"manifest.json");fireEvent.change(input,{target:{files:[file]}});expect(input.value).toBe("");await waitFor(()=>expect(mocks.process).toHaveBeenCalledWith([file],{}));
});

it("does not restage a manual import when the parent echoes its candidate prop",async()=>{
 mocks.process.mockResolvedValue(candidate);
 function EchoHarness(){
  const [prepared,setPrepared]=useState<IntakeResult|null>(null);
  const [state,setState]=useState<DealWorkspaceState>({...createWorkspace({caseId:"test",issues:[],memoSections:[]}),changeControl:{...control,dispositionEvents:[{eventId:"rejected",changeId:control.changeId,disposition:"REJECTED",actor:"Avery Chen",rationale:"Prior source rejection with sufficient reasoning.",recordedAt:new Date().toISOString()}]}});
  return <LocalChangeControl result={current} state={state} update={patch=>setState(value=>({...value,...(typeof patch==="function"?patch(value):patch)}))} onPromote={mocks.onPromote} candidateRevision={prepared} onCandidateStaged={setPrepared}/>;
 }
 render(<EchoHarness/>);fireEvent.change(screen.getByTestId("local-revision-input"),{target:{files:[new File(["{}"],"manifest.json")]}});
 await screen.findByText(/The prior rejection remains recorded/);await reviewer();fireEvent.click(screen.getByRole("button",{name:"Defer"}));
 await screen.findByText(/Deferred by Avery Chen/);
 await waitFor(()=>expect(mocks.compare).toHaveBeenCalledTimes(1));
 expect(screen.queryByText(/The prior rejection remains recorded/)).toBeNull();
});

it("allows the same external candidate to be resubmitted after a failed validation",async()=>{
 mocks.compare.mockRejectedValueOnce(new Error("Retryable validation failure"));
 const view=render(<Harness/>);await screen.findByText("Retryable validation failure");
 view.rerender(<Harness prepared={false}/>);view.rerender(<Harness/>);
 await screen.findByText(/V2 validated/);expect(mocks.compare).toHaveBeenCalledTimes(2);
});
