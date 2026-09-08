import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {createCommitteeSnapshot} from "./committee-snapshot";
import {createWorkspace} from "./workspace-state";
import {digestTextSync} from "./model-workflow";
import {DiligenceWorklist, EditableMemo} from "./workspace-ui";
import type {ScenarioMemoSummary} from "./financial-workspace";
const summary: ScenarioMemoSummary = {state: "Canonical case", label: "Selected terms", returnLine: "2.1x", detail: "Synthetic scenario", snapshotId: "scenario-1", sectionBodies: {recommendation: "Review"}};
function workspace() {
  const state = createWorkspace({caseId: "test", issues: [
    {id: "critical", title: "Confirm retention", description: "Inspect source", owner: "Alice", priority: "CRITICAL", status: "OPEN", dueDate: null, decisionImpact: "May change entry price", evidenceRefs: [], resolution: null},
    {id: "resolved", title: "Confirm cash", description: "Bank evidence", owner: "Bob", priority: "LOW", status: "RESOLVED", dueDate: null, decisionImpact: "Funding", evidenceRefs: [], resolution: "Bank record reviewed"},
  ], memoSections: [{sectionId: "recommendation", title: "Recommendation", body: "Review", provenance: "ANALYST_JUDGMENT", updatedBy: "Alice", scenarioSnapshotId: summary.snapshotId}]});
  state.issues[1].resolvedBy = "Bob"; state.privateNote = "PRIVATE EXCLUDED"; return state;
}
afterEach(cleanup);
it("freezes a detached version-bound committee packet without private material", () => {
  const state = workspace(); const packet = createCommitteeSnapshot(state, summary, "Test", "Review");
  expect(packet.contents.workspaceRevision).toBe(state.revision); expect(packet.contents.scenarioSnapshotId).toBe(summary.snapshotId);
  expect(packet.contents.decisionStatus).toBe("IC_DECISION_PENDING"); expect(JSON.stringify(packet)).not.toContain("PRIVATE EXCLUDED");
  expect(packet.contentSha256).toBe(digestTextSync(JSON.stringify(packet.contents)));
  state.memoSections[0].body = "Changed later"; expect(JSON.stringify(packet)).not.toContain("Changed later");
  expect(Object.isFrozen(packet.contents.memoSections)).toBe(true);
});
it("rejects stale, empty, and blocked scenario memos", () => {
  const state = workspace();
  expect(() => createCommitteeSnapshot(state, {...summary, reconciliationBlockedReason: "Needs review"}, "Test", "Review")).toThrow("Needs review");
  expect(() => createCommitteeSnapshot(state, {...summary, snapshotId: "changed"}, "Test", "Review")).toThrow(/Reconcile/);
  expect(() => createCommitteeSnapshot({...state, memoSections: []}, summary, "Test", "Review")).toThrow(/required/);
});
it("disables all exports when the matching scenario still requires review", () => {
  render(<EditableMemo state={workspace()} update={vi.fn()} title="Test" subtitle="Review" scenarioSummary={{...summary, reconciliationBlockedReason: "Pending disposition"}} />);
  for (const name of ["Download IC memo", "Print or save PDF", "Download frozen committee packet"]) expect(screen.getByRole("button", {name})).toBeDisabled();
  expect(screen.queryByText("All memo sections are bound to Selected terms.")).toBeNull();
});
it("filters diligence fields and preserves named resolution requirements", () => {
  const update = vi.fn(); render(<DiligenceWorklist state={workspace()} update={update} />);
  fireEvent.change(screen.getByLabelText("Queue"), {target: {value: "blocking"}});
  expect(screen.getByRole("button", {name: "Confirm retention"})).toBeVisible(); expect(screen.queryByRole("button", {name: "Confirm cash"})).toBeNull();
  fireEvent.change(screen.getByLabelText("Search issues or owners"), {target: {value: "Bob"}});
  expect(screen.getByText("No issues match this queue and search.")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Queue"), {target: {value: "resolved"}}); expect(screen.getByRole("button", {name: "Confirm cash"})).toBeVisible();
  fireEvent.change(screen.getByLabelText("Search issues or owners"), {target: {value: ""}});
  fireEvent.change(screen.getByLabelText("Queue"), {target: {value: "unresolved"}});
  fireEvent.click(screen.getByRole("button", {name: "Confirm retention"}));
  const detail = document.querySelector(".issue-detail") as HTMLElement;
  expect(within(detail).getByRole("button", {name: "Resolve issue"})).toBeDisabled();
  fireEvent.change(within(detail).getByLabelText("Resolver"), {target: {value: "Alice"}});
  fireEvent.change(within(detail).getByLabelText("Resolution record"), {target: {value: "Reviewed signed schedule"}});
  fireEvent.click(within(detail).getByRole("button", {name: "Resolve issue"}));
  expect(update.mock.calls[0][0].issues[0]).toMatchObject({status: "RESOLVED", resolvedBy: "Alice", resolution: "Reviewed signed schedule"});
});
