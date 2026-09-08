import {randomBytes} from "node:crypto";
import {progressHandler} from "./progress-http.mjs";
import {createServer} from "node:http";
import {readFile, realpath, stat} from "node:fs/promises";
import {resolve, relative, sep, extname} from "node:path";
import {openReviewStore} from "./review-store.mjs";
import {createReviewHandler, isLoopbackHost} from "./review-http.mjs";

const types = {".mjs": "text/javascript; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".md": "text/plain; charset=utf-8",".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".pdf": "application/pdf", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
const within = (root, file) => {const rel = relative(root, file); return rel !== ".." && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep);};

export async function startLocalDesk({workbenchPath, storePath, port = 4198}) {
  const root = await realpath(resolve(workbenchPath, "dist"));
  await stat(resolve(root, "index.html")); // Fail before opening a store when the build is missing.
  const store = openReviewStore(storePath);
  const review = createReviewHandler({store, storePath: resolve(storePath), workbenchPath: resolve(workbenchPath)});
  const packages = createReviewHandler({store, packages: true});
  const workspace = createReviewHandler({store, workspace: true});
  const sessionToken=randomBytes(32).toString("hex"), progress=progressHandler(store,sessionToken);
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!isLoopbackHost(req.headers.host)) {res.writeHead(403); res.end(); return;}
    const rawPath = (req.url ?? "/").split("?")[0];
    if (rawPath === "/__desk/progress") {await progress(req,res);return;}
    if (rawPath === "/__desk/packages") {await packages(req, res); return;}
    if (rawPath === "/__desk/workspace") {await workspace(req, res); return;}
    if (rawPath === "/__desk/review") {await review(req, res); return;}
    if (req.method !== "GET" && req.method !== "HEAD") {res.writeHead(405); res.end(); return;}
    try {
      const decoded = decodeURIComponent(rawPath);
      if (!decoded.startsWith("/") || decoded.includes("\\") || decoded.includes("\0") || decoded.split("/").some(part => part === ".." || part.startsWith("."))) {res.writeHead(403); res.end(); return;}
      // The app uses hash routes. Never fall back to index.html for unknown file paths.
      const file = await realpath(resolve(root, `.${decoded === "/" ? "/index.html" : decoded}`));
      if (!within(root, file) || extname(file) === ".map") {res.writeHead(403); res.end(); return;}
      let body = await readFile(file);
      if (file === resolve(root, "index.html")) body = Buffer.from(body.toString("utf8").replace("<head>", `<head><script>window.__DESK_LOCAL_RUNTIME__=true;window.__DESK_SESSION__=${JSON.stringify(sessionToken)};</script>`));
      res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Length", body.length);
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {res.writeHead(404); res.end();}
  });
  server.once("close", () => store.close());
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {server.off("error", reject); resolveReady();});
  }).catch(error => {store.close(); throw error;});
  return server;
}
