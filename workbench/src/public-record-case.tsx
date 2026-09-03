export const SNOWFLAKE_CUTOFF = "2020-09-14T23:59:59Z";

export interface PublicRecordSource {
  id: string; title: string; form: string; filedAt: string; url: string; state: "ADMITTED" | "EXCLUDED_POST_CUTOFF"; use: string;
}

export const SNOWFLAKE_SOURCES: PublicRecordSource[] = [
  {id: "snow-s1", title: "Initial registration statement", form: "S-1", filedAt: "2020-08-24T16:06:56Z", url: "https://www.sec.gov/Archives/edgar/data/1640147/000162828020013010/0001628280-20-013010-index.htm", state: "ADMITTED", use: "Audited financial statements, business model, risks and metric definitions."},
  {id: "snow-s1a", title: "Pre-IPO amendment", form: "S-1/A", filedAt: "2020-09-14T06:05:32Z", url: "https://www.sec.gov/Archives/edgar/data/1640147/000162828020013518/0001628280-20-013518-index.htm", state: "ADMITTED", use: "Latest available price range and operating disclosures at the cutoff."},
  {id: "snow-424b4", title: "Final prospectus", form: "424B4", filedAt: "2020-09-16T16:46:52Z", url: "https://www.sec.gov/Archives/edgar/data/1640147/000162828020013667/0001628280-20-013667-index.htm", state: "EXCLUDED_POST_CUTOFF", use: "Contains the final $120 offer price; prohibited hindsight for this case."},
  {id: "snow-10q", title: "First post-IPO quarterly report", form: "10-Q", filedAt: "2020-12-02T19:45:24Z", url: "https://www.sec.gov/Archives/edgar/data/1640147/000164014720000023/0001640147-20-000023-index.htm", state: "EXCLUDED_POST_CUTOFF", use: "Contains later operating results; prohibited hindsight for this case."},
];

export const SNOWFLAKE_FACTS = [
  {label: "Six-month product revenue", value: "$227.0M", comparison: "$100.6M prior year", classification: "Reported fact", sourceId: "snow-s1a"},
  {label: "Product revenue growth", value: "125.6%", comparison: "Derived: $227.0M ÷ $100.6M − 1", classification: "Derived calculation", sourceId: "snow-s1a"},
  {label: "Customers", value: "3,117", comparison: "1,547 one year earlier", classification: "Reported fact", sourceId: "snow-s1a"},
  {label: "Net revenue retention", value: "158%", comparison: "Company-defined capacity-contract cohort", classification: "Reported fact", sourceId: "snow-s1a"},
  {label: "Remaining performance obligations", value: "$688.2M", comparison: "$221.1M one year earlier", classification: "Reported fact", sourceId: "snow-s1a"},
  {label: "Indicative offer midpoint", value: "$105.00", comparison: "Range midpoint, not the final IPO price", classification: "Deal term", sourceId: "snow-s1a"},
];

export function validatePublicRecordCase(sources = SNOWFLAKE_SOURCES, cutoff = SNOWFLAKE_CUTOFF) {
  const cutoffMs = Date.parse(cutoff);
  if (!Number.isFinite(cutoffMs)) throw new Error("Public-record cutoff is invalid");
  for (const source of sources) {
    const eligible = Date.parse(source.filedAt) <= cutoffMs;
    if ((source.state === "ADMITTED") !== eligible) throw new Error(`Temporal classification mismatch: ${source.id}`);
  }
  const admitted = new Set(sources.filter((source) => source.state === "ADMITTED").map((source) => source.id));
  if (SNOWFLAKE_FACTS.some((fact) => !admitted.has(fact.sourceId))) throw new Error("A displayed fact depends on excluded evidence");
  return {state: "PASS" as const, admitted: admitted.size, excluded: sources.length - admitted.size};
}

function date(value: string) { return new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}).format(new Date(value)); }

export function PublicRecordCase({onDeals}: {onDeals: () => void}) {
  const receipt = validatePublicRecordCase();
  return <main className="public-record-page" id="main-content">
    <header className="public-record-header"><button type="button" onClick={onDeals}>← Deals</button><div><p className="eyebrow">Public-record retrospective</p><h1>Snowflake pre-IPO screen</h1><p>What could an investor support from the public record available by September 14, 2020—without using the final pricing or later performance?</p></div><aside><span>Analytical posture</span><strong>NO CALL</strong><p>Public record incomplete for a private-market underwriting decision</p></aside></header>
    <section className="cutoff-command"><div><span>Information cutoff</span><strong>September 14, 2020 · 11:59 PM UTC</strong><small>Publication time, not retrieval time, controls admission.</small></div><div><span>Temporal receipt</span><strong>{receipt.state}</strong><small>{receipt.admitted} filings admitted · {receipt.excluded} later filings excluded</small></div><div><span>Hindsight policy</span><strong>Fail closed</strong><small>Later price, results and outcomes cannot change this screen.</small></div></section>
    <div className="public-record-grid"><section className="panel"><div className="section-heading"><div><p className="eyebrow">Evidence available at cutoff</p><h2>Operating signal</h2></div><span>SEC filings only</span></div><div className="public-fact-table">{SNOWFLAKE_FACTS.map((fact) => <article key={fact.label}><div><strong>{fact.label}</strong><small>{fact.classification}</small></div><b>{fact.value}</b><p>{fact.comparison}</p><a href={SNOWFLAKE_SOURCES.find((source) => source.id === fact.sourceId)!.url} target="_blank" rel="noreferrer">Open source filing ↗</a></article>)}</div></section>
      <aside className="panel public-record-judgment"><p className="eyebrow">Decision meaning</p><h2>Exceptional growth; price discipline remains unproved</h2><p>The admitted record supports unusually strong consumption expansion, customer growth and contracted demand. It does not support a complete ownership, dilution, downside or return model at this cutoff.</p><h3>What must be true</h3><ul><li>Consumption expansion must remain durable as the base scales.</li><li>RPO must convert without masking demand timing or rollover risk.</li><li>Unit economics must improve enough to justify the indicative valuation.</li></ul><h3>Missing private evidence</h3><ul><li>Customer-level cohorts, gross retention and concentration.</li><li>Pipeline quality, cloud commitments and contract-level economics.</li><li>Board plan, cap-table detail and negotiated allocation.</li></ul><p className="public-record-boundary">This is a historical public-information screen, not sponsor diligence and not an investment recommendation.</p></aside></div>
    <section className="panel filing-ledger"><div className="section-heading"><div><p className="eyebrow">Temporal evidence ledger</p><h2>What entered the record—and what did not</h2></div><span>Direct SEC links</span></div>{SNOWFLAKE_SOURCES.map((source) => <article key={source.id} data-state={source.state}><span className={`status ${source.state === "ADMITTED" ? "status-ready" : "status-blocked"}`}>{source.state === "ADMITTED" ? "Admitted" : "Excluded"}</span><div><strong>{source.form} · {source.title}</strong><p>{source.use}</p></div><time>{date(source.filedAt)}</time><a href={source.url} target="_blank" rel="noreferrer">SEC filing ↗</a></article>)}</section>
    <footer>Real company · public filings only · historical cutoff enforced · later outcomes excluded · not investment advice</footer>
  </main>;
}
