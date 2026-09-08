#!/usr/bin/env node
import {homedir} from "node:os";
import {dirname, resolve, join} from "node:path";
import {fileURLToPath} from "node:url";
import {startLocalDesk} from "../mcp-server/local-server.mjs";

const workbenchPath = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const storePath = resolve(process.env.DESK_LOCAL_STORE ?? join(homedir(), ".underwriting-desk", "reviews.sqlite"));
const port = Number(process.env.DESK_PORT ?? 4198);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("DESK_PORT must be between 1024 and 65535");
try {
  const server = await startLocalDesk({workbenchPath, storePath, port});
  console.log(`Underwriting Desk: http://127.0.0.1:${port}\nReview store: ${storePath}\nKeep this window open while using the Desk. Press Ctrl+C to stop.`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
} catch (error) {
  console.error(error.code === "ENOENT" ? "Build the Desk first with pnpm build, then run pnpm desk:start." : `Could not start the Desk: ${error.message}`);
  process.exitCode = 1;
}
