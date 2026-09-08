#!/usr/bin/env node
// This entry point runs before loading node:sqlite so older runtimes get a useful message.
import {homedir} from 'node:os';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('Underwriting Desk needs Node.js 24 or newer. Install the LTS release from https://nodejs.org, then reopen this launcher.');
  process.exit(1);
}
const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.DESK_PORT ?? 4198);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('DESK_PORT must be a whole number between 1024 and 65535.'); process.exit(1);
}
const url = `http://127.0.0.1:${port}`;
try {
  const {checkPackage} = await import('./check-package.mjs');
  const checked = await checkPackage(root);
  console.log(`Package check passed: ${checked.fileCount} files verified. This is an integrity check, not a publisher signature.`);
  if (process.argv.includes('--check')) process.exit(0);
  const {startLocalDesk} = await import('./mcp-server/local-server.mjs');
  const storePath = resolve(process.env.DESK_LOCAL_STORE ?? join(homedir(), '.underwriting-desk', 'reviews.sqlite'));
  const server = await startLocalDesk({workbenchPath: root, storePath, port});
  console.log(`Underwriting Desk is ready: ${url}\nYour workspace stays on this computer: ${storePath}\nKeep this window open. Press Ctrl+C to stop.`);
  if (!process.argv.includes('--no-open')) {
    const opener = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
    const child = spawn(opener[0], opener[1], {stdio: 'ignore', detached: true});
    child.on('error', () => console.log(`Open ${url} in your browser.`)); child.unref();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
} catch (error) {
  console.error(error.code === 'ERR_MODULE_NOT_FOUND' ? 'A package runtime file is missing. Extract the original ZIP again into a new folder.' : error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the other Desk window or choose another DESK_PORT.` : `The Desk could not start: ${error.message}`);
  process.exitCode = 1;
}
