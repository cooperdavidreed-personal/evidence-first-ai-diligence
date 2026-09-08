import {EditableMemo} from "./workspace-ui";
import type {ScenarioMemoSummary} from "./financial-workspace";
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {digestChallengePayloadSync, digestTextSync, runEvidenceChallenge} from "./model-workflow";
import {localProposalIsCurrent} from "./local-review";
import {createWorkspace, createWorkspaceIntegrityContract, validateWorkspace} from "./workspace-state";
import {ProposalReviewDetail} from "./proposal-review-detail";
const evidence=[{id:"metric",title:"Retention",displayValue:"99%",summary:"Canonical source"}];
const basis="a".repeat(64);
async function proposal(){const result=await runEvidenceChallenge("test",evidence,async request=>({deal_id:request.deal_id,request_digest_sha256:request.request_digest_sha256,model_family:"test",challenges:[{claim:"Retention review",management_question:"Confirm cohort",severity:"HIGH",evidence_refs:["metric"]}],gaps:[],memo_drafts:[]}),basis);return result.proposals[0];}
afterEach(cleanup);
it("binds scenario identity in request digest while retaining exact canonical evidence",async()=>{
 const item=await proposal();expect(item.requestEvidence).toEqual(evidence);expect(item.reviewBasisId).toBe(basis);
 expect(item.requestDigestSha256).toBe(digestChallengePayloadSync("test",evidence,basis));expect(item.requestDigestSha256).not.toBe(digestChallengePayloadSync("test",evidence));
 expect(localProposalIsCurrent(item,evidence,basis)).toBe(true);expect(localProposalIsCurrent(item,evidence,"b".repeat(64))).toBe(false);expect(localProposalIsCurrent({...item,reviewBasisId:undefined},evidence,basis)).toBe(false);
});
it("preserves exact trusted historical evidence and rejects untrusted edits or altered basis receipts",async()=>{
 const item=await proposal();const seed={caseId:"test",issues:[],memoSections:[],canonicalEvidence:[{...evidence[0],displayValue:"95%"}],canonicalEvidenceHistory:[evidence]};
 const state={...createWorkspace(seed),proposals:[item]};const contract=createWorkspaceIntegrityContract(seed);
 expect(validateWorkspace(state,"test",undefined,undefined,contract).proposals[0].reviewBasisId).toBe(basis);
 expect(()=>validateWorkspace({...state,proposals:[{...item,reviewBasisId:"b".repeat(64)}]},"test",undefined,undefined,contract)).toThrow(/digest/);
 expect(()=>validateWorkspace({...state,proposals:[{...item,requestEvidence:[{...evidence[0],summary:"fabricated"}]}]},"test",undefined,undefined,contract)).toThrow(/canonical registry/);
});
it("visibly blocks basis-stale acceptance while keeping human rejection available",async()=>{
 const item=await proposal();render(<ProposalReviewDetail proposal={item} evidence={evidence} reviewBasisId={"b".repeat(64)} referenceLabels={{}} draft={item.body} onDraft={vi.fn()} reviewer="Avery" onDecide={vi.fn()}/>);
 expect(screen.getByRole("button",{name:"Accept proposal"})).toBeDisabled();expect(screen.getByRole("button",{name:"Reject"})).toBeEnabled();expect(screen.getByText("Evidence or review basis changed")).toBeVisible();
});

it("keeps historical acceptance visible but blocks insertion into a differently bound memo",async()=>{
 const item=await proposal();const summary:ScenarioMemoSummary={state:"Canonical case",label:"Current",returnLine:"2x",detail:"Test",snapshotId:"current-scenario",sectionBodies:{}};
 const accepted={...item,state:"ACCEPTED" as const,humanActor:"Avery",reviewedAt:new Date().toISOString()};const state={...createWorkspace({caseId:"test",issues:[],memoSections:[]}),proposals:[accepted]};
 const {rerender}=render(<EditableMemo state={state} update={vi.fn()} title="Test" subtitle="Review" scenarioSummary={summary}/>);
 fireEvent.change(screen.getByRole("textbox",{name:"Editor"}),{target:{value:"Avery"}});
 expect(screen.getByRole("button",{name:"Add with provenance"})).toBeDisabled();expect(screen.getByText(/Earlier acceptance retained/)).toBeVisible();
 rerender(<EditableMemo state={{...state,proposals:[{...accepted,reviewBasisId:digestTextSync(summary.snapshotId)}]}} update={vi.fn()} title="Test" subtitle="Review" scenarioSummary={summary}/>);
 expect(screen.getByRole("button",{name:"Add with provenance"})).toBeEnabled();
});
