import {render, screen, fireEvent} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProposalReviewDetail} from "./proposal-review-detail";
import type {ModelProposal, SelectedEvidence} from "./model-workflow";
import {ChangeControlWorkspace} from "./change-control-workspace";
import {createWorkspace, type PackageChangeControlState} from "./workspace-state";
import type {CaseData} from "./types";
const evidence: SelectedEvidence[] = [{id: "retention", title: "Net retention", displayValue: "98%", summary: "Complete cohort including cancellations"}];
const proposal: ModelProposal = {proposalId: "test", kind: "MEMO_DRAFT", state: "PROPOSED", title: "Retention risk", body: "The renewal case needs testing.", evidenceRefs: ["retention"], dealId: "atlasgrid", origin: "LOCAL_MCP_REVIEW", requestEvidence: evidence, requestDigestSha256: "a".repeat(64)};
it("puts citations and original versus edited language beside human disposition without automatic memo insertion", () => {
  const decide = vi.fn();
  render(<ProposalReviewDetail proposal={proposal} evidence={evidence} referenceLabels={{}} draft="The renewal case needs named customer diligence." onDraft={() => {}} reviewer="Avery" onDecide={decide} memoUses={[]} />);
  expect(screen.getByRole("region", {name: "Supporting evidence"})).toHaveTextContent("98%");
  expect(screen.getByText("Original model draft")).toBeVisible();
  expect(screen.getByText("Not inserted in a memo section.", {exact: false})).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Accept proposal"}));
  expect(decide).toHaveBeenCalledWith("ACCEPTED");
});
it("shows sent and current evidence, blocks stale acceptance, and preserves rejection", () => {
  render(<ProposalReviewDetail proposal={proposal} evidence={[{...evidence[0], displayValue: "94%"}]} referenceLabels={{}} draft={proposal.body} onDraft={() => {}} reviewer="Avery" onDecide={() => {}} />);
  expect(screen.getByText("Sent to reviewer: 98%")).toBeVisible();
  expect(screen.getByRole("button", {name: "Accept proposal"})).toBeDisabled();
  expect(screen.getByRole("button", {name: /^Reject$/})).toBeEnabled();
});
it("does not present unsupported references as evidence or allow acceptance", () => {
  render(<ProposalReviewDetail proposal={{...proposal, origin: "PORTABLE_IMPORT_UNVERIFIED", evidenceRefs: ["missing"]}} evidence={evidence} referenceLabels={{}} draft={proposal.body} onDraft={() => {}} reviewer="Avery" onDecide={() => {}} />);
  expect(screen.getByText("Supporting reference unavailable")).toBeVisible();
  expect(screen.getByRole("button", {name: "Accept proposal"})).toBeDisabled();
});
it("reports only exact linked memo use with a stale marker", () => {
  render(<ProposalReviewDetail proposal={{...proposal, state: "ACCEPTED", humanActor: "Avery"}} evidence={evidence} referenceLabels={{}} draft={proposal.body} onDraft={() => {}} reviewer="Avery" onDecide={() => {}} memoUses={[{sectionId: "memo-1", title: "Commercial downside", sourceProposalId: "test", scenarioSnapshotId: "stale:v2"}, {sectionId: "other", title: "Unrelated memo", sourceProposalId: "other"}]} />);
  expect(screen.getByText(/Commercial downside · marked stale/)).toBeVisible();
  expect(screen.queryByText(/Unrelated memo/)).not.toBeInTheDocument();
});
it("shows actual downstream statuses and records disposition without clearing work", () => {
  const control: PackageChangeControlState = {changeSetId: "set", fromVersion: "V1", toVersion: "V2", packageDigestSha256: "a".repeat(64), importedAt: "2026-09-07T00:00:00Z", sourcePath: "data/customer_month.csv", sourceLocator: "cancellations", changeId: "change", changeTitle: "Retention revised", beforeValue: "99%", afterValue: "98%", deterministicReceiptSha256: "b".repeat(64), decisionConsequence: "Reopen diligence", affectedAssumptionIds: ["entry-value"], affectedIssueIds: ["issue"], affectedMemoSectionIds: ["memo"], impacts: [{impactId: "irr", label: "Annualized return", before: "23.3%", after: "18.4%", consequence: "Below declared screen", rank: 1}], dispositionEvents: []};
  const state = {...createWorkspace({caseId: "atlasgrid", issues: [], memoSections: []}), changeControl: control};
  const update = vi.fn();
  render(<ChangeControlWorkspace caseData={{caseId: "atlasgrid", peEngine: {}} as CaseData} state={state} update={update} />);
  expect(screen.getByRole("table", {name: "Evidence change and deterministic financial consequences"})).toHaveTextContent("18.4%");
  expect(screen.getByText("Diligence record unavailable")).toBeVisible();
  fireEvent.change(screen.getByPlaceholderText("Named human reviewer"), {target: {value: "Avery"}});
  fireEvent.change(screen.getByPlaceholderText(/Why should the revised evidence/), {target: {value: "Accept evidence and investigate cancellations."}});
  fireEvent.click(screen.getByRole("button", {name: "Accept change"}));
  expect(Object.keys(update.mock.calls[0][0])).toEqual(["changeControl"]);
  expect(update.mock.calls[0][0].changeControl.dispositionEvents[0].actor).toBe("Avery");
});
