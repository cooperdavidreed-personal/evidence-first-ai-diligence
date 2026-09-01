export const PACKAGE_VERSION = "growth-saas-quick-package/v1";
export const REQUIRED_FILES = ["manifest.json", "deal.json", "monthly_financials.csv", "customer_arr.csv"] as const;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 12 * 1024 * 1024;

export type IntakeFileState = "RECOGNIZED" | "MISSING" | "INVALID" | "UNSUPPORTED" | "EXCLUDED" | "READY";
export interface ColumnMapping { from: string; to: string }
export interface IntakeFileStatus {
  name: string;
  role: string;
  state: IntakeFileState;
  detail: string;
  bytes?: number;
  rows?: number;
  mappings?: ColumnMapping[];
  sha256?: string;
}

export interface DealInput {
  company: string;
  cutoff: string;
  cashCents: number;
  investmentCents: number;
  preMoneyCents: number;
  years: number;
  annualRevenueGrowth: number;
  exitRevenueMultiple: number;
  minimumGrossMoic: number;
  minimumAnnualizedReturn: number;
  minimumRunwayMonths: number;
  analystOwner: string;
}

export interface QuickMetric {
  id: string;
  label: string;
  value: number | null;
  display: string;
  meaning: string;
  limitation: string;
  sourceFiles: string[];
}
export interface QuickDecisionTest { label: string; observed: string; required: string; status: "CLEARS" | "MISSES" }
export interface QuickAnalysis {
  ltmRevenueCents: number;
  grossMargin: number;
  ordinaryNrr: number;
  recentNetBurnCents: number;
  runwayMonths: number | null;
  postMoneyOwnership: number;
  terminalRevenueCents: number;
  exitEquityCents: number;
  grossMoic: number;
  annualizedGrossReturn: number;
  metrics: QuickMetric[];
  tests: QuickDecisionTest[];
}
export interface IntakeResult {
  packageState: "READY" | "INCOMPLETE";
  posture: "READY FOR IC REVIEW" | "HOLD" | "NO CALL — PACKAGE INCOMPLETE";
  rationale: string;
  files: IntakeFileStatus[];
  errors: string[];
  deal: DealInput | null;
  analysis: QuickAnalysis | null;
  processedLocally: true;
}

interface ManifestEntry { name: string; role: string; required: true; bytes: number; sha256: string }
interface Manifest { package_version: string; files: ManifestEntry[] }
interface MonthlyRow { period: string; revenueCents: number; costOfRevenueCents: number; operatingExpenseCents: number }
interface CustomerRow { customerId: string; period: string; arrCents: number }

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function basename(file: File) {
  const candidate = (file as File & {webkitRelativePath?: string}).webkitRelativePath || file.name;
  return candidate.split(/[\\/]/).at(-1) ?? file.name;
}
function safeInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer number of cents`);
  return value;
}
function decimal(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`${field} must be a declared decimal string`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${field} is outside the supported range`);
  return parsed;
}
function text(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) throw new Error(`${field} must be a non-empty string`);
  return value.trim();
}
function addCents(values: number[], field: string) {
  return values.reduce((sum, value) => {
    const next = sum + value;
    if (!Number.isSafeInteger(next)) throw new Error(`${field} exceeds safe integer-cent range`);
    return next;
  }, 0);
}
function money(cents: number) { return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 1, notation: "compact"}).format(cents / 100); }
function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }

export async function sha256(bytes: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable; package validation stopped");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseManifest(raw: string): Manifest {
  const candidate: unknown = JSON.parse(raw);
  if (!record(candidate) || candidate.package_version !== PACKAGE_VERSION || !Array.isArray(candidate.files)) throw new Error("Manifest version or file list is invalid");
  const expectedRoles: Record<string, string> = {"deal.json": "deal", "monthly_financials.csv": "monthly_financials", "customer_arr.csv": "customer_arr"};
  const seen = new Set<string>();
  const files = candidate.files.map((item): ManifestEntry => {
    if (!record(item) || typeof item.name !== "string" || typeof item.role !== "string" || item.required !== true || typeof item.bytes !== "number" || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(item.sha256)) throw new Error("Manifest contains an invalid file declaration");
    if (seen.has(item.name)) throw new Error(`Manifest declares ${item.name} more than once`);
    if (expectedRoles[item.name] !== item.role) throw new Error(`Manifest role for ${item.name} is unsupported`);
    seen.add(item.name);
    return {name: item.name, role: item.role, required: true, bytes: item.bytes, sha256: item.sha256};
  });
  for (const name of Object.keys(expectedRoles)) if (!seen.has(name)) throw new Error(`Manifest is missing ${name}`);
  if (files.length !== 3) throw new Error("Manifest may declare only the three supported analysis files");
  return {package_version: PACKAGE_VERSION, files};
}

function parseCsv(raw: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted && character === '"' && raw[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && raw[index + 1] === "\n") index += 1;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("CSV has an unterminated quoted field");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one data row");
  if (new Set(rows[0]).size !== rows[0].length) throw new Error("CSV header contains a duplicate column");
  if (rows.slice(1).some((candidate) => candidate.length !== rows[0].length)) throw new Error("CSV rows do not match the header width");
  return {headers: rows[0], rows: rows.slice(1)};
}

function headerMap(headers: string[], aliases: Record<string, string[]>) {
  const indexes: Record<string, number> = {}, mappings: ColumnMapping[] = [];
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const [canonical, choices] of Object.entries(aliases)) {
    const matches = choices.map((choice) => normalized.indexOf(choice)).filter((index) => index >= 0);
    if (matches.length !== 1) throw new Error(`Required column ${canonical} is missing or ambiguous`);
    indexes[canonical] = matches[0];
    const supplied = normalized[matches[0]];
    if (supplied !== canonical) mappings.push({from: supplied, to: canonical});
  }
  return {indexes, mappings};
}
function centsCell(value: string, field: string) {
  if (!/^\d+$/.test(value)) throw new Error(`${field} must contain integer cents only`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} exceeds safe integer-cent range`);
  return parsed;
}
function periodCell(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error(`Invalid period ${value || "(blank)"}; expected YYYY-MM`);
  return value;
}

function parseMonthly(raw: string, cutoff: string) {
  const parsed = parseCsv(raw);
  const {indexes, mappings} = headerMap(parsed.headers, {
    period: ["period", "month", "date"], revenue_cents: ["revenue_cents", "revenue", "revenue_usd_cents"],
    cost_of_revenue_cents: ["cost_of_revenue_cents", "cogs_cents", "cost_of_revenue"],
    operating_expense_cents: ["operating_expense_cents", "opex_cents", "operating_expense"],
  });
  const seen = new Set<string>(); let excluded = 0;
  const rows: MonthlyRow[] = [];
  for (const row of parsed.rows) {
    const period = periodCell(row[indexes.period]);
    if (seen.has(period)) throw new Error(`Monthly financials contain duplicate period ${period}`);
    seen.add(period);
    const candidate = {period, revenueCents: centsCell(row[indexes.revenue_cents], "revenue_cents"), costOfRevenueCents: centsCell(row[indexes.cost_of_revenue_cents], "cost_of_revenue_cents"), operatingExpenseCents: centsCell(row[indexes.operating_expense_cents], "operating_expense_cents")};
    if (period > cutoff.slice(0, 7)) excluded += 1; else rows.push(candidate);
  }
  rows.sort((left, right) => left.period.localeCompare(right.period));
  if (rows.length < 12) throw new Error("Monthly financials require at least 12 eligible periods");
  return {rows, mappings, excluded};
}

function parseCustomers(raw: string, cutoff: string) {
  const parsed = parseCsv(raw);
  const {indexes, mappings} = headerMap(parsed.headers, {
    customer_id: ["customer_id", "customer", "account_id"], period: ["period", "month", "date"], arr_cents: ["arr_cents", "arr", "annual_recurring_revenue_cents"],
  });
  const seen = new Set<string>(); let excluded = 0;
  const rows: CustomerRow[] = [];
  for (const row of parsed.rows) {
    const customerId = row[indexes.customer_id]?.trim(); if (!customerId) throw new Error("customer_id cannot be blank");
    const period = periodCell(row[indexes.period]); const key = `${customerId}\u0000${period}`;
    if (seen.has(key)) throw new Error(`Customer ARR contains a duplicate customer-period row for ${customerId} in ${period}`);
    seen.add(key);
    const candidate = {customerId, period, arrCents: centsCell(row[indexes.arr_cents], "arr_cents")};
    if (period > cutoff.slice(0, 7)) excluded += 1; else rows.push(candidate);
  }
  if (new Set(rows.map((row) => row.period)).size < 2) throw new Error("Customer ARR requires at least two eligible periods");
  return {rows, mappings, excluded};
}

function parseDeal(raw: string): DealInput {
  const candidate: unknown = JSON.parse(raw);
  if (!record(candidate) || candidate.package_version !== PACKAGE_VERSION || !record(candidate.proposed_financing) || !record(candidate.return_assumptions) || !record(candidate.thresholds)) throw new Error("Deal file does not match the supported package contract");
  const cutoff = text(candidate.cutoff, "cutoff");
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(cutoff) || Number.isNaN(Date.parse(`${cutoff}T00:00:00Z`))) throw new Error("cutoff must be a valid YYYY-MM-DD date");
  const years = safeInteger(candidate.return_assumptions.years, "return_assumptions.years");
  if (years < 1 || years > 10) throw new Error("return_assumptions.years must be between 1 and 10");
  return {
    company: text(candidate.company, "company"), cutoff, cashCents: safeInteger(candidate.cash_cents, "cash_cents"),
    investmentCents: safeInteger(candidate.proposed_financing.investment_cents, "proposed_financing.investment_cents"),
    preMoneyCents: safeInteger(candidate.proposed_financing.pre_money_cents, "proposed_financing.pre_money_cents"), years,
    annualRevenueGrowth: decimal(candidate.return_assumptions.annual_revenue_growth, "return_assumptions.annual_revenue_growth", -0.99, 5),
    exitRevenueMultiple: decimal(candidate.return_assumptions.exit_revenue_multiple, "return_assumptions.exit_revenue_multiple", 0.01, 100),
    minimumGrossMoic: decimal(candidate.thresholds.minimum_gross_moic, "thresholds.minimum_gross_moic", 0, 100),
    minimumAnnualizedReturn: decimal(candidate.thresholds.minimum_annualized_return, "thresholds.minimum_annualized_return", -0.99, 10),
    minimumRunwayMonths: decimal(candidate.thresholds.minimum_runway_months, "thresholds.minimum_runway_months", 0, 120),
    analystOwner: text(candidate.analyst_owner, "analyst_owner"),
  };
}

function analyze(deal: DealInput, monthly: MonthlyRow[], customers: CustomerRow[]): QuickAnalysis {
  const ltm = monthly.slice(-12); const recent = monthly.slice(-3);
  const ltmRevenueCents = addCents(ltm.map((row) => row.revenueCents), "LTM revenue");
  if (ltmRevenueCents <= 0) throw new Error("LTM revenue must be greater than zero");
  const ltmCostCents = addCents(ltm.map((row) => row.costOfRevenueCents), "LTM cost of revenue");
  if (ltmCostCents > ltmRevenueCents * 10) throw new Error("Cost of revenue is outside the supported range");
  const grossMargin = (ltmRevenueCents - ltmCostCents) / ltmRevenueCents;
  const recentNetBurnCents = Math.round(addCents(recent.map((row) => Math.max(0, row.costOfRevenueCents + row.operatingExpenseCents - row.revenueCents)), "recent net burn") / recent.length);
  const runwayMonths = recentNetBurnCents === 0 ? null : deal.cashCents / recentNetBurnCents;
  const periods = [...new Set(customers.map((row) => row.period))].sort(); const basePeriod = periods[0], latestPeriod = periods.at(-1)!;
  const base = new Map(customers.filter((row) => row.period === basePeriod && row.arrCents > 0).map((row) => [row.customerId, row.arrCents]));
  const latest = new Map(customers.filter((row) => row.period === latestPeriod).map((row) => [row.customerId, row.arrCents]));
  const baseArr = addCents([...base.values()], "cohort base ARR"); if (baseArr === 0) throw new Error("Ordinary cohort base ARR must be greater than zero");
  const endingArr = addCents([...base.keys()].map((id) => latest.get(id) ?? 0), "cohort ending ARR"); const ordinaryNrr = endingArr / baseArr;
  const postMoney = deal.preMoneyCents + deal.investmentCents; if (!Number.isSafeInteger(postMoney) || deal.investmentCents === 0 || postMoney <= 0) throw new Error("Proposed financing must have positive, safe integer-cent values");
  const postMoneyOwnership = deal.investmentCents / postMoney;
  const terminalRevenueCents = Math.round(ltmRevenueCents * ((1 + deal.annualRevenueGrowth) ** deal.years));
  const exitEquityCents = Math.round(terminalRevenueCents * deal.exitRevenueMultiple + deal.cashCents);
  if (!Number.isSafeInteger(terminalRevenueCents) || !Number.isSafeInteger(exitEquityCents)) throw new Error("Exit scenario exceeds safe integer-cent range");
  const grossProceedsCents = Math.round(exitEquityCents * postMoneyOwnership); const grossMoic = grossProceedsCents / deal.investmentCents;
  const annualizedGrossReturn = grossMoic <= 0 ? -1 : grossMoic ** (1 / deal.years) - 1;
  const runwayClears = runwayMonths === null || runwayMonths >= deal.minimumRunwayMonths;
  const tests: QuickDecisionTest[] = [
    {label: "Gross multiple", observed: `${grossMoic.toFixed(2)}x`, required: `At least ${deal.minimumGrossMoic.toFixed(2)}x`, status: grossMoic >= deal.minimumGrossMoic ? "CLEARS" : "MISSES"},
    {label: "Annualized gross return", observed: percent(annualizedGrossReturn), required: `At least ${percent(deal.minimumAnnualizedReturn)}`, status: annualizedGrossReturn >= deal.minimumAnnualizedReturn ? "CLEARS" : "MISSES"},
    {label: "Cash runway", observed: runwayMonths === null ? "Cash generative" : `${runwayMonths.toFixed(1)} months`, required: `At least ${deal.minimumRunwayMonths.toFixed(1)} months`, status: runwayClears ? "CLEARS" : "MISSES"},
  ];
  const metrics: QuickMetric[] = [
    {id: "ltm-revenue", label: "LTM revenue", value: ltmRevenueCents, display: money(ltmRevenueCents), meaning: "Revenue recognized across the latest twelve eligible monthly rows.", limitation: "Quick Package accounting only; no QoE adjustment or invoice-level reconciliation.", sourceFiles: ["monthly_financials.csv"]},
    {id: "gross-margin", label: "Gross margin", value: grossMargin, display: percent(grossMargin), meaning: "Revenue remaining after declared cost of revenue.", limitation: "Uses the uploaded classification and does not test whether delivery costs are complete.", sourceFiles: ["monthly_financials.csv"]},
    {id: "ordinary-nrr", label: "Ordinary-cohort NRR", value: ordinaryNrr, display: percent(ordinaryNrr), meaning: `ARR retained from customers present in ${basePeriod}, measured at ${latestPeriod}.`, limitation: "Simple fixed cohort; no segmentation, contract review, or parent-account reconciliation.", sourceFiles: ["customer_arr.csv"]},
    {id: "runway", label: "Recent runway", value: runwayMonths, display: runwayMonths === null ? "Cash generative" : `${runwayMonths.toFixed(1)} mo`, meaning: "Cash divided by average positive net burn over the latest three months.", limitation: "No financing events, working-capital schedule, or committed costs beyond the uploaded rows.", sourceFiles: ["deal.json", "monthly_financials.csv"]},
    {id: "ownership", label: "Post-money ownership", value: postMoneyOwnership, display: percent(postMoneyOwnership), meaning: "New investment divided by declared pre-money value plus new investment.", limitation: "No option-pool refresh, preferences, dilution, or later financing rounds.", sourceFiles: ["deal.json"]},
    {id: "gross-moic", label: "Gross multiple", value: grossMoic, display: `${grossMoic.toFixed(2)}x`, meaning: "Illustrative exit equity proceeds divided by the proposed investment.", limitation: "Scenario only; no preference waterfall, fees, taxes, dilution, or debt.", sourceFiles: ["deal.json", "monthly_financials.csv"]},
    {id: "annualized-return", label: "Annualized gross return", value: annualizedGrossReturn, display: percent(annualizedGrossReturn), meaning: `Annualized return across the declared ${deal.years}-year scenario.`, limitation: "Scenario only; not a forecast or investment recommendation.", sourceFiles: ["deal.json", "monthly_financials.csv"]},
  ];
  return {ltmRevenueCents, grossMargin, ordinaryNrr, recentNetBurnCents, runwayMonths, postMoneyOwnership, terminalRevenueCents, exitEquityCents, grossMoic, annualizedGrossReturn, metrics, tests};
}

function incomplete(files: IntakeFileStatus[], errors: string[], deal: DealInput | null = null): IntakeResult {
  return {packageState: "INCOMPLETE", posture: "NO CALL — PACKAGE INCOMPLETE", rationale: errors[0] ?? "Required package evidence is incomplete.", files, errors, deal, analysis: null, processedLocally: true};
}

export async function processDealPackage(input: File[]): Promise<IntakeResult> {
  const statuses: IntakeFileStatus[] = []; const errors: string[] = [];
  const byName = new Map<string, File>(); let totalBytes = 0;
  for (const file of input) {
    const name = basename(file); totalBytes += file.size;
    if (byName.has(name)) { statuses.push({name, role: "duplicate", state: "INVALID", detail: "Duplicate filename; package stopped", bytes: file.size}); errors.push(`Duplicate filename ${name}`); }
    else byName.set(name, file);
  }
  if (totalBytes > MAX_PACKAGE_BYTES) errors.push("Package exceeds the 12 MB public-slice limit");
  for (const [name, file] of byName) if (file.size > MAX_FILE_BYTES) { statuses.push({name, role: "file", state: "INVALID", detail: "File exceeds the 5 MB public-slice limit", bytes: file.size}); errors.push(`${name} is oversize`); }
  const manifestFile = byName.get("manifest.json");
  if (!manifestFile) {
    statuses.push({name: "manifest.json", role: "manifest", state: "MISSING", detail: "Required package declaration is missing"}); errors.push("manifest.json is required");
    for (const name of REQUIRED_FILES.slice(1)) statuses.push({name, role: "required", state: byName.has(name) ? "INVALID" : "MISSING", detail: byName.has(name) ? "Cannot recognize without a valid manifest" : "Required file is missing"});
    return incomplete(statuses, errors);
  }
  let manifest: Manifest;
  try {
    manifest = parseManifest(await manifestFile.text());
    statuses.push({name: "manifest.json", role: "manifest", state: "RECOGNIZED", detail: "Supported package declaration", bytes: manifestFile.size});
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Manifest is invalid";
    statuses.push({name: "manifest.json", role: "manifest", state: "INVALID", detail, bytes: manifestFile.size}); errors.push(detail);
    for (const name of REQUIRED_FILES.slice(1)) statuses.push({name, role: "required", state: byName.has(name) ? "INVALID" : "MISSING", detail: byName.has(name) ? "Cannot recognize without a valid manifest" : "Required file is missing"});
    return incomplete(statuses, errors);
  }
  const recognized = new Map<string, File>();
  for (const declaration of manifest.files) {
    const file = byName.get(declaration.name);
    if (!file) { statuses.push({name: declaration.name, role: declaration.role, state: "MISSING", detail: "Required file is missing"}); errors.push(`${declaration.name} is required`); continue; }
    try {
      const bytes = await file.arrayBuffer(); const digest = await sha256(bytes);
      if (file.size !== declaration.bytes) throw new Error(`Byte count mismatch: expected ${declaration.bytes}, received ${file.size}`);
      if (digest !== declaration.sha256) throw new Error("File digest does not match the manifest");
      statuses.push({name: declaration.name, role: declaration.role, state: "RECOGNIZED", detail: "Manifest byte count and digest match", bytes: file.size, sha256: digest}); recognized.set(declaration.name, file);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "File validation failed";
      statuses.push({name: declaration.name, role: declaration.role, state: "INVALID", detail, bytes: file.size}); errors.push(`${declaration.name}: ${detail}`);
    }
  }
  const declared = new Set(["manifest.json", ...manifest.files.map((file) => file.name)]);
  for (const [name, file] of byName) if (!declared.has(name)) {
    const extension = name.split(".").at(-1)?.toLowerCase();
    const isExperiment = name === "experiment.csv";
    statuses.push({name, role: isExperiment ? "experiment" : "supporting_document", state: isExperiment ? "EXCLUDED" : "UNSUPPORTED", detail: isExperiment ? "Retained as a document only; no causal analysis is run" : ["pdf", "docx", "pptx", "xlsx", "csv", "txt"].includes(extension ?? "") ? "Listed but not parsed by the Quick Package" : "Unsupported file type", bytes: file.size});
  }
  if (errors.length > 0 || recognized.size !== 3) return incomplete(statuses, errors);
  let deal: DealInput | null = null;
  try {
    deal = parseDeal(await recognized.get("deal.json")!.text());
    const monthly = parseMonthly(await recognized.get("monthly_financials.csv")!.text(), deal.cutoff);
    const customers = parseCustomers(await recognized.get("customer_arr.csv")!.text(), deal.cutoff);
    for (const [name, parsed] of [["monthly_financials.csv", monthly], ["customer_arr.csv", customers]] as const) {
      const status = statuses.find((item) => item.name === name)!; status.rows = parsed.rows.length; status.mappings = parsed.mappings;
      status.detail = `${parsed.rows.length} eligible rows${parsed.excluded ? `; ${parsed.excluded} post-cutoff rows excluded` : ""}${parsed.mappings.length ? "; explicit alias mapping required" : ""}`;
    }
    const analysis = analyze(deal, monthly.rows, customers.rows);
    const failed = analysis.tests.filter((test) => test.status === "MISSES");
    for (const status of statuses) if (status.state === "RECOGNIZED") status.state = "READY";
    return {packageState: "READY", posture: failed.length === 0 ? "READY FOR IC REVIEW" : "HOLD", rationale: failed.length === 0 ? "The complete package clears all declared return and runway tests. This is an analytical posture, not an investment recommendation or approval." : `${failed.map((test) => test.label).join(", ")} miss the declared threshold. The complete package remains on hold.`, files: statuses, errors: [], deal, analysis, processedLocally: true};
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Package analysis failed"; errors.push(detail);
    const target = /Customer ARR|customer|ARR/.test(detail) ? "customer_arr.csv" : /Monthly|revenue|cost|burn|CSV|period/.test(detail) ? "monthly_financials.csv" : "deal.json";
    const status = statuses.find((item) => item.name === target); if (status) { status.state = "INVALID"; status.detail = detail; }
    return incomplete(statuses, errors, deal);
  }
}
