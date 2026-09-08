#!/usr/bin/env node
import {readFile, readdir, mkdir, writeFile, lstat} from 'node:fs/promises';
import {resolve, dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';

export const runtimeFiles = ['onboarding-store.mjs', 'desktop-http.mjs', 'progress-store.mjs', 'progress-http.mjs', 'local-server.mjs', 'review-http.mjs', 'review-store.mjs', 'workspace-store.mjs', 'package-store.mjs', 'server.mjs'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const forbidden = name => name.startsWith('.') || /\.(map|sqlite|sqlite3|db|pem|key)(-|$)/i.test(name) || name === 'node_modules';

export async function packageLocal({workbenchPath, outputPath}) {
  const entries = {};
  async function add(source, target, executable = false) {
    const meta = await lstat(source);
    if (!meta.isFile() || meta.isSymbolicLink()) throw new Error(`Only regular files may be packaged: ${target}`);
    entries[target] = [new Uint8Array(await readFile(source)), executable ? {os: 3, attrs: 0o100755 << 16} : {os: 3, attrs: 0o100644 << 16}];
  }
  async function walk(dir) {
    for (const entry of (await readdir(dir, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
      if (forbidden(entry.name)) continue;
      const source = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlinks cannot be packaged: ${entry.name}`);
      if (entry.isDirectory()) await walk(source);
      else await add(source, relative(workbenchPath, source).split('\\').join('/'));
    }
  }
  await readFile(join(workbenchPath, 'dist', 'index.html')); // A completed application build is required.
  await walk(join(workbenchPath, 'dist'));
  for (const name of runtimeFiles) await add(join(workbenchPath, 'mcp-server', name), `mcp-server/${name}`);
  for (const name of ['start-desk.mjs', 'check-package.mjs', 'Open Underwriting Desk.command', 'Open Underwriting Desk.cmd', 'README.txt']) {
    await add(join(workbenchPath, 'launcher', name), name, name.endsWith('.command'));
  }
  const manifest = {format: 'underwriting-desk.local-package/v1', nodeMinimum: '24', includesNodeRuntime: false, signed: false,
    files: Object.fromEntries(Object.entries(entries).map(([name, [bytes]]) => [name, {bytes: bytes.length, sha256: digest(bytes)}]))};
  entries['manifest.json'] = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const archive = zipSync(entries, {level: 6});
  await mkdir(dirname(outputPath), {recursive: true});
  await writeFile(outputPath, archive);
  await writeFile(`${outputPath}.sha256`, `${digest(archive)}  ${outputPath.split(/[\\/]/).at(-1)}\n`);
  return {outputPath, fileCount: Object.keys(entries).length, bytes: archive.length, sha256: digest(archive)};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workbenchPath = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = resolve(workbenchPath, '../dist/local-distribution/underwriting-desk-local.zip');
  console.log(JSON.stringify(await packageLocal({workbenchPath, outputPath}), null, 2));
}
