import {describe, expect, it, vi} from "vitest";
import {createWorkspace, touchWorkspace, validateWorkspace} from "./workspace-state";
import {LocalWorkspaceConflict, LocalWorkspaceRejected, LocalWorkspaceSession} from "./local-workspace";

const initial = () => createWorkspace({caseId: "test", issues: [], memoSections: [], scenarioValues: {growth: "20"}});
const validate = (raw: unknown) => validateWorkspace(raw, "test", new Set(), {fields: {growth: {kind: "NUMBER", min: 0, max: 100}}});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status});
describe("local analyst workspace", () => {
  it("invokes the native fetch adapter without using the session as its receiver", async () => {
    const request = vi.fn(function(this: unknown) {
      if (this instanceof LocalWorkspaceSession) throw new TypeError("Illegal invocation");
      return Promise.resolve(json({workspace: {version: 1, state: initial()}}));
    });
    vi.stubGlobal("fetch", request);
    try {expect((await new LocalWorkspaceSession("test", validate).hydrate(initial(), true)).caseId).toBe("test");}
    finally {vi.unstubAllGlobals();}
  });
  it("hydrates the durable copy without posting the stale browser copy", async () => {
    const remote = touchWorkspace(initial(), {privateNote: "durable"});
    const request = vi.fn().mockResolvedValue(json({workspace: {version: 7, state: remote}}));
    const session = new LocalWorkspaceSession("test", validate, request);
    expect((await session.hydrate(initial(), true)).privateNote).toBe("durable");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].method).toBe("GET");
  });
  it("initializes only an empty store and serializes edits with the previous server version", async () => {
    let version = 0;
    const bodies: Array<{baseVersion: number | null}> = [];
    const request = vi.fn(async (_url, options) => {
      if (options.method === "GET") return json({workspace: null});
      const body = JSON.parse(options.body); bodies.push(body);
      return json({version: ++version, state: body.state});
    });
    const session = new LocalWorkspaceSession("test", validate, request as typeof fetch);
    await session.hydrate(initial(), true);
    await Promise.all([session.save(touchWorkspace(initial(), {privateNote: "one"})), session.save(touchWorkspace(initial(), {privateNote: "two"}))]);
    expect(bodies.map(body => body.baseVersion)).toEqual([null, 1, 2]);
  });
  it("rejects scenario-invalid persisted content without rewriting it", async () => {
    const bad = {...initial(), scenarioValues: {growth: "200"}};
    const request = vi.fn().mockResolvedValue(json({workspace: {version: 1, state: bad}}));
    const session = new LocalWorkspaceSession("test", validate, request);
    await expect(session.hydrate(initial(), true)).rejects.toBeInstanceOf(LocalWorkspaceRejected);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("stops subsequent saves after a version conflict, preserving the winning record", async () => {
    const request = vi.fn().mockResolvedValueOnce(json({workspace: {version: 1, state: initial()}})).mockResolvedValue(json({error: "workspace_conflict"}, 409));
    const session = new LocalWorkspaceSession("test", validate, request);
    await session.hydrate(initial(), true);
    await expect(session.save(touchWorkspace(initial(), {privateNote: "stale"}))).rejects.toBeInstanceOf(LocalWorkspaceConflict);
    await expect(session.save(touchWorkspace(initial(), {privateNote: "must not post"}))).rejects.toThrow(/unresolved save failure/);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("drains already queued writes across navigation and blocks new writes after close", async () => {
    let version = 1;
    const request = vi.fn(async (_url, options) => options.method === "GET" ? json({workspace: {version, state: initial()}}) : json({version: ++version, state: JSON.parse(options.body).state}));
    const session = new LocalWorkspaceSession("test", validate, request as typeof fetch);
    await session.hydrate(initial(), true);
    const first = session.save(touchWorkspace(initial(), {privateNote: "one"}));
    const second = session.save(touchWorkspace(initial(), {privateNote: "two"}));
    expect(session.hasUnsavedWork).toBe(true);
    session.close();
    await Promise.all([first, second]);
    expect(version).toBe(3);
    expect(session.hasUnsavedWork).toBe(false);
    await expect(session.save(initial())).rejects.toThrow(/closed/);
  });

});
