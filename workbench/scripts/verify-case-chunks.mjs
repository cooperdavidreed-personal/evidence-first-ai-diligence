import {gzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const manifest = JSON.parse(readFileSync(resolve(dist, ".vite/manifest.json"), "utf8"));
const entry = manifest["index.html"];
const expected = [
  "node_modules/.pnpm/pdfjs-dist@6.3.289/node_modules/pdfjs-dist/legacy/build/pdf.mjs",
  "src/design-directions.tsx",
  "src/design-specimen.tsx",
  "virtual:underwriting-case-atlasgrid",
  "virtual:underwriting-case-helios",
];
if (!entry || JSON.stringify([...new Set(entry.dynamicImports ?? [])].sort()) !== JSON.stringify(expected)) throw new Error("case_chunk_manifest_invalid");

// Account for the complete static shell graph, including shared UI chunks.
// Dynamic case, PDF and specimen payloads are excluded until requested.
const staticKeys = new Set();
function collect(key) {
  if (staticKeys.has(key)) return;
  if (!manifest[key]) throw new Error(`static_chunk_missing:${key}`);
  staticKeys.add(key);
  for (const dependency of manifest[key].imports ?? []) collect(dependency);
}
collect("index.html");
const cssFiles = new Set();
let shellGzip = 0;
for (const key of staticKeys) {
  const record = manifest[key];
  const shell = readFileSync(resolve(dist, record.file));
  if (shell.includes(Buffer.from('"schema_version":"underwriting.workbench-case/v2"')) || shell.includes(Buffer.from("atlasgrid-distribution-999")) || shell.includes(Buffer.from("helios-distribution-moic-999"))) throw new Error("case_payload_leaked_into_shell");
  shellGzip += gzipSync(shell).length;
  for (const file of record.css ?? []) cssFiles.add(file);
}
const css = [...cssFiles].reduce((sum, file) => sum + gzipSync(readFileSync(resolve(dist, file))).length, 0);
const html = gzipSync(readFileSync(resolve(dist, "index.html"))).length;
const results = {};

for (const caseId of ["atlasgrid", "helios"]) {
  const key = `virtual:underwriting-case-${caseId}`;
  const other = caseId === "atlasgrid" ? "helios" : "atlasgrid";
  const record = manifest[key];
  if (!record?.isDynamicEntry) throw new Error(`case_chunk_missing:${caseId}`);
  const bytes = readFileSync(resolve(dist, record.file));
  if (!bytes.includes(Buffer.from(`caseId:"${caseId}"`)) || bytes.includes(Buffer.from(`caseId:"${other}"`))) throw new Error(`case_chunk_content_invalid:${caseId}`);
  const payloadGzip = gzipSync(bytes).length;
  const initialGzip = html + css + shellGzip + payloadGzip;
  if (payloadGzip > 1_000_000) throw new Error(`case_payload_budget_exceeded:${caseId}:${payloadGzip}`);
  if (initialGzip > 1_100_000) throw new Error(`initial_transfer_budget_exceeded:${caseId}:${initialGzip}`);
  results[caseId] = {initial_gzip_bytes: initialGzip, payload_gzip_bytes: payloadGzip};
}

process.stdout.write(`${JSON.stringify({status: "PASS", shell_gzip_bytes: shellGzip, cases: results})}\n`);
