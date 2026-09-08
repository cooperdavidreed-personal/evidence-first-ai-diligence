import {digestTextSync} from "./model-workflow";
import type {ScenarioMemoSummary} from "./financial-workspace";
import type {DealWorkspaceState} from "./workspace-state";

export function committeeExportBlock(state: DealWorkspaceState, scenario: ScenarioMemoSummary): string | null {
  if (scenario.reconciliationBlockedReason) return scenario.reconciliationBlockedReason;
  if (!scenario.snapshotId || state.memoSections.length === 0) return "A scenario-bound memo is required before export.";
  if (state.memoSections.some(section => section.scenarioSnapshotId !== scenario.snapshotId)) return "Reconcile every memo section to the selected scenario before export.";
  return null;
}
function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {for (const child of Object.values(value)) freeze(child); Object.freeze(value);}
  return value;
}
/** A detached review record. Export never constitutes IC approval or changes live state. */
export function createCommitteeSnapshot(state: DealWorkspaceState, scenario: ScenarioMemoSummary, title: string, subtitle: string, createdAt = new Date().toISOString()) {
  const blocked = committeeExportBlock(state, scenario);
  if (blocked) throw new Error(blocked);
  const contents = JSON.parse(JSON.stringify({
    schemaVersion: "underwriting.committee-snapshot/v1", createdAt,
    caseId: state.caseId, workspaceRevision: state.revision, workspaceUpdatedAt: state.updatedAt,
    scenarioSnapshotId: scenario.snapshotId, title, subtitle,
    decisionStatus: "IC_DECISION_PENDING", disclosure: "Synthetic demonstration. Not investment advice. Export does not record committee approval.",
    scenario, scenarioValues: state.scenarioValues, memoSections: state.memoSections,
    diligence: state.issues, assumptionReviews: state.assumptionReviews, policyOverrides: state.policyOverrides,
    packageChangeControl: state.changeControl,
    referencedProposals: state.proposals.filter(proposal => state.memoSections.some(section => section.sourceProposalId === proposal.proposalId)).map(proposal => ({proposalId: proposal.proposalId, state: proposal.state, origin: proposal.origin})),
  })) as Record<string, unknown>;
  return freeze({contents, contentSha256: digestTextSync(JSON.stringify(contents)), integrityNote: "Content checksum detects changes; it is not a signature or verified human identity."});
}
