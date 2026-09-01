import {useEffect, useRef, useState} from "react";
import type {CaseData, Metric, SourceLocator} from "./types";

const money = (cents: number) => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1}).format(cents / 100);
const readableLabel = (value: string) => ({json_values: "Matched source values", property: "Source field", event_id: "Financing event", holder_id: "Holder", new_money_cents: "New capital"}[value] ?? value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()));
function readableValue(value: unknown, key = ""): string {
  if (value === null || value === undefined) return "Not reported";
  if (typeof value === "number" && key.endsWith("_cents")) return money(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).replaceAll("_", " ");
  if (Array.isArray(value)) return value.map((item) => readableValue(item, key)).join(" · ");
  return Object.entries(value as Record<string, unknown>).map(([nestedKey, item]) => `${readableLabel(nestedKey)}: ${readableValue(item, nestedKey)}`).join(" · ");
}

function locatorSummary(locator: SourceLocator) {
  if (locator.locator_kind === "CSV_CELLS") return `${locator.period} · selected rows and cells`;
  if (locator.locator_kind === "JSON_POINTERS") return `${locator.period} · selected fields`;
  return `${locator.period} · retained text excerpt`;
}

export function LineageDrawer({caseData, metric, onClose}: {caseData: CaseData; metric: Metric; onClose: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [showCalculation, setShowCalculation] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
  }, []);
  const registered = metric.registry ?? caseData.metricRegistry.find((item) => item.metric_id === metric.metric_id);
  const formula = registered?.formula_id ? caseData.formulaRegistry.find((item) => item.formula_id === registered.formula_id) : undefined;
  const operands = formula?.operand_ids.map((id) => caseData.metricRegistry.find((item) => item.metric_id === id)).filter(Boolean) ?? [];
  const locators = registered?.source_locator_ids.map((id) => caseData.sourceLocators.find((item) => item.locator_id === id)).filter(Boolean) as SourceLocator[] ?? [];
  return <dialog ref={ref} className="lineage-drawer" aria-labelledby="lineage-title" onCancel={(event) => {event.preventDefault(); onClose();}}>
    <header><div><p className="eyebrow">Source trace</p><h2 id="lineage-title">{metric.label}</h2><strong>{metric.value}</strong></div><button type="button" onClick={onClose} aria-label="Close source trace">×</button></header>
    <section className="lineage-business"><h3>What this number means</h3><p>{metric.detail}</p><dl><div><dt>Period</dt><dd>{registered?.period ?? "Declared scenario"}</dd></div><div><dt>Evidence class</dt><dd>{(registered?.classification ?? metric.classification).toLowerCase().replaceAll("_", " ")}</dd></div><div><dt>Decision use</dt><dd>{registered?.downstream_ids.join(", ") || "Context only unless a declared decision test references it."}</dd></div></dl></section>
    <section><div className="drawer-section-heading"><h3>Supporting evidence</h3><span>{locators.length} source {locators.length === 1 ? "selection" : "selections"}</span></div>{locators.length ? <div className="evidence-excerpts">{locators.map((locator) => <article key={locator.locator_id}><div><strong>{locator.artifact_path.split("/").at(-1)}</strong><span>{locatorSummary(locator)}</span></div><dl>{Object.entries(locator.retained_excerpt).map(([key, value]) => <div key={key}><dt>{readableLabel(key)}</dt><dd>{readableValue(value, key)}</dd></div>)}</dl><a href={locator.published_path} target="_blank" rel="noreferrer">Open complete synthetic source</a></article>)}</div> : <p className="empty-copy">This displayed value has no granular source locator. Treat it as an assumption or contextual output.</p>}</section>
    <details onToggle={(event) => setShowCalculation(event.currentTarget.open)}><summary>Calculation and methodology{formula ? ` · ${operands.length.toLocaleString()} inputs` : ""}</summary>{showCalculation ? formula ? <div className="formula-block"><p><strong>{formula.operation.replaceAll("_", " ")}</strong> · all {operands.length.toLocaleString()} registered inputs are included below.</p><ol>{operands.map((operand) => <li key={operand!.metric_id}><span>{operand!.label}</span><strong>{operand!.display_value}</strong><small>{operand!.period}</small></li>)}</ol></div> : <p>Direct observation or declared assumption; no formula is registered.</p> : null}</details>
    <details className="technical-record"><summary>Audit detail</summary><dl>{registered ? <><div><dt>Metric</dt><dd><code>{registered.metric_id}</code></dd></div><div><dt>Raw value</dt><dd>{registered.value} {registered.unit}</dd></div><div><dt>Receipt</dt><dd><code>{registered.governing_receipt_sha256}</code></dd></div></> : null}</dl></details>
  </dialog>;
}
