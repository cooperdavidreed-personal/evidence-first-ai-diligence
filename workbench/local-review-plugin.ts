import {randomBytes} from "node:crypto";
import {progressHandler} from "./mcp-server/progress-http.mjs";
import type {Plugin} from "vite";
import {resolve} from "node:path";
import {openReviewStore} from "./mcp-server/review-store.mjs";
import {createReviewHandler} from "./mcp-server/review-http.mjs";

export function localReviewPlugin(): Plugin {
  const sessionToken=randomBytes(32).toString("hex");
  return {name: "desk-local-review", transformIndexHtml() {return process.env.DESK_LOCAL_STORE ? [{tag: "script", children: `window.__DESK_LOCAL_RUNTIME__=true;window.__DESK_SESSION__=${JSON.stringify(sessionToken)};`, injectTo: "head-prepend"}] : [];}, configureServer(server) {
    const path = process.env.DESK_LOCAL_STORE;
    if (!path) return;
    const storePath = resolve(path);
    const store = openReviewStore(storePath);
    server.httpServer?.once("close", () => store.close());
    server.middlewares.use("/__desk/progress", progressHandler(store,sessionToken));
    server.middlewares.use("/__desk/packages", createReviewHandler({store, packages: true}));
    server.middlewares.use("/__desk/workspace", createReviewHandler({store, workspace: true}));
    server.middlewares.use("/__desk/review", createReviewHandler({store, storePath, workbenchPath: server.config.root}));
  }};
}
