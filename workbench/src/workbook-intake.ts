import { readWorkbook, type WorkbookCell } from './workbook-diff';
import { sha256 } from './intake';
export interface FinancialMapping {
    period: string;
    revenue: string;
    earnings: string;
}
export interface WorkbookReview {
    id: string;
    name: string;
    filename: string;
    bytes: ArrayBuffer;
    digest: string;
    sheet: string;
    currency: string;
    scale: number;
    cadence: string;
    mappings: FinancialMapping[];
    reviewer: string;
    rationale: string;
    approvedAt: string;
    version: number;
    history: {
        digest: string;
        filename: string;
        bytes: ArrayBuffer;
        reviewer: string;
        rationale: string;
        at: string;
        outcome: 'Accepted' | 'Rejected';
    }[];
}
export function suggestMappings(cells: Map<string, WorkbookCell>): FinancialMapping[] {
    const entries = [...cells];
    const revenue = entries.find(([, c]) => c.type === 'text' && /^(total\s+)?(revenue|revenues|sales)$/i.test(c.value.trim()));
    if (!revenue)
        return [];
    const earnings = entries.find(([, c]) => c.type === 'text' && /^(adjusted\s+)?ebitda$/i.test(c.value.trim()));
    const [column, row] = revenue[0].match(/^([A-Z]+)(\d+)$/)!.slice(1);
    const horizontal = entries.filter(([a, c]) => a.match(/\d+$/)?.[0] === row && c.type === 'number');
    const vertical = entries.filter(([a, c]) => a.match(/^[A-Z]+/)?.[0] === column && c.type === 'number');
    const selected = horizontal.length >= vertical.length ? horizontal : vertical;
    return selected.slice(0, 36).map(([address]) => {
        const [col, r] = address.match(/^([A-Z]+)(\d+)$/)!.slice(1);
        const periodAddress = horizontal.length >= vertical.length ? `${col}${Number(row) - 1}` : `A${r}`;
        const earningsAddress = earnings ? horizontal.length >= vertical.length ? `${col}${earnings[0].match(/\d+$/)![0]}` : `${earnings[0].match(/^[A-Z]+/)![0]}${r}` : '';
        const periodCell = cells.get(periodAddress);
        return { period: periodCell && ['text', 'date'].includes(periodCell.type) ? periodCell.value : '', revenue: address, earnings: cells.get(earningsAddress)?.type === 'number' ? earningsAddress : '' };
    });
}
export function mappedFinancials(bytes: ArrayBuffer, sheet: string, mappings: FinancialMapping[], scale: number) {
    const cells = readWorkbook(bytes).get(sheet);
    if (!cells)
        throw new Error('Select a worksheet.');
    if (![1, 1000, 1000000].includes(scale))
        throw new Error('Confirm the reported units.');
    if (!mappings.length || mappings.length > 36)
        throw new Error('Map between one and 36 periods.');
    const periods = new Set<string>(), addresses = new Set<string>();
    function number(address: string) {
        if (addresses.has(address))
            throw new Error(`Cell ${address} is mapped more than once.`);
        addresses.add(address);
        const cell = cells!.get(address);
        if (cell?.type !== 'number' || !Number.isFinite(Number(cell.value) * scale) || Math.abs(Number(cell.value) * scale) > Number.MAX_SAFE_INTEGER / 100)
            throw new Error(`${address || 'Selected cell'} has no usable stored numeric value.`);
        return { value: Number(cell.value) * scale, address, formula: cell.formula };
    }
    return mappings.map(mapping => {
        const period = mapping.period.trim();
        if (!period || periods.has(period.toLowerCase()))
            throw new Error('Each period needs a unique, meaningful label. Confirm dates from Excel rather than using date serial numbers.');
        periods.add(period.toLowerCase());
        return { period, revenue: number(mapping.revenue), earnings: mapping.earnings ? number(mapping.earnings) : null };
    });
}
export async function inspectWorkbook(file: File) {
    if (!/\.xlsx$/i.test(file.name))
        throw new Error('Choose an .xlsx workbook. Save legacy .xls files as .xlsx in Excel first.');
    if (file.size > 8 * 1024 * 1024)
        throw new Error('Choose a workbook under 8 MB.');
    const bytes = await file.arrayBuffer();
    return { bytes, filename: file.name, digest: await sha256(bytes), sheets: readWorkbook(bytes) };
}
function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open('underwriting-workbook-reviews', 1); request.onupgradeneeded = () => request.result.createObjectStore('reviews', { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
export async function saveWorkbookReview(review: WorkbookReview) {
    mappedFinancials(review.bytes, review.sheet, review.mappings, review.scale);
    if (!review.reviewer.trim() || !review.rationale.trim())
        throw new Error('A reviewer and rationale are required.');
    const db = await database();
    try {
        await new Promise<void>((resolve, reject) => { const tx = db.transaction('reviews', 'readwrite'); tx.objectStore('reviews').put(review); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    }
    finally {
        db.close();
    }
}
export async function listWorkbookReviews(): Promise<WorkbookReview[]> {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => { const req = db.transaction('reviews').objectStore('reviews').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    }
    finally {
        db.close();
    }
}
export function workbookCommitteeNote(review: WorkbookReview) {
    const rows = mappedFinancials(review.bytes, review.sheet, review.mappings, review.scale);
    return [`# ${review.name} — operating review`, `Version ${review.version} · approved by ${review.reviewer} · ${review.approvedAt}`, `Source: ${review.filename} / ${review.sheet} · SHA-256 ${review.digest}`, `Periods: ${review.cadence}. Amounts: ${review.currency}, normalized from scale ${review.scale}.`, '', '## Current view', 'Operating evidence only. No investment recommendation or transaction return has been established.', '', ...rows.map(row => `${row.period}: revenue ${row.revenue.value} (${review.sheet}!${row.revenue.address}); EBITDA ${row.earnings ? `${row.earnings.value} (${review.sheet}!${row.earnings.address})` : 'unavailable'}.`), '', 'Formula-backed cells use workbook-stored results; the Desk has not recalculated Excel formulas.', '', '## Analyst rationale', review.rationale, '', '## Remaining diligence', 'Confirm accounting definitions and period comparability; request customer cohorts, transaction terms, capitalization and supporting documents before a full investment review.', '', '## Next committee action', 'Review the operating evidence and assign missing diligence. Full underwriting requires the complete-package workflow.', '', 'Local working note; not investment advice.'].join('\n');
}
