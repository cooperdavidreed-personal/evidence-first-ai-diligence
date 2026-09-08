import { useEffect, useState } from 'react';
import { compareWorkbookCells } from './workbook-diff';
import { inspectWorkbook, listWorkbookReviews, mappedFinancials, saveWorkbookReview, suggestMappings, workbookCommitteeNote, type FinancialMapping, type WorkbookReview } from './workbook-intake';
import './workbook-first.css';
type Inspection = Awaited<ReturnType<typeof inspectWorkbook>>;
function download(name: string, bytes: BlobPart) { const url = URL.createObjectURL(new Blob([bytes])); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function WorkbookFirstIntake() {
    const [saved, setSaved] = useState<WorkbookReview[]>([]), [active, setActive] = useState<WorkbookReview | null>(null), [candidate, setCandidate] = useState<Inspection | null>(null), [sheet, setSheet] = useState(''), [mappings, setMappings] = useState<FinancialMapping[]>([]), [name, setName] = useState(''), [scale, setScale] = useState(1), [currency, setCurrency] = useState('USD'), [cadence, setCadence] = useState('Monthly'), [reviewer, setReviewer] = useState(''), [rationale, setRationale] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [tab, setTab] = useState('Operating review');
    useEffect(() => { listWorkbookReviews().then(setSaved).catch(() => setError('Browser storage is unavailable.')); }, []);
    function open(r: WorkbookReview) { setActive(r); setCandidate(null); setName(r.name); setScale(r.scale); setCurrency(r.currency); setCadence(r.cadence); setReviewer(r.reviewer); setRationale(''); setError(''); }
    async function select(file?: File) { if (!file)
        return; setBusy(true); setError(''); try {
        const next = await inspectWorkbook(file);
        if (next.digest === active?.digest)
            throw Error('This is already the approved workbook.');
        const s = active && next.sheets.has(active.sheet) ? active.sheet : [...next.sheets.keys()][0];
        if (!s)
            throw Error('No worksheets found.');
        setCandidate(next);
        setSheet(s);
        setMappings(active && s === active.sheet ? active.mappings : suggestMappings(next.sheets.get(s)!));
        if (!active)
            setName(file.name.replace(/\.xlsx$/i, ''));
        setRationale('');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function decide(outcome: 'Accepted' | 'Rejected') { if (!candidate)
        return; setBusy(true); setError(''); try {
        if (!reviewer.trim() || !rationale.trim() || !name.trim())
            throw Error('Enter a review name, reviewer and decision rationale.');
        const at = new Date().toISOString();
        let next: WorkbookReview;
        if (outcome === 'Rejected') {
            if (!active)
                return;
            next = { ...active, history: [...active.history, { digest: candidate.digest, filename: candidate.filename, bytes: candidate.bytes, reviewer, rationale, at, outcome }] };
        }
        else {
            mappedFinancials(candidate.bytes, sheet, mappings, scale);
            next = { id: active?.id ?? crypto.randomUUID(), name: name.trim(), filename: candidate.filename, bytes: candidate.bytes, digest: candidate.digest, sheet, currency, scale, cadence, mappings, reviewer, rationale, approvedAt: at, version: (active?.version ?? 0) + 1, history: active ? [...active.history, { digest: active.digest, filename: active.filename, bytes: active.bytes, reviewer: active.reviewer, rationale: active.rationale, at: active.approvedAt, outcome: 'Accepted' }] : [] };
        }
        await saveWorkbookReview(next);
        setSaved(await listWorkbookReviews());
        open(next);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    const cells = candidate?.sheets.get(sheet), numeric = [...(cells ?? [])].filter(([, c]) => c.type === 'number'), diff = active && candidate ? compareWorkbookCells(active.bytes, candidate.bytes) : null;
    let rows: ReturnType<typeof mappedFinancials> = [], readError = '';
    if (active)
        try {
            rows = mappedFinancials(active.bytes, active.sheet, active.mappings, active.scale);
        }
        catch (e) {
            readError = (e as Error).message;
        }
    const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: active?.currency ?? currency, maximumFractionDigits: 0 }).format(v);
    return <section className="workbook-start panel" aria-label="Workbook-first review"><header className="section-heading"><div><p className="eyebrow">Start with what you have</p><h2>{active ? active.name : 'Open an Excel operating model'}</h2><p>{active ? `Operating review · Version ${active.version} · ${active.reviewer}` : 'Keep the original filename. Confirm the financial cells and units; add the rest of your diligence later.'}</p></div>{active && <button onClick={() => { setActive(null); setCandidate(null); setError(''); }}>New workbook review</button>}</header>
    {!active && saved.length > 0 && <div className="workbook-saved"><h3>Saved workbook reviews</h3>{saved.map(r => <button key={r.id} onClick={() => open(r)}>{r.name} · Version {r.version}</button>)}</div>}
    <label className="workbook-upload">{active ? 'Compare a revised workbook' : 'Choose an .xlsx workbook'}<input aria-label={active ? 'Revised operating workbook' : 'Operating workbook'} type="file" accept=".xlsx" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void select(f); }}/></label><p className="workbook-boundary">Public or synthetic data only. Saved in this browser, including original workbook bytes. No model connection required. Excel formulas are not recalculated.</p>{error && <p role="alert">{error}</p>}{busy && <p role="status">Processing workbook…</p>}
        {candidate && <div><h3>{active ? 'Review the proposed revision' : 'Confirm the financial mapping'}</h3><p>{candidate.filename} · {candidate.sheets.size} worksheets. Confirm dates, actual versus forecast periods, units and accounting definitions in Excel.</p>{diff && <details open><summary>{diff.changes.length} changed cells · {diff.addedSheets.length} sheets added · {diff.removedSheets.length} removed</summary><p>{diff.detail}</p><div className="workbook-scroll"><table><thead><tr><th>Cell</th><th>Approved</th><th>Proposed</th></tr></thead><tbody>{diff.changes.slice(0, 100).map(c => <tr key={c.sheet + c.address}><td>{c.sheet}!{c.address}<small>{c.kind.replaceAll('_', ' ')}</small></td><td>{c.before?.formula && `=${c.before.formula} → `}{c.before?.value ?? '—'}</td><td>{c.after?.formula && `=${c.after.formula} → `}{c.after?.value ?? '—'}</td></tr>)}</tbody></table></div><p>First 100 changes shown.</p><button onClick={() => download('workbook-comparison.json', JSON.stringify(diff, null, 2))}>Download full comparison</button></details>}
        <div className="workbook-fields"><label>Review name<input value={name} onChange={e => setName(e.target.value)}/></label><label>Worksheet<select aria-label="Worksheet" value={sheet} onChange={e => { setSheet(e.target.value); setMappings(suggestMappings(candidate.sheets.get(e.target.value)!)); }}>{[...candidate.sheets.keys()].map(s => <option key={s}>{s}</option>)}</select></label><label>Currency<select aria-label="Currency" value={currency} onChange={e => setCurrency(e.target.value)}>{['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}</select></label><label>Workbook units<select aria-label="Workbook units" value={scale} onChange={e => setScale(Number(e.target.value))}><option value={1}>Ones</option><option value={1000}>Thousands</option><option value={1000000}>Millions</option></select></label><label>Period basis<select aria-label="Period basis" value={cadence} onChange={e => setCadence(e.target.value)}>{['Monthly', 'Quarterly', 'Annual', 'Mixed / non-comparable'].map(c => <option key={c}>{c}</option>)}</select></label></div>
        <div className="workbook-scroll"><table><thead><tr><th>Period / actual or forecast</th><th>Revenue cell</th><th>EBITDA cell (optional)</th><th /></tr></thead><tbody>{mappings.map((m, i) => <tr key={i}><td><input aria-label={`Period ${i + 1}`} placeholder="FY2025 actual" value={m.period} onChange={e => setMappings(mappings.map((r, j) => i === j ? { ...r, period: e.target.value } : r))}/></td>{(['revenue', 'earnings'] as const).map(field => <td key={field}><select aria-label={`${field} cell ${i + 1}`} value={m[field]} onChange={e => setMappings(mappings.map((r, j) => i === j ? { ...r, [field]: e.target.value } : r))}><option value="">{field === 'earnings' ? 'Unavailable' : 'Choose a cell'}</option>{numeric.map(([a, c]) => <option key={a} value={a}>{a} · {c.value}{c.formula ? ' · stored formula result' : ''}</option>)}</select></td>)}<td><button aria-label={`Remove period ${i + 1}`} onClick={() => setMappings(mappings.filter((_, j) => j !== i))}>Remove</button></td></tr>)}</tbody></table></div><button disabled={mappings.length >= 36} onClick={() => setMappings([...mappings, { period: '', revenue: '', earnings: '' }])}>Add period</button>
        <details><summary>Inspect worksheet cells ({cells?.size})</summary><div className="workbook-scroll"><table><thead><tr><th>Cell</th><th>Stored value</th><th>Formula</th></tr></thead><tbody>{[...(cells ?? [])].slice(0, 500).map(([a, c]) => <tr key={a}><td>{sheet}!{a}</td><td>{c.value}</td><td>{c.formula ? `=${c.formula}` : '—'}</td></tr>)}</tbody></table></div><p>First 500 populated cells; all numeric cells are available in mapping selectors.</p><button onClick={() => download(candidate.filename, candidate.bytes)}>Download original for Excel</button></details>
        <div className="workbook-fields"><label>Reviewer<input value={reviewer} onChange={e => setReviewer(e.target.value)}/></label><label>Decision rationale<textarea value={rationale} onChange={e => setRationale(e.target.value)}/></label></div><div className="workbook-actions"><button disabled={busy} onClick={() => void decide('Accepted')}>{active ? 'Accept revised operating evidence' : 'Approve mapping and open review'}</button>{active && <button disabled={busy} onClick={() => void decide('Rejected')}>Reject revision</button>}<button disabled={busy} onClick={() => setCandidate(null)}>Cancel mapping</button></div></div>}
    {active && !candidate && <><nav className="workbook-actions" aria-label="Workbook review sections">{['Operating review', 'Sources & history', 'Committee note'].map(t => <button aria-pressed={tab === t} key={t} onClick={() => setTab(t)}>{t}</button>)}</nav>{readError ? <p role="alert">{readError}</p> : tab === 'Operating review' ? <><h3>What the workbook supports</h3><p>Selected revenue and EBITDA. No automatic annualization or blending of actuals and forecasts.</p><div className="workbook-scroll"><table><thead><tr><th>Period</th><th>Revenue</th><th>EBITDA</th><th>EBITDA margin</th><th>Source</th></tr></thead><tbody>{rows.map(r => <tr key={r.period}><th>{r.period}</th><td>{money(r.revenue.value)}</td><td>{r.earnings ? money(r.earnings.value) : 'Unavailable'}</td><td>{r.earnings && r.revenue.value > 0 ? `${(100 * r.earnings.value / r.revenue.value).toFixed(1)}%` : 'Unavailable'}</td><td><button onClick={() => setTab('Sources & history')}>{active.sheet}!{r.revenue.address}{r.earnings ? `, ${r.earnings.address}` : ''}</button>{(r.revenue.formula || r.earnings?.formula) && <small>Stored Excel result</small>}</td></tr>)}</tbody></table></div><h3>Before an investment decision</h3><ul><li>Customer cohorts and contract evidence: retention and concentration remain unavailable.</li><li>Transaction terms and capitalization: ownership, leverage and returns remain unavailable.</li><li>Accounting definitions and supporting documents: validate these mappings.</li></ul><p>Use the complete-package workflow below for full underwriting once the missing inputs are available.</p></> : tab === 'Sources & history' ? <><h3>{active.filename}</h3><p>Approved {active.approvedAt} by {active.reviewer}. {active.rationale}</p><button onClick={() => download(active.filename, active.bytes)}>Download original workbook</button>{rows.map(r => <article key={r.period}><h4>{r.period}</h4>{[r.revenue, ...(r.earnings ? [r.earnings] : [])].map(c => <p key={c.address}>{active.sheet}!{c.address} · normalized value {money(c.value)} · {c.formula ? `stored result of =${c.formula}` : 'literal input'}</p>)}</article>)}<details><summary>Source fingerprint and prior decisions ({active.history.length})</summary><code>{active.digest}</code>{active.history.map((h, i) => <article key={i}><p>{h.outcome} · {h.filename} · {h.reviewer} · {h.at}</p><p>{h.rationale}</p><button onClick={() => download(h.filename, h.bytes)}>Download archived workbook</button></article>)}</details></> : <><h3>Committee working note</h3><p>Bound to approved Version {active.version}. Pending workbooks do not change this note.</p><pre className="workbook-note">{workbookCommitteeNote(active)}</pre><button onClick={() => download(`${active.name}-operating-review-v${active.version}.md`, workbookCommitteeNote(active))}>Download committee working note</button></>}</>}
    </section>;
}
