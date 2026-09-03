import {unzipSync} from "fflate";

/**
 * Browser-side package assembly for New Deal intake.
 *
 * The deterministic engine in `intake.ts` still validates bytes, digests, and
 * the manifest contract. This module owns the user-facing package: it keeps an
 * additive list of chosen files across repeated pickers and drops, recognizes
 * each file's role from the declared package contract, and explains what is
 * still missing before analysis is offered.
 */

export type PackageRole = "declaration" | "deal" | "operating-model" | "customers" | "management-update";

export interface PackageRequirement {
  role: PackageRole;
  label: string;
  description: string;
  acceptedNames: readonly string[];
  /** Human-readable hint for the file the user should look for. */
  hint: string;
}

export const PACKAGE_REQUIREMENTS: readonly PackageRequirement[] = [
  {role: "declaration", label: "Package declaration", description: "File list with byte counts and fingerprints; proves the other files are unchanged.", acceptedNames: ["manifest.json"], hint: "manifest.json"},
  {role: "deal", label: "Deal terms", description: "Proposed round, hold period, growth and exit assumptions, evidence cutoff.", acceptedNames: ["deal.json"], hint: "deal.json"},
  {role: "operating-model", label: "Operating model", description: "Monthly revenue and costs; the workbook and its formulas are preserved.", acceptedNames: ["operating_model.xlsx", "monthly_financials.csv"], hint: "operating_model.xlsx"},
  {role: "customers", label: "Customer data", description: "Customer-level ARR at opening and closing periods for fixed-cohort retention.", acceptedNames: ["customer_arr.csv"], hint: "customer_arr.csv"},
  {role: "management-update", label: "Management update", description: "Management narrative, retained as a representation rather than a verified fact.", acceptedNames: ["management_update.pdf"], hint: "management_update.pdf"},
];

export interface PackageFile {
  key: string;
  file: File;
  name: string;
  role: PackageRole | null;
  addedAt: number;
}

export interface PackageChecklistItem {
  requirement: PackageRequirement;
  state: "present" | "missing" | "optional";
  file: PackageFile | null;
}

export interface PackageReadiness {
  ready: boolean;
  checklist: PackageChecklistItem[];
  missing: PackageRequirement[];
  unrecognized: PackageFile[];
  /** Plain-language explanation shown before analysis is allowed. */
  summary: string;
}

const ZIP_PATTERN = /\.zip$/i;
const IGNORED_ENTRY = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|\.[^/]+)(\/|$)/;

export function packageBasename(name: string) {
  return name.split(/[\\/]/).at(-1) ?? name;
}

export function roleForName(name: string): PackageRole | null {
  const base = packageBasename(name).toLowerCase();
  return PACKAGE_REQUIREMENTS.find((requirement) => requirement.acceptedNames.includes(base))?.role ?? null;
}

let keySequence = 0;
function nextKey(name: string) {
  keySequence += 1;
  return `${name}:${keySequence}`;
}

/**
 * Add files to the package. Later selections ADD to the earlier ones; a file
 * whose basename already exists replaces that entry (the user is re-choosing
 * the same declared file), and the replaced names are reported so the UI can
 * say so.
 */
export function addPackageFiles(current: readonly PackageFile[], incoming: readonly File[]): {files: PackageFile[]; added: string[]; replaced: string[]} {
  const files = [...current];
  const added: string[] = [];
  const replaced: string[] = [];
  const now = Date.now();
  for (const file of incoming) {
    const name = packageBasename(file.name);
    if (!name) continue;
    const entry: PackageFile = {key: nextKey(name), file, name, role: roleForName(name), addedAt: now};
    const existing = files.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing >= 0) {
      files[existing] = entry;
      replaced.push(name);
    } else {
      files.push(entry);
      added.push(name);
    }
  }
  return {files, added, replaced};
}

export function removePackageFile(current: readonly PackageFile[], key: string): PackageFile[] {
  return current.filter((item) => item.key !== key);
}

export function replacePackageFile(current: readonly PackageFile[], key: string, file: File): PackageFile[] {
  const name = packageBasename(file.name);
  const replacement: PackageFile = {key: nextKey(name), file, name, role: roleForName(name), addedAt: Date.now()};
  const withoutDuplicate = current.filter((item) => item.key === key || item.name.toLowerCase() !== name.toLowerCase());
  return withoutDuplicate.map((item) => item.key === key ? replacement : item);
}

export function clearPackage(): PackageFile[] {
  return [];
}

export function packageReadiness(files: readonly PackageFile[]): PackageReadiness {
  const byRole = new Map<PackageRole, PackageFile>();
  for (const item of files) if (item.role && !byRole.has(item.role)) byRole.set(item.role, item);
  const operatingModel = byRole.get("operating-model");
  const evidencePackage = !operatingModel || operatingModel.name.toLowerCase().endsWith(".xlsx");
  const checklist: PackageChecklistItem[] = PACKAGE_REQUIREMENTS.map((requirement) => {
    const file = byRole.get(requirement.role) ?? null;
    if (file) return {requirement, state: "present", file};
    if (requirement.role === "management-update" && !evidencePackage) return {requirement, state: "optional", file: null};
    return {requirement, state: "missing", file: null};
  });
  const missing = checklist.filter((item) => item.state === "missing").map((item) => item.requirement);
  const unrecognized = files.filter((item) => !item.role);
  const ready = files.length > 0 && missing.length === 0;
  const summary = !files.length
    ? "Add the complete package to begin. Nothing leaves this browser tab."
    : ready
      ? unrecognized.length
        ? `All five required files are present. ${unrecognized.length === 1 ? "One extra file is" : `${unrecognized.length} extra files are`} listed but will not be analyzed.`
        : "All required files are present. Validation checks every byte against the package declaration before any number is shown."
      : `Analysis is blocked until ${missing.length === 1 ? "one required file is" : `${missing.length} required files are`} added: ${missing.map((item) => `${item.label} (${item.hint})`).join(", ")}.`;
  return {ready, checklist, missing, unrecognized, summary};
}

/** Expand ZIP archives into their member files; pass every other file through. */
export async function expandSelectionAsync(selection: readonly File[]): Promise<{files: File[]; archives: string[]; skipped: string[]}> {
  const files: File[] = [];
  const archives: string[] = [];
  const skipped: string[] = [];
  for (const file of selection) {
    if (!ZIP_PATTERN.test(file.name)) { files.push(file); continue; }
    try {
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      archives.push(packageBasename(file.name));
      for (const [path, bytes] of Object.entries(entries)) {
        if (path.endsWith("/") || IGNORED_ENTRY.test(path) || !bytes.length) continue;
        const name = packageBasename(path);
        files.push(new File([bytes.slice().buffer as ArrayBuffer], name, {type: mediaTypeFor(name)}));
      }
    } catch {
      skipped.push(packageBasename(file.name));
    }
  }
  return {files, archives, skipped};
}

export function mediaTypeFor(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return {json: "application/json", csv: "text/csv", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}[extension ?? ""] ?? "application/octet-stream";
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (resolve: (file: File) => void, reject: (error: unknown) => void) => void;
  createReader?: () => {readEntries: (resolve: (entries: FileSystemEntryLike[]) => void, reject: (error: unknown) => void) => void};
}

async function readEntry(entry: FileSystemEntryLike, depth: number): Promise<File[]> {
  if (depth > 4 || IGNORED_ENTRY.test(`${entry.name}`)) return [];
  if (entry.isFile && entry.file) return [await new Promise<File>((resolve, reject) => entry.file!(resolve, reject))];
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const collected: File[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) collected.push(...await readEntry(child, depth + 1));
    }
    return collected;
  }
  return [];
}

/** Collect files from a drop, walking dropped folders where the browser supports it. */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items.map((item) => (item as DataTransferItem & {webkitGetAsEntry?: () => FileSystemEntryLike | null}).webkitGetAsEntry?.() ?? null);
  if (entries.length && entries.every(Boolean)) {
    const files: File[] = [];
    for (const entry of entries) files.push(...await readEntry(entry!, 0));
    if (files.length) return files;
  }
  return Array.from(dataTransfer.files ?? []);
}

export const SAMPLE_PACKAGE_FILES = ["manifest.json", "deal.json", "operating_model.xlsx", "customer_arr.csv", "management_update.pdf"] as const;

/** Fetch the included synthetic Northstar package from the running build. */
export async function loadSyntheticSample(baseUrl = "sample-package-v2/", fetchFn: typeof fetch = fetch): Promise<File[]> {
  return Promise.all(SAMPLE_PACKAGE_FILES.map(async (name) => {
    const response = await fetchFn(`${baseUrl}${name}`);
    if (!response.ok) throw new Error(`Sample file ${name} is unavailable (${response.status})`);
    return new File([await response.arrayBuffer()], name, {type: mediaTypeFor(name)});
  }));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
