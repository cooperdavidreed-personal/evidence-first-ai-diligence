import type {CaseData, PESensitivityCell} from "./types";
import type {DealWorkspaceState} from "./workspace-state";

export type ReviewBasisState = Pick<DealWorkspaceState, "scenarioValues"> & Partial<Pick<DealWorkspaceState, "changeControl">>;
export interface ReviewBasis {
  sourceVersion: string;
  scenarioKey: string;
  scenarioLabel: string;
  disposition: "BASELINE" | "PENDING" | "ACCEPTED" | "REJECTED" | "DEFERRED";
  posture: string;
  activeRevision: boolean;
  outputsAvailable: boolean;
  unavailableReason?: string;
  reconciliationBlockedReason?: string;
  snapshotId: string;
  revisionResult?: PESensitivityCell;
  results?: {grossReturn: number; grossMultiple: number; exitDebtCents?: number};
}
/** Single review projection; no baseline economic result is substituted for an unavailable revision scenario. */
export function selectReviewBasis(caseData: CaseData, state: ReviewBasisState): ReviewBasis {
  const pe = caseData.peEngine;
  const keys = pe ? ["ask", "selected", "downside"] : ["base", "milestone", "downside", "financing_shortfall"];
  const requested = state.scenarioValues[pe ? "peScenario" : "vcScenario"];
  const key = keys.includes(requested) ? requested : pe ? "selected" : "milestone";
  const labels: Record<string,string> = pe ? {ask:"Seller ask", selected:"Selected terms", downside:"Downside"} : {base:"Tranche withheld", milestone:"Milestone funded", downside:"Down round", financing_shortfall:"Financing shortfall"};
  const change = state.changeControl;
  const disposition = change ? change.dispositionEvents.at(-1)?.disposition ?? "PENDING" : "BASELINE";
  const activeRevision = Boolean(change && disposition !== "REJECTED");
  const base: ReviewBasis = {sourceVersion: activeRevision ? change!.toVersion : change?.fromVersion ?? "V1", scenarioKey:key, scenarioLabel:labels[key], disposition, posture:activeRevision ? "REOPEN DILIGENCE" : caseData.decision.decision, activeRevision, outputsAvailable:true, snapshotId:""};
  if (activeRevision) {
    const rerun = pe?.sensitivities.one_way.find(cell => cell.result_receipt_sha256 === change!.deterministicReceiptSha256);
    const unavailableReason = !pe || key !== "selected" ? `${base.sourceVersion} has no verified ${labels[key]} rerun. Select the revised selected terms; baseline scenarios remain historical evidence.` : !rerun ? "The revision has no verified deterministic rerun. Reconcile the source before continuing." : undefined;
    return {...base, outputsAvailable:!unavailableReason, unavailableReason, revisionResult:unavailableReason ? undefined : rerun,
      results: !unavailableReason && rerun ? {grossReturn:Number(rerun.gross_xirr),grossMultiple:Number(rerun.gross_moic),exitDebtCents:rerun.ending_debt_cents} : undefined,
      snapshotId:`pe:revision:${change!.changeSetId}:${disposition}:${key}:${change!.deterministicReceiptSha256}`,
      reconciliationBlockedReason:unavailableReason ?? (disposition !== "ACCEPTED" ? "A named reviewer must accept or reject the revision before the memo can be reconciled." : undefined)};
  }
  if (pe) {
    const result = pe[key as "ask"|"selected"|"downside"];
    return {...base, snapshotId:`pe:${key}:${result.receipt_sha256}`,results:{grossReturn:Number(result.gross_xirr),grossMultiple:Number(result.gross_moic),exitDebtCents:result.debt_schedule.ending_debt_cents}};
  }
  const engine = caseData.vcEngine!;
  const result = engine[key as "base"|"milestone"|"downside"|"financing_shortfall"];
  const risk = engine.risk_sensitivity.cells.find(cell => cell.cell_id === state.scenarioValues.vcRiskCell) ?? engine.risk_sensitivity.cells.find(cell => cell.cell_id === engine.risk_sensitivity.canonical_cell_id)!;
  const policy = engine.risk_sensitivity.policy_threshold_choices.includes(state.scenarioValues.vcLossPolicy) ? state.scenarioValues.vcLossPolicy : engine.risk_sensitivity.canonical_policy_threshold;
  return {...base,snapshotId:`vc:${key}:${result.receipt_sha256}:${risk.receipt_sha256}:${policy}`,results:{grossReturn:Number(result.gross_xirr),grossMultiple:Number(result.gross_moic)}};
}
