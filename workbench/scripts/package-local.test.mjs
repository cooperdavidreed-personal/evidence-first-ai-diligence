import test from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {unzipSync} from 'fflate';
import {packageLocal, runtimeFiles} from './package-local.mjs';
const actualWorkbench = fileURLToPath(new URL('..', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'desk-package-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const dir of ['dist/assets', 'mcp-server', 'launcher']) await mkdir(join(root, dir), {recursive: true});
  await writeFile(join(root, 'dist/index.html'), '<html><head></head><body>Desk package</body></html>');
  await writeFile(join(root, 'dist/assets/app.js'), 'console.log("synthetic")');
  for (const name of ['assets/app.js.map', '.env', 'reviews.sqlite', 'reviews.sqlite-wal']) await writeFile(join(root, 'dist', name), 'excluded');
  for (const name of runtimeFiles) await cp(join(actualWorkbench, 'mcp-server', name), join(root, 'mcp-server', name));
  await cp(join(actualWorkbench, 'launcher'), join(root, 'launcher'), {recursive: true});
  return root;
}
test('package is allowlisted, hash-verified and serves without installed dependencies', async t => {
  const root = await fixture(t);
  const archivePath = join(root, 'output/desk.zip');
  const result = await packageLocal({workbenchPath: root, outputPath: archivePath});
  const bytes = await readFile(archivePath);
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  const entries = unzipSync(bytes);
  assert.ok(entries['Open Underwriting Desk.command']); assert.ok(entries['Open Underwriting Desk.cmd']);
  for (const path of Object.keys(entries)) assert.doesNotMatch(path, /\.map$|\.env|sqlite|node_modules|src\//);
  const manifest = JSON.parse(Buffer.from(entries['manifest.json']).toString());
  assert.equal(manifest.includesNodeRuntime, false);
  for (const [name, receipt] of Object.entries(manifest.files)) {
    assert.equal(receipt.sha256, createHash('sha256').update(entries[name]).digest('hex'));
    assert.equal(receipt.bytes, entries[name].length);
  }
  const extracted = join(root, 'extracted');
  for (const [name, data] of Object.entries(entries)) {
    const path = resolve(extracted, name); await mkdir(resolve(path, '..'), {recursive: true}); await writeFile(path, data);
  }
  const {startLocalDesk} = await import(pathToFileURL(join(extracted, 'mcp-server/local-server.mjs')).href);
  const server = await startLocalDesk({workbenchPath: extracted, storePath: join(root, 'private/reviews.sqlite'), port: 0});
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(response.status, 200); assert.match(await response.text(), /Desk package/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('packaging refuses symlinks and requires an existing application build', async t => {
  const root = await fixture(t);
  await symlink(join(root, 'dist/index.html'), join(root, 'dist/linked.html'));
  await assert.rejects(packageLocal({workbenchPath: root, outputPath: join(root, 'desk.zip')}), /Symlinks/);
  await rm(join(root, 'dist/index.html'));
  await assert.rejects(packageLocal({workbenchPath: root, outputPath: join(root, 'desk.zip')}), /ENOENT/);
});

async function extractedFixture(t) {
  const root = await fixture(t);
  const archivePath = join(root, 'desk.zip');
  await packageLocal({workbenchPath: root, outputPath: archivePath});
  const extracted = join(root, 'extracted');
  for (const [name, data] of Object.entries(unzipSync(await readFile(archivePath)))) {
    const path = resolve(extracted, name); await mkdir(resolve(path, '..'), {recursive: true}); await writeFile(path, data);
  }
  return {root, extracted, store: join(root, 'private/reviews.sqlite')};
}
function launch(extracted, store, args, env = {}) {
  const child = spawn(process.execPath, [join(extracted, 'start-desk.mjs'), ...args], {
    env: {...process.env, DESK_LOCAL_STORE: store, DESK_PORT: '4198', ...env}, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const done = once(child, 'close');
  return {child, done, output: () => output};
}
test('extracted launcher check verifies files without creating a workspace and rejects corruption or missing files', {timeout: 10000}, async t => {
  const {root, extracted, store} = await extractedFixture(t);
  const checked = launch(extracted, store, ['--check']);
  assert.deepEqual(await checked.done, [0, null]); assert.match(checked.output(), /Package check passed/);
  await assert.rejects(readFile(store), {code: 'ENOENT'});
  await writeFile(join(extracted, 'dist/assets/app.js'), 'corrupted');
  const corrupt = launch(extracted, store, ['--check']);
  assert.equal((await corrupt.done)[0], 1); assert.match(corrupt.output(), /Package file has changed: dist\/assets\/app.js/);
  await assert.rejects(readFile(store), {code: 'ENOENT'});
  await rm(join(extracted, 'dist/assets/app.js'));
  const missing = launch(extracted, store, ['--no-open']);
  assert.equal((await missing.done)[0], 1); assert.match(missing.output(), /Package file is missing/);
  await assert.rejects(readFile(store), {code: 'ENOENT'});
});
test('actual extracted launcher serves, saves only in selected path and terminates cleanly', {timeout: 10000}, async t => {
  const {extracted, store} = await extractedFixture(t);
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const running = launch(extracted, store, ['--no-open'], {DESK_PORT: String(port)});
  t.after(() => { if (running.child.exitCode === null) running.child.kill('SIGKILL'); });
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(running.output() || 'Launcher readiness timed out')), 5000);
    running.child.stdout.on('data', () => { if (running.output().includes('Underwriting Desk is ready:')) { clearTimeout(timer); resolveReady(); } });
    running.done.then(([code]) => { clearTimeout(timer); reject(new Error(`Launcher exited before ready: ${code} ${running.output()}`)); });
  });
  const response = await fetch(`http://127.0.0.1:${port}/`); assert.equal(response.status, 200);
  assert.match(await response.text(), /Desk package/); assert.ok((await readFile(store)).length > 0);
  running.child.kill('SIGTERM'); assert.deepEqual(await running.done, [0, null]);
});
test('extracted launcher explains invalid ports before creating any workspace', {timeout: 10000}, async t => {
  const {extracted, store} = await extractedFixture(t);
  const invalid = launch(extracted, store, ['--no-open'], {DESK_PORT: 'not-a-port'});
  assert.equal((await invalid.done)[0], 1); assert.match(invalid.output(), /DESK_PORT must be a whole number/);
  await assert.rejects(readFile(store), {code: 'ENOENT'});
});
test('extracted launcher gives an actionable occupied-port error', {timeout: 10000}, async t => {
  const {extracted, store} = await extractedFixture(t);
  const occupied = createServer(); occupied.listen(0, '127.0.0.1'); await once(occupied, 'listening');
  try {
    const busy = launch(extracted, store, ['--no-open'], {DESK_PORT: String(occupied.address().port)});
    assert.equal((await busy.done)[0], 1); assert.match(busy.output(), /already in use.*Close the other Desk window/);
  } finally { await new Promise(resolve => occupied.close(resolve)); }
});
