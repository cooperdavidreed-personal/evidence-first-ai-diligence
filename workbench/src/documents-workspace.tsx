import {useMemo, useState} from "react";
import type {CaseData, Metric, SourceLocator} from "./types";
import {formatHumanDate} from "./workspace-ui";

type OpenMetric = (metric: Metric, trigger: HTMLElement) => void;

const friendly = (value: string) => value.split("/").at(-1)?.replace(/\.[^.]+$/, "").replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? value;
const financeLabel = (value: string) => friendly(value).replaceAll(" Xirr", " IRR").replaceAll(" Moic", " MOIC").replaceAll(" Nrr", " NRR").replaceAll(" Result", "").replace(/ Delta(?: Cents)?\b/g, " impact").replace(/ Cents\b/g, "");
const readable = (value: unknown): string => {
  if (value === null || value === undefined) return "Not reported";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).replaceAll("_", " ");
  if (Array.isArray(value)) return value.map(readable).join(" · ");
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${friendly(key)}: ${readable(item)}`).join(" · ");
};
const cleanMetricDisplay = (value: string) => value.replace(/^(-?\d+(?:\.\d+)?) percent$/, "$1%").replace(/^(-?\d+(?:\.\d+)?) multiple$/, "$1x");
const sourceClass = (path: string) => {
  const name = path.toLowerCase();
  if (/cim\.md|memorandum\.md|forecast\.csv|pipeline\.csv|financing_plan\.json/.test(name)) return "Management representation";
  if (/market_assumptions\.json|venture_scenarios\.json|risk_policy\.json/.test(name)) return "Analyst assumption";
  if (/team_diligence\.json/.test(name)) return "Human observation";
  return "Synthetic source record";
};
const cellValue = (key: string, value: unknown) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatHumanDate(value);
  if (key.endsWith("_id") && typeof value === "string" && /^(?:AG|HX)-[A-Z]\d+$/.test(value)) {
    const [, kind, number] = value.match(/^(?:AG|HX)-([A-Z])(\d+)$/) ?? [];
    return `${kind === "P" ? "Parent" : kind === "C" ? "Customer" : "Entity"} ${number}`;
  }
  if (key.endsWith("_cents") && Number.isFinite(Number(value))) return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0}).format(Number(value) / 100);
  if (["true", "1"].includes(String(value).toLowerCase())) return "Yes";
  if (["false", "0"].includes(String(value).toLowerCase())) return "No";
  return readable(value);
};

function EvidenceExcerpt({locator}: {locator: SourceLocator}) {
  const excerpt = locator.retained_excerpt as Record<string, unknown>;
  if (excerpt.kind === "CSV_ROWS" && Array.isArray(excerpt.rows)) {
    const rows = excerpt.rows.filter((row): row is {data_row: number; cells: Record<string, unknown>} => Boolean(row) && typeof row === "object" && !Array.isArray(row) && "cells" in row && Boolean((row as {cells?: unknown}).cells));
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row.cells)))];
    return <div className="source-row-table" tabIndex={0} aria-label="Exact source rows"><table><caption>{rows.length} exact retained rows</caption><thead><tr><th>Source row</th>{columns.map((column) => <th key={column}>{friendly(column)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.data_row}><th data-label="Source row">{row.data_row.toLocaleString()}</th>{columns.map((column) => <td key={column} data-label={friendly(column)}>{cellValue(column, row.cells[column])}</td>)}</tr>)}</tbody></table></div>;
  }
  if (excerpt.kind === "JSON_VALUES" && recordValues(excerpt.values)) {
    return <dl className="source-value-list">{Object.entries(excerpt.values).map(([key, value]) => <div key={key}><dt>{friendly(key.replace(/^\//, ""))}</dt><dd>{Array.isArray(value) ? value.map((item, index) => <span key={index}>{recordValues(item) ? Object.entries(item).map(([field, fieldValue]) => `${friendly(field)}: ${cellValue(field, fieldValue)}`).join(" · ") : readable(item)}</span>) : cellValue(key, value)}</dd></div>)}</dl>;
  }
  return <dl className="source-value-list">{Object.entries(excerpt).map(([key, value]) => <div key={key}><dt>{friendly(key)}</dt><dd>{cellValue(key, value)}</dd></div>)}</dl>;
}

function recordValues(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function metricFrom(caseData: CaseData, metricId: string): Metric | null {
  const registry = caseData.metricRegistry.find((item) => item.metric_id === metricId);
  if (!registry) return null;
  return {metric_id: metricId, label: registry.label, value: registry.display_value, detail: `Evidence and calculation trace for ${registry.period}.`, classification: registry.classification, lineage: registry.source_locator_ids, registry};
}

export function DocumentsWorkspace({caseData, openMetric}: {caseData: CaseData; openMetric: OpenMetric}) {
  const [query, setQuery] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState(caseData.artifacts[0]?.artifact_id ?? "");
  const records = useMemo(() => caseData.artifacts.map((artifact) => {
    const locators = caseData.sourceLocators.filter((item) => item.artifact_id === artifact.artifact_id);
    const searchText = [artifact.path, artifact.schema, ...locators.flatMap((item) => [item.period, JSON.stringify(item.retained_excerpt)])].join(" ").toLowerCase();
    return {...artifact, locators, searchText, sourceClass: sourceClass(artifact.path)};
  }), [caseData]);
  const filtered = records.filter((item) => item.searchText.includes(query.trim().toLowerCase()));
  const selected = filtered.find((item) => item.artifact_id === selectedArtifact) ?? filtered[0];
  const linkedMetrics = selected ? caseData.metricRegistry.filter((metric) => metric.source_locator_ids.some((id) => selected.locators.some((locator) => locator.locator_id === id))).slice(0, 12) : [];
  const previewLocators = selected ? [...new Map(selected.locators.map((locator) => [locator.excerpt_sha256, locator])).values()] : [];
  return <div className="documents-workspace">
    <section className="document-register" aria-labelledby="document-register-heading"><div className="section-heading"><div><p className="eyebrow">Deal package</p><h2 id="document-register-heading">Sources and evidence</h2></div><span>{caseData.artifacts.length} recognized</span></div><label className="search-field"><span>Search filenames and retained evidence</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers, financing, retention…" /></label><div className="source-taxonomy"><span>Synthetic source record</span><span>Management representation</span><span>Analyst assumption</span><span>Human observation</span><span>Model proposal</span></div><div className="source-list">{filtered.map((artifact) => <button key={artifact.artifact_id} type="button" aria-pressed={selected?.artifact_id === artifact.artifact_id} className={selected?.artifact_id === artifact.artifact_id ? "active" : ""} onClick={() => setSelectedArtifact(artifact.artifact_id)}><span><strong>{friendly(artifact.path)}</strong><small>{artifact.rows.toLocaleString()} rows · {artifact.locators.length} evidence selections</small></span><em>{artifact.sourceClass}</em></button>)}</div>{!filtered.length ? <p className="empty-copy">No retained source or excerpt matches that search.</p> : null}</section>
    <section className="document-preview" aria-live="polite">{selected ? <><header><div><p className="eyebrow">Evidence preview</p><h2>{friendly(selected.path)}</h2><p>{selected.sourceClass} · {selected.path.split("/").at(-1)}</p></div><a href={`source-pack/${caseData.caseId}/${selected.path}`} target="_blank" rel="noreferrer">Open complete synthetic source</a></header><div className="preview-summary"><div><span>Source type</span><strong>{selected.sourceClass}</strong></div><div><span>Source rows</span><strong>{selected.rows.toLocaleString()}</strong></div><div><span>Linked calculations</span><strong>{linkedMetrics.length}</strong></div></div><div className="excerpt-list">{previewLocators.length ? previewLocators.map((locator: SourceLocator) => <article key={locator.locator_id}><div className="excerpt-heading"><span>{formatHumanDate(locator.period)}</span><small>{locator.locator_kind === "CSV_CELLS" ? "Exact rows and cells" : locator.locator_kind === "JSON_POINTERS" ? "Exact selected fields" : "Exact text excerpt"}</small></div><EvidenceExcerpt locator={locator} /></article>) : <p className="empty-copy">The complete source is available above. No granular excerpt is registered because this file does not support a displayed calculation in the current view.</p>}</div>{linkedMetrics.length ? <aside className="linked-calculations"><h3>Calculations using this source</h3>{linkedMetrics.map((registry) => {const metric = metricFrom(caseData, registry.metric_id)!; return <button key={registry.metric_id} type="button" onClick={(event) => openMetric(metric, event.currentTarget)}><span>{financeLabel(registry.label)}</span><strong>{cleanMetricDisplay(registry.display_value)}</strong><small>Trace calculation</small></button>;})}</aside> : null}<details className="technical-record"><summary>Reproduction detail</summary><dl><div><dt>Source digest</dt><dd><code>{selected.sha256}</code></dd></div><div><dt>Artifact id</dt><dd><code>{selected.artifact_id}</code></dd></div><div><dt>Case analysis</dt><dd><code>{caseData.analysis_sha256}</code></dd></div></dl></details></> : <p>No retained source or excerpt matches the current search.</p>}</section>
  </div>;
}
