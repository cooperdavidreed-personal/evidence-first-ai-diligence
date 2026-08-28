# CoreWeave Claim-to-IC case plan

Status: `PLANNED — SOURCE PACK NOT YET FROZEN`  
Date: 2026-08-28  
Scope: public information only; no confidential company, customer, or deal data

## Decision question

Can a public-data diligence workflow reconcile CoreWeave's management-defined
revenue backlog with SEC-accounting RPO, then place that reconciliation beside
customer concentration, capital intensity, losses, and financing obligations
without converting citation checks into an investment conclusion?

The flagship tension is not a presumed contradiction. CoreWeave's FY2025
earnings release reports $66.8 billion of revenue backlog and defines that
measure as RPO plus other estimated future revenue under committed contracts,
subject to delivery and service availability. The FY2025 Form 10-K reports
$60.7 billion of RPO. The initial case label is
`DEFINITION_RECONCILIATION_REQUIRED`. Cooper owns any eventual investment
implication and final adjudication.

## Public primary-source pack

| Source | Intended role | SEC anchor | Treatment before use |
|---|---|---|---|
| FY2025 earnings release | Management claim and non-GAAP/operating-definition evidence | [SEC-hosted exhibit](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000094/coreweave4q25earningspress.htm), accession `0001769628-26-000094` | Record the parent Form 8-K, Item and exhibit; preserve the filed-versus-furnished status rather than calling the exhibit "filed" by default. |
| FY2025 Form 10-K | Primary accounting, risk, concentration, capital and financing evidence | [Form 10-K](https://www.sec.gov/Archives/edgar/data/1769628/000176962826000104/crwv-20251231.htm), accession `0001769628-26-000104` | Treat as a filed SEC report; retain exact sections, tables and footnotes. |
| IPO Form S-1/A | Historical definitions, business model and risk context only | [Form S-1/A](https://www.sec.gov/Archives/edgar/data/1769628/000119312525058309/d899798ds1a.htm), accession `0001193125-25-058309` | Treat as a filed registration-statement amendment and do not use it as later-period evidence. |

Before any case or evaluation run, save the exact retrieved bytes, verify the
SEC submission metadata, record `published_at`, timezone-aware `retrieved_at`,
accession number and effective period where applicable, compute SHA-256, and
create exact UTF-8 byte locators for every retained span. That freeze and its
rights/redistribution review are `NOT RUN`.

For this case, material facts and calculations require Tier A evidence. Tier A
means the issuer's SEC submission or an exhibit attached to it; the record must
still distinguish a filed report from a furnished exhibit. Secondary reporting
may help discover a question but cannot satisfy a high-materiality claim.

## Twenty-claim ledger to build

These are candidates, not completed labels. Every amount, wording, period and
definition must be tied to a frozen byte span before it can become
`LOCAL_CITATION_BYTES_MATCH`.

| ID | Candidate | Kind | Required treatment |
|---|---|---|---|
| CW-01 | Revenue backlog was $66.8B at 2025-12-31. | fact | Exact release table/text span. |
| CW-02 | Management described backlog as providing visibility into 2026 and beyond. | fact | Preserve management attribution; do not restate as certainty. |
| CW-03 | The release's backlog definition includes RPO. | fact | Exact definition footnote. |
| CW-04 | The backlog definition also includes other amounts estimated to become revenue under committed contracts. | fact | Exact definition footnote. |
| CW-05 | Backlog conversion is subject to delivery. | fact | Exact qualifier; do not omit it from the displayed claim. |
| CW-06 | Backlog conversion is subject to service availability. | fact | Exact qualifier; do not omit it from the displayed claim. |
| CW-07 | RPO was $60.7B at 2025-12-31. | fact | Exact 10-K span and accounting context. |
| CW-08 | The numerical difference between the two reported amounts is $6.1B. | derived | Decimal subtraction with both cited operands. |
| CW-09 | The two figures use non-identical definitions; their difference alone does not establish contradiction. | judgment | Human adjudication required; show both definitions. |
| CW-10 | Customer A represented 67% of 2025 revenue. | fact | Exact 10-K concentration span. |
| CW-11 | Customer concentration is material to backlog-quality analysis. | judgment | Cooper-authored rationale; no autonomous investment label. |
| CW-12 | Cash paid for property and equipment was $10.3B in 2025. | fact | Exact cash-flow/supplemental disclosure span and period. |
| CW-13 | That cash outlay is relevant to capital-intensity analysis. | judgment | Human rationale; distinguish cash paid from accounting additions. |
| CW-14 | 2025 net loss was approximately $1.2B (reported table amount to be retained exactly). | fact | Use the exact table value and unit; approximation only in prose. |
| CW-15 | 2025 net interest expense was $1.229B. | fact | Exact line item, period and unit. |
| CW-16 | Total indebtedness was $21.6B at 2025-12-31. | fact | Exact definition and balance-date span. |
| CW-17 | Recorded operating-lease liabilities were $8.2B at 2025-12-31. | fact | Exact definition and balance-date span. |
| CW-18 | Indebtedness plus recorded operating-lease liabilities is $29.8B. | derived | Decimal addition; label the components separately and do not rename the sum "debt." |
| CW-19 | Reported revenue backlog is not equivalent to revenue already recognized. | judgment | Reconcile the release definition with accounting disclosures; human label. |
| CW-20 | Conversion, concentration, capital and financing risks must be assessed together before an IC conclusion. | judgment | Cooper-authored synthesis with counterthesis and open questions. |

## Outputs and stop conditions

The case should produce a claim ledger, definition-reconciliation view,
calculation receipts, counterevidence ledger, open questions, and a
Cooper-authored thesis/counterthesis. Each claim must expose three separate
axes: deterministic citation status, semantic assessment, and human
adjudication. Until authorized model work exists, semantic assessment remains
`NOT_RUN`; until Cooper decides, adjudication remains `PENDING_HUMAN`.

Stop or narrow the case if exact public spans cannot support a material
reconciliation, if the interface becomes a generic filing chatbot, or if the
filed/furnished and period distinctions cannot be represented faithfully.

## Disclosures

This is an independent educational/research project using public information.
It is not affiliated with, endorsed by, or commissioned by CoreWeave or the
SEC; it is not investment advice. Before any external presentation, Cooper must
add a dated position disclosure covering whether he or related entities hold,
plan to trade, or have another financial interest in CoreWeave securities. An
unknown position must be shown as `POSITION DISCLOSURE PENDING`, never inferred.
