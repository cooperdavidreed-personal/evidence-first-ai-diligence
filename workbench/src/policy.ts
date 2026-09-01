export type PolicyStatus = "DRAFT" | "APPROVED" | "RETIRED";
export type GateState = "CLEARS" | "CONCERN" | "BLOCKED" | "UNREVIEWED";

export interface PolicyThreshold {
  thresholdId: string;
  label: string;
  metric: "gross_moic" | "annualized_return" | "runway_months" | "ordinary_nrr" | "gross_margin" | "probability_below_one";
  operator: ">=" | "<=";
  value: number;
  displayValue: string;
  owner: string;
  ownerRole: string;
  source: string;
  status: PolicyStatus;
  lastReviewed: string | null;
  rationale: string;
}

export interface PolicyProfile {
  schemaVersion: "underwriting.policy-profile/v1";
  profileId: string;
  name: string;
  strategy: "GROWTH_EQUITY" | "BUYOUT";
  owner: string;
  ownerRole: string;
  source: string;
  status: PolicyStatus;
  lastReviewed: string | null;
  thresholds: PolicyThreshold[];
  requiredGates: Array<
    "retention_nrr" |
    "gross_margin_quality" |
    "burn_runway_quality" |
    "customer_concentration" |
    "cohort_completeness" |
    "financing_ownership" |
    "data_sufficiency" |
    "assumption_provenance"
  >;
}

const owner = "Illustrative Growth Investment Committee";
const source = "DESK_DEFAULT_UNREVIEWED";

export const GROWTH_SCREEN_POLICY: PolicyProfile = {
  schemaVersion: "underwriting.policy-profile/v1",
  profileId: "growth-screen-public-demo-v1",
  name: "Growth equity screening profile",
  strategy: "GROWTH_EQUITY",
  owner,
  ownerRole: "Policy owner",
  source,
  status: "DRAFT",
  lastReviewed: null,
  thresholds: [
    {thresholdId: "growth-moic", label: "Minimum gross multiple", metric: "gross_moic", operator: ">=", value: 3, displayValue: "3.00x", owner, ownerRole: "Policy owner", source, status: "DRAFT", lastReviewed: null, rationale: "Illustrative five-year growth-equity screen."},
    {thresholdId: "growth-return", label: "Minimum annualized gross return", metric: "annualized_return", operator: ">=", value: 0.25, displayValue: "25.0%", owner, ownerRole: "Policy owner", source, status: "DRAFT", lastReviewed: null, rationale: "Illustrative five-year growth-equity screen."},
    {thresholdId: "growth-runway", label: "Minimum runway", metric: "runway_months", operator: ">=", value: 18, displayValue: "18.0 months", owner, ownerRole: "Policy owner", source, status: "DRAFT", lastReviewed: null, rationale: "Screen for near-term financing fragility."},
    {thresholdId: "growth-nrr", label: "Minimum ordinary-cohort NRR", metric: "ordinary_nrr", operator: ">=", value: 0.95, displayValue: "95.0%", owner, ownerRole: "Policy owner", source, status: "DRAFT", lastReviewed: null, rationale: "A sub-95% ordinary-cohort result requires explicit retention diligence and policy-owner disposition."},
    {thresholdId: "growth-margin", label: "Minimum reported gross margin", metric: "gross_margin", operator: ">=", value: 0.7, displayValue: "70.0%", owner, ownerRole: "Policy owner", source, status: "DRAFT", lastReviewed: null, rationale: "Numeric screen only; cost classification and service burden still require quality review."},
  ],
  requiredGates: ["retention_nrr", "gross_margin_quality", "burn_runway_quality", "customer_concentration", "cohort_completeness", "financing_ownership", "data_sufficiency", "assumption_provenance"],
};

export const HELIOS_SCREEN_POLICY: PolicyProfile = {
  ...GROWTH_SCREEN_POLICY,
  profileId: "helios-growth-screen-public-demo-v1",
  name: "Helios growth investment screening profile",
  owner: "Illustrative Growth Investment Committee",
  ownerRole: "Policy owner",
  source: "Desk-owned public demonstration policy — separate from the retained synthetic data room",
  status: "DRAFT",
  lastReviewed: null,
  thresholds: [
    ...GROWTH_SCREEN_POLICY.thresholds.filter((item) => item.metric !== "gross_moic" && item.metric !== "annualized_return"),
    {thresholdId: "helios-moic", label: "Minimum gross multiple", metric: "gross_moic", operator: ">=", value: 3, displayValue: "3.00x", owner, ownerRole: "Policy owner", source: "Desk-owned public demonstration policy — separate from the retained synthetic data room", status: "DRAFT", lastReviewed: null, rationale: "Illustrative growth-equity point-return screen."},
    {thresholdId: "helios-return", label: "Minimum annualized gross return", metric: "annualized_return", operator: ">=", value: 0.25, displayValue: "25.0%", owner, ownerRole: "Policy owner", source: "Desk-owned public demonstration policy — separate from the retained synthetic data room", status: "DRAFT", lastReviewed: null, rationale: "Illustrative growth-equity point-return screen."},
    {thresholdId: "helios-loss", label: "Maximum probability below 1.0x", metric: "probability_below_one", operator: "<=", value: 0.1, displayValue: "10.0% maximum", owner, ownerRole: "Policy owner", source: "Desk-owned public demonstration policy — separate from the retained synthetic data room", status: "DRAFT", lastReviewed: null, rationale: "Illustrative loss-frequency screen. The retained data-room value is treated as an analyst representation, not the policy source."},
  ],
};

export const ATLAS_SCREEN_POLICY: PolicyProfile = {
  ...GROWTH_SCREEN_POLICY,
  profileId: "atlas-buyout-screen-public-demo-v1",
  name: "AtlasGrid buyout screening profile",
  strategy: "BUYOUT",
  owner: "Illustrative Buyout Investment Committee",
  thresholds: [
    {thresholdId: "atlas-selected-irr", label: "Selected-case minimum gross return", metric: "annualized_return", operator: ">=", value: 0.22, displayValue: "22.0%", owner: "Illustrative Buyout Investment Committee", ownerRole: "Policy owner", source, status: "DRAFT", lastReviewed: null, rationale: "Illustrative five-year buyout screen for selected terms."},
    {thresholdId: "atlas-selected-moic", label: "Selected-case minimum gross multiple", metric: "gross_moic", operator: ">=", value: 2, displayValue: "2.00x", owner: "Illustrative Buyout Investment Committee", ownerRole: "Policy owner", source, status: "DRAFT", lastReviewed: null, rationale: "Illustrative five-year buyout screen for selected terms."},
    {thresholdId: "atlas-downside-irr", label: "Downside annualized return floor", metric: "annualized_return", operator: ">=", value: 0.05, displayValue: "5.0%", owner: "Illustrative Buyout Investment Committee", ownerRole: "Policy owner", source, status: "DRAFT", lastReviewed: null, rationale: "Illustrative nominal downside-return floor."},
    {thresholdId: "atlas-downside-moic", label: "Downside gross multiple floor", metric: "gross_moic", operator: ">=", value: 1.25, displayValue: "1.25x", owner: "Illustrative Buyout Investment Committee", ownerRole: "Policy owner", source, status: "DRAFT", lastReviewed: null, rationale: "Illustrative downside capital-preservation floor."},
  ],
};

export function policyThreshold(profile: PolicyProfile, metric: PolicyThreshold["metric"]) {
  const threshold = profile.thresholds.find((item) => item.metric === metric);
  if (!threshold) throw new Error(`Policy profile is missing ${metric}`);
  return threshold;
}

export function assertRegisteredPolicyProfile(profile: PolicyProfile) {
  const registered = [GROWTH_SCREEN_POLICY, HELIOS_SCREEN_POLICY, ATLAS_SCREEN_POLICY].find((candidate) => candidate.profileId === profile.profileId);
  if (!registered || JSON.stringify(registered) !== JSON.stringify(profile)) throw new Error("Policy profile is not admitted by the Desk registry");
  return registered;
}
