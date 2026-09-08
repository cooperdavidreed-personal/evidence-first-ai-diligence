import {PACKAGE_MAX_BYTES} from "./package-store.mjs";
import {WORKSPACE_MAX_BYTES} from "./workspace-store.mjs";
/** Shared by Vite and the built local workstation. No CORS or remote access. */
export function isLoopbackHost(host) {
  return /^(localhost|127\.0\.0\.1):[0-9]+$/.test(host ?? "");
}
export function createReviewHandler({store, storePath, workbenchPath, workspace = false, packages = false}) {
  return async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const host = req.headers.host ?? "";
      const origin = req.headers.origin;
      if (!isLoopbackHost(host) || req.headers["x-desk-local"] !== "1" || (origin && origin !== `http://${host}`)) {
        res.statusCode = 403; res.end(JSON.stringify({error: "local_origin_required"})); return;
      }
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (packages && req.method === "GET") {
        const digest = url.searchParams.get("digest");
        res.end(JSON.stringify(digest ? store.readPackage(digest) : {packages: store.listPackages(url.searchParams.get("case") ?? undefined)})); return;
      }
      if (workspace && req.method === "GET") {
        const deal = url.searchParams.get("deal");
        if (!deal) throw new Error("workspace_deal_required");
        res.end(JSON.stringify({available: true, workspace: store.workspace(deal)})); return;
      }
      if (req.method === "GET") {
        if (url.searchParams.get("setup") === "1") {
          res.end(JSON.stringify({available: true, workbenchPath, storePath, nodePath: process.execPath, connection: store.connectionStatus()})); return;
        }
        const deal = url.searchParams.get("deal");
        res.end(JSON.stringify(deal ? {response: store.response(deal, url.searchParams.get("digest"))} : {available: true})); return;
      }
      if (req.method !== "POST") {res.statusCode = 405; res.setHeader("Allow", "GET, POST"); res.end("{}"); return;}
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (packages ? PACKAGE_MAX_BYTES * 2 + 10000 : workspace ? WORKSPACE_MAX_BYTES + 1000 : 16000)) throw new Error("review_packet_too_large");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.end(JSON.stringify(packages ? store.archivePackage(body) : workspace ? store.saveWorkspace(body) : store.prepare(body)));
    } catch (error) {
      res.statusCode = error instanceof Error && error.message === "workspace_conflict" ? 409 : 400; res.end(JSON.stringify({error: error instanceof Error ? error.message : "review_failed"}));
    }
  };
}
