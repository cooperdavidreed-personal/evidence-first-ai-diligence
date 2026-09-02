export interface CanonicalEvidenceItem {
  id: string;
  title: string;
  displayValue: string;
  summary: string;
}

// This compact server-side registry is intentionally independent from the
// browser request. Tests bind it to the retained case payloads and the public
// Northstar sample package so an uploaded request cannot grade or describe
// itself to the hosted reviewer.
export const HOSTED_EVIDENCE_REGISTRY: Record<string, readonly CanonicalEvidenceItem[]> = {
  atlasgrid: [
    {id: "ag-return", title: "Repriced return", displayValue: "23.3%", summary: "2.8x MOIC · five-year hold 5 linked source records; scenario."},
    {id: "ag-nrr-metric", title: "Complete-cohort NRR", displayValue: "99.9%", summary: "Management active-only view: 105.5% 1 linked source record; descriptive."},
    {id: "ag-conc-metric", title: "Top-10 parent concentration", displayValue: "20.4%", summary: "Entity view: 3.4% 2 linked source records; descriptive."},
    {id: "ag-margin-metric", title: "Fully burdened gross margin", displayValue: "72.8%", summary: "Reported view: 80.5% 2 linked source records; accounting identity."},
    {id: "ag-ebitda-metric", title: "Normalized LTM EBITDA", displayValue: "$25.9M", summary: "Seller-adjusted: $34.9M 2 linked source records; accounting identity."},
  ],
  helios: [
    {id: "hx-ownership", title: "Fully funded ownership", displayValue: "20.0%", summary: "$25M close + $15M contingent on $160M pre-money 2 linked source records; accounting identity."},
    {id: "hx-nrr-metric", title: "Ordinary-cohort NRR", displayValue: "117.1%", summary: "Pooled with design partners: 135.4% 2 linked source records; descriptive."},
    {id: "hx-margin-metric", title: "Blended gross margin", displayValue: "70.6%", summary: "LTM, including telemetry and support 2 linked source records; accounting identity."},
    {id: "hx-runway-metric", title: "Runway", displayValue: "17.3 mo", summary: "Burn multiple: 0.8x 3 linked source records; accounting identity."},
    {id: "hx-tam-metric", title: "Modeled serviceable spend", displayValue: "$20.9B", summary: "90% tier intervals; tier 5 abstained 2 linked source records; predictive association."},
  ],
  "local-northstar-metrics-00a75b14db10": [
    {id: "ltm-revenue", title: "LTM revenue", displayValue: "$15.9M", summary: "Revenue recognized across the latest twelve eligible monthly rows."},
    {id: "gross-margin", title: "Gross margin", displayValue: "70.0%", summary: "Revenue remaining after declared cost of revenue."},
    {id: "ordinary-nrr", title: "Ordinary-cohort NRR", displayValue: "83.6%", summary: "ARR retained from customers present in 2025-07, measured at 2026-06."},
    {id: "runway", title: "Recent runway", displayValue: "19.1 mo", summary: "Cash divided by average signed net burn over the latest three months."},
    {id: "ownership", title: "Post-money ownership", displayValue: "33.3%", summary: "New investment divided by declared pre-money value plus new investment."},
    {id: "gross-moic", title: "Gross multiple", displayValue: "3.23x", summary: "Illustrative exit equity proceeds divided by the proposed investment."},
    {id: "annualized-return", title: "Annualized gross return", displayValue: "26.5%", summary: "Annualized return across the declared 5-year scenario."},
  ],
};

export function assertCanonicalEvidenceSubset(dealId: string, evidence: CanonicalEvidenceItem[]) {
  const registered = HOSTED_EVIDENCE_REGISTRY[dealId];
  if (!registered) throw new Error("Invalid hosted synthetic deal");
  const byId = new Map(registered.map((item) => [item.id, item]));
  for (const selected of evidence) {
    const canonical = byId.get(selected.id);
    if (!canonical || JSON.stringify(selected) !== JSON.stringify(canonical)) {
      throw new Error("Selected evidence does not match the server registry");
    }
  }
}
