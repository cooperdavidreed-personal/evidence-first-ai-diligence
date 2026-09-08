import {describe, it, expect} from "vitest";
import raw from "./data/cases.json";
import {assertWorkbenchData} from "./data-contract";
import {createWorkspace, type PackageChangeControlState} from "./workspace-state";
import {selectReviewBasis} from "./review-basis";
import {scenarioMemoSummary} from "./financial-workspace";
import {committeeExportBlock} from "./committee-snapshot";
const data: unknown = raw; assertWorkbenchData(data);
const pe = data.cases.find(c => c.caseId === "atlasgrid")!;
const rerun = pe.peEngine!.sensitivities.one_way.find(c => c.axis === "full_cohort_nrr" && Math.abs(Number(c.assumption_value)-.98)<.000001)!;
function state(disposition?: "ACCEPTED"|"REJECTED"|"DEFERRED", scenario = "selected") {
 const change: PackageChangeControlState = {changeSetId:"test",fromVersion:"V1",toVersion:"V2",packageDigestSha256:"a".repeat(64),importedAt:"2026-09-08T00:00:00Z",sourcePath:"data/customer_month.csv",sourceLocator:"test",changeId:"test",changeTitle:"Retention revised",beforeValue:"99.87%",afterValue:"98%",deterministicReceiptSha256:rerun.result_receipt_sha256,decisionConsequence:"Reopen diligence",affectedAssumptionIds:[],affectedIssueIds:[],affectedMemoSectionIds:[],impacts:[],dispositionEvents:disposition ? [{eventId:"event",changeId:"test",disposition,actor:"Avery",rationale:"Reviewed source revision",recordedAt:"2026-09-08T01:00:00Z"}] : []};
 return {...createWorkspace({caseId:"atlasgrid",issues:[],memoSections:[]}),scenarioValues:{peScenario:scenario},changeControl:change};
}
describe("one source and scenario basis", () => {
 it("pending and deferred evidence expose only candidate results and block memo export", () => {
  for (const disposition of [undefined,"DEFERRED"] as const) {const s=state(disposition); const b=selectReviewBasis(pe,s);const m=scenarioMemoSummary(pe,s); expect(b.results?.grossReturn).toBe(Number(rerun.gross_xirr));expect(b.snapshotId).toBe(m.snapshotId);expect(m.reconciliationBlockedReason).toMatch(/accept or reject/);expect(committeeExportBlock(s,m)).toBe(m.reconciliationBlockedReason);}
 });
 it("accepted selected terms share exact economic values and memo identity", () => {const s=state("ACCEPTED"); const b=selectReviewBasis(pe,s); const m=scenarioMemoSummary(pe,s);expect(b.disposition).toBe("ACCEPTED");expect(b.results?.grossReturn).toBe(Number(rerun.gross_xirr));expect(b.snapshotId).toBe(m.snapshotId);expect(m.reconciliationBlockedReason).toBeUndefined();});
 it.each(["ask","downside"])("never substitutes baseline %s economics for a revision", scenario => {for(const disposition of [undefined,"ACCEPTED"] as const){const s=state(disposition,scenario);const b=selectReviewBasis(pe,s);const m=scenarioMemoSummary(pe,s);expect(b.outputsAvailable).toBe(false);expect(b.results).toBeUndefined();expect(m.sectionBodies).toEqual({});expect(m.reconciliationBlockedReason).toMatch(/no verified/);expect(b.snapshotId).toBe(m.snapshotId);}});
 it("rejection restores scenario-specific baseline and identity", () => {const s=state("REJECTED","ask");const b=selectReviewBasis(pe,s);expect(b.activeRevision).toBe(false);expect(b.sourceVersion).toBe("V1");expect(b.results?.grossReturn).toBe(Number(pe.peEngine!.ask.gross_xirr));expect(b.snapshotId).toBe(scenarioMemoSummary(pe,s).snapshotId);});
 it("fails closed when the revision receipt has no matching rerun",()=>{const s=state("ACCEPTED");s.changeControl.deterministicReceiptSha256="missing";expect(selectReviewBasis(pe,s).results).toBeUndefined();expect(scenarioMemoSummary(pe,s).reconciliationBlockedReason).toMatch(/no verified/);});
 it("keeps VC scenario risk and policy memo identity aligned",()=>{const vc=data.cases.find(c=>c.caseId==="helios")!;const s={scenarioValues:{vcScenario:"downside"}};expect(selectReviewBasis(vc,s).snapshotId).toBe(scenarioMemoSummary(vc,s).snapshotId);});
});
